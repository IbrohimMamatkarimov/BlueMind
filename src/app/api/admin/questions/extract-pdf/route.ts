import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../_guard";
import { extractQuestions, type ExtractedQuestionDraft } from "@/lib/groq";
import pdfParse from "pdf-parse";

// Runs on the Node runtime (not edge) since pdf-parse needs Node APIs.
export const runtime = "nodejs";
// This can genuinely take minutes for a 50-page PDF (dozens of sequential
// Groq calls). Vercel's Hobby plan caps Serverless Function duration at
// 300s no matter what's set here (300 was the actual max, 800 made the
// whole build fail with "Builder returned invalid maxDuration value") —
// upgrading to Vercel Pro raises that ceiling to 800s if huge PDFs
// genuinely need more time than 300s covers.
export const maxDuration = 300;

const BodySchema = z.object({
  pdfBase64: z.string().min(1),
});

// How many PDF pages go into a single Groq extraction call. Both the input
// (system prompt + page text) and the output (extractQuestions' completion
// budget) share Groq's 8,000 TPM cap on the free tier — 1 page per batch
// keeps input small enough to leave real room for the completion, since a
// single dense SAT page can already need several thousand completion
// tokens once you include choices + rationale + explanation per question.
const PAGES_PER_BATCH = 1;

async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((textContent) => {
        const text = textContent.items.map((item) => item.str).join(" ");
        pages.push(text);
        return text;
      }),
  });
  return pages;
}

// Heuristic detector for an "answer key" page — either the literal phrase,
// or a page that's mostly a dense run of "<number>. <letter>" entries
// (common when a key is laid out as a bare list with no header at all).
function looksLikeAnswerKeyPage(pageText: string): boolean {
  if (/answer\s*key/i.test(pageText)) return true;
  const matches = pageText.match(/\b\d{1,3}\s*[.):]\s*[A-D]\b/g) ?? [];
  // A real question page has at most a handful of these (e.g. one "12. B"
  // choice label); a key page is dozens of them back-to-back relative to
  // its overall length.
  return matches.length >= 15 && matches.length * 6 > pageText.trim().length / 20;
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  let pages: string[];
  try {
    const buffer = Buffer.from(parsed.data.pdfBase64, "base64");
    pages = await extractPdfPages(buffer);
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that PDF — make sure it isn't password-protected or corrupted." },
      { status: 400 }
    );
  }

  const nonEmptyCount = pages.filter((p) => p.trim().length > 0).length;
  if (nonEmptyCount === 0) {
    return NextResponse.json(
      {
        error:
          "No selectable text found in that PDF — it's likely scanned page images rather than real text. " +
          "Try running it through an OCR tool first, or attach individual page screenshots as photos instead.",
      },
      { status: 422 }
    );
  }

  const allQuestions: ExtractedQuestionDraft[] = [];
  const batchErrors: string[] = [];

  // Pull out any page(s) that look like an answer key so their text can be
  // handed to EVERY batch, not just whichever batch happens to contain
  // that page. Without this, a key on page 20 is invisible to the batch
  // processing page 3's questions, since each batch is an independent
  // Groq call that only sees its own slice of the document.
  const answerKeyPages = pages.filter((p) => p.trim() && looksLikeAnswerKeyPage(p));
  const answerKeyText = answerKeyPages.join("\n\n").trim();
  const questionPages = pages.map((p) => (looksLikeAnswerKeyPage(p) ? "" : p));

  for (let i = 0; i < questionPages.length; i += PAGES_PER_BATCH) {
    // Same pacing fix as the paste-text path (extractQuestionsChunked in
    // groq.ts) — sequential batches with no delay were blowing through
    // Groq's free-tier 8,000 TPM cap after a few pages, silently failing
    // every batch after that.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 9000));

    const chunk = questionPages.slice(i, i + PAGES_PER_BATCH);
    let chunkText = chunk.join("\n\n--- PAGE BREAK ---\n\n").trim();
    if (!chunkText) continue;
    if (answerKeyText) {
      chunkText += `\n\n--- ANSWER KEY (applies to this whole document — match each entry to a question by that question's own printed number, e.g. the "14." immediately before it, NOT by its position in this excerpt) ---\n${answerKeyText}`;
    }

    const result = await extractQuestions({ text: chunkText });
    if (result.ok) {
      allQuestions.push(...result.questions);
    } else {
      batchErrors.push(`Pages ${i + 1}-${Math.min(i + PAGES_PER_BATCH, questionPages.length)}: ${result.error}`);
    }
  }

  return NextResponse.json({
    questions: allQuestions,
    pagesProcessed: pages.length,
    batchCount: Math.ceil(pages.length / PAGES_PER_BATCH),
    batchErrors,
  });
}
