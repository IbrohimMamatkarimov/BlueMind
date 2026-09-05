import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../_guard";
import { deleteQuestionAdmin, getQuestionByIdAdmin, updateQuestionAdmin } from "@/lib/admin";

// Admin-only full record, including correctAnswer/rationale/explanation —
// these are deliberately NEVER sent to the student-facing exam endpoints
// (a student's browser must not be able to read the answer key mid-exam),
// so the "edit while solving" admin editor fetches them here instead of
// reusing whatever the exam page already has loaded.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const row = await getQuestionByIdAdmin(params.id);
  if (!row) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    section: row.section,
    domain: row.domain,
    skill: row.skill,
    difficulty: row.difficulty,
    passageText: row.passage_text,
    imageData: row.image_data,
    questionText: row.question_text,
    choices: JSON.parse(row.choices) as { id: string; text: string; imageData?: string | null }[],
    correctAnswer: row.correct_answer,
    questionType: row.question_type,
    rationale: row.rationale,
    explanation: row.explanation,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await deleteQuestionAdmin(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}

// Choice text is intentionally NOT required (no .min(1)) — a choice can be
// image-only (imageData set, text left blank), which the exam UI renders
// as just the image with no empty text line beside it.
const ChoiceSchema = z.object({ id: z.string().min(1), text: z.string(), imageData: z.string().nullable().optional() });

// Every field optional — PATCH only writes what's included, so the admin
// edit form can resubmit just the fields that changed.
const UpdateSchema = z.object({
  section: z.enum(["Math", "Reading and Writing"]).optional(),
  domain: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  module: z.union([z.literal(1), z.literal(2)]).optional(),
  modulePool: z.enum(["higher", "lower"]).nullable().optional(),
  passageText: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  questionText: z.string().min(1).optional(),
  choices: z.array(ChoiceSchema).optional(),
  correctAnswer: z.string().min(1).optional(),
  questionType: z.enum(["multiple_choice", "spr"]).optional(),
  rationale: z.string().min(1).optional(),
  explanation: z.string().min(1).optional(),
  estimatedTime: z.number().int().positive().optional(),
  source: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await updateQuestionAdmin(params.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
