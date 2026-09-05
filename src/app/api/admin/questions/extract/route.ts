import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../_guard";
import { extractQuestions, extractQuestionsChunked } from "@/lib/groq";

// Admin-only. Takes raw text and/or a photo and asks the AI to turn it into
// draft questions matching BlueMind's schema. Returns the drafts WITHOUT
// saving anything — the admin dashboard shows them for review/editing, and
// only the ones the admin approves get sent to POST /api/admin/questions.
const BodySchema = z.object({
  text: z.string().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
});

// Above this length, a single Groq call reliably runs out of completion
// budget trying to write out every question in one response and silently
// returns zero questions — route through the same batching extract-pdf
// uses instead. Roughly the size of ~4-5 fully written SAT questions.
const CHUNK_THRESHOLD_CHARS = 3500;

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const text = parsed.data.text?.trim();
  if (!text && !parsed.data.imageBase64) {
    return NextResponse.json({ error: "Provide text or an image to extract from" }, { status: 400 });
  }

  // Photos and short text pastes: original single-call path, unchanged.
  if (!text || text.length < CHUNK_THRESHOLD_CHARS) {
    const result = await extractQuestions(parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ questions: result.questions });
  }

  // Large paste (e.g. a whole module) — split into small batches so each
  // Groq call has room to actually write out its questions, and make sure
  // a trailing answer key is visible to every batch, not just whichever
  // one happens to contain it.
  const { questions, batchCount, batchErrors } = await extractQuestionsChunked(text);
  if (questions.length === 0) {
    return NextResponse.json(
      {
        error: batchErrors.length
          ? `No questions were extracted — every batch failed:\n${batchErrors.join("\n")}`
          : "AI scanned the text but couldn't find anything it recognized as a question. This can happen with heavily fragmented text (e.g. only a few answer choices with no visible question stem nearby) or unusual formatting. Try pasting a larger excerpt that includes the full question, or use the PDF/photo upload instead.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ questions, batchCount, batchErrors });
}
