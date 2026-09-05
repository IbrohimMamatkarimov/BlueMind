import { NextRequest, NextResponse } from "next/server";
import { askCoach, type AskCoachParams } from "@/lib/groq";
import { getCurrentUser } from "@/lib/auth";

// Coach requires sign-in (guests get a locked state in the UI pointing them
// to /login). Route path is still "public" for historical reasons — not
// because it's open — kept as-is to avoid touching every caller.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.mode) {
    return NextResponse.json({ error: "mode is required" }, { status: 400 });
  }

  const params: AskCoachParams = {
    mode: body.mode,
    questionText: body.questionText,
    choices: body.choices,
    correctAnswer: body.correctAnswer,
    studentAnswer: body.studentAnswer,
    skill: body.skill,
    difficulty: body.difficulty,
    userMessage: body.userMessage,
    examMode: !!body.examMode,
  };

  const result = await askCoach(params);
  return NextResponse.json(result.data);
}
