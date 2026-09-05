import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../_guard";
import { listQuestionsForMock, listStandaloneQuestions, addQuestionAdmin, insertQuestionAdminAfter, type QuestionInput } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const mockId = req.nextUrl.searchParams.get("mockId");
  // No mockId — standalone Practice Question Bank content (mock_id IS NULL).
  if (!mockId) return NextResponse.json({ questions: await listStandaloneQuestions() });
  return NextResponse.json({ questions: await listQuestionsForMock(mockId) });
}

const ChoiceSchema = z.object({ id: z.string().min(1), text: z.string(), imageData: z.string().nullable().optional() });

const QuestionSchema = z.object({
  // Omit/null for standalone Practice Question Bank content not tied to
  // any specific mock.
  mockId: z.string().min(1).nullable().optional(),
  section: z.enum(["Math", "Reading and Writing"]),
  domain: z.string().min(1),
  skill: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  module: z.union([z.literal(1), z.literal(2)]),
  modulePool: z.enum(["higher", "lower"]).nullable().optional(),
  passageText: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  questionText: z.string().min(1),
  // No minimum length enforced here on purpose — a multiple-choice
  // question that came out of extraction with 0 or 1 choices (a genuine
  // AI slip) used to get hard-rejected, blocking that import entirely.
  // It's better broken-but-in-the-bank than blocked: it imports as-is and
  // shows up incomplete in the admin's question list, fixable via Edit,
  // rather than never making it in at all.
  choices: z.array(ChoiceSchema),
  // Empty string allowed on purpose: AI extraction sometimes can't
  // determine a correct answer (no answer key in the source, or an
  // ambiguous match), and blocking import entirely for that one question
  // used to hold up an entire approved batch. It imports with a blank
  // answer instead, flagged for the admin to fill in later via Edit —
  // grading simply treats a blank correctAnswer as "nothing can match"
  // rather than crashing on it.
  correctAnswer: z.string(),
  questionType: z.enum(["multiple_choice", "spr"]),
  rationale: z.string().min(1),
  explanation: z.string().min(1),
  estimatedTime: z.number().int().positive().optional(),
  source: z.string().optional(),
});

// Accepts either a single question object, or { questions: [...] } for bulk import.

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body — expected a question object or { questions: [...] }" }, { status: 400 });
  }

  // Validated per-item (not via z.union against the whole body) on purpose:
  // when a bulk { questions: [...] } payload has even one malformed item,
  // z.union's error reporting collapses to a generic, useless "Invalid
  // input" with no indication of which item or field is the problem.
  // Beyond that: a single bad item used to reject the ENTIRE batch outright
  // (return 400, import nothing) — painful when 21 of 22 pasted questions
  // are perfectly fine and only one has a genuine extraction slip. Now
  // each item is judged independently: valid ones import, invalid ones are
  // skipped and reported by number/field, and the response always reflects
  // exactly what happened rather than all-or-nothing.
  const rawItems: unknown[] = Array.isArray((body as { questions?: unknown }).questions)
    ? (body as { questions: unknown[] }).questions
    : [body];

  const items: QuestionInput[] = [];
  const itemErrors: { index: number; message: string }[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const result = QuestionSchema.safeParse(rawItems[i]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path?.length ? issue.path.join(".") : "(root)";
      itemErrors.push({ index: i, message: `field "${path}" — ${issue?.message ?? "invalid"}` });
      continue;
    }
    items.push({ ...result.data, mockId: result.data.mockId ?? null });
  }

  if (items.length === 0) {
    return NextResponse.json(
      {
        error:
          itemErrors.length === 1
            ? `Question ${itemErrors[0].index + 1} of ${rawItems.length}: ${itemErrors[0].message}`
            : `All ${rawItems.length} question(s) failed validation — nothing was imported.`,
        itemErrors,
      },
      { status: 400 }
    );
  }

  // "Insert a question I forgot / AI skipped" — admin-facing fix for AI
  // extraction dropping a question mid-batch, which otherwise permanently
  // shifts every later question's number by one. Only meaningful for a
  // single question, not a bulk import, so it's ignored (falls through to
  // the normal append-to-end path below) if more than one item was sent.
  const insertAfterId = (body as { insertAfterId?: string | null }).insertAfterId;
  if (insertAfterId !== undefined && items.length === 1) {
    const result = await insertQuestionAdminAfter(insertAfterId, items[0]);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, ids: [result.id], count: 1, skipped: itemErrors.length, itemErrors });
  }

  const ids = await Promise.all(items.map((q) => addQuestionAdmin(q)));
  return NextResponse.json({
    ok: true,
    ids,
    count: ids.length,
    skipped: itemErrors.length,
    itemErrors, // 1-indexed by original position in the submitted array
  });
}
