import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createNotePracticeSet, getNoteQuestion, getQuestionNote, listQuestionNotes, saveQuestionNote } from "@/lib/question-notes";
import type { BankSection } from "@/lib/qbank";

const QuestionId = z.string().min(1).max(200);
const SaveSchema = z.object({ questionId: QuestionId, note: z.string().max(4000) });

function sectionOf(value: unknown): BankSection { return value === "Math" ? "Math" : "Reading and Writing"; }

/** `?questionId=` returns that question's note; without it, every note in
 * `?section=` is listed for the Notebook. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const questionId = req.nextUrl.searchParams.get("questionId");
  if (questionId === null) {
    return NextResponse.json({ notes: await listQuestionNotes(user.id, sectionOf(req.nextUrl.searchParams.get("section"))) });
  }
  const parsed = QuestionId.safeParse(questionId);
  if (!parsed.success) return NextResponse.json({ error: "A question is required." }, { status: 400 });
  if (req.nextUrl.searchParams.get("details") === "1") {
    const question = await getNoteQuestion(user.id, parsed.data);
    if (!question) return NextResponse.json({ error: "That question is no longer available." }, { status: 404 });
    return NextResponse.json({ question });
  }
  return NextResponse.json({ note: await getQuestionNote(user.id, parsed.data) });
}

/** Starts a practice set from questions the learner has notes on. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.questionIds)) return NextResponse.json({ error: "Questions are required" }, { status: 400 });
  const result = await createNotePracticeSet(user.id, sectionOf(body.section), body.questionIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ setId: result.setId, count: result.count,
    href: `/practice/qbank/${encodeURIComponent(result.section)}/${result.setId}` });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save question notes." }, { status: 401 });
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Keep your note under 4,000 characters." }, { status: 400 });
  const result = await saveQuestionNote(user.id, parsed.data.questionId, parsed.data.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ note: result.note });
}
