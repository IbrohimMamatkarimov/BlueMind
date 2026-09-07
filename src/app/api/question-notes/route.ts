import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getQuestionNote, saveQuestionNote } from "@/lib/question-notes";

const QuestionId = z.string().min(1).max(200);
const SaveSchema = z.object({ questionId: QuestionId, note: z.string().max(4000) });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = QuestionId.safeParse(req.nextUrl.searchParams.get("questionId"));
  if (!parsed.success) return NextResponse.json({ error: "A question is required." }, { status: 400 });
  return NextResponse.json({ note: await getQuestionNote(user.id, parsed.data) });
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
