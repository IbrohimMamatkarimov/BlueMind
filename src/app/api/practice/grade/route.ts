import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { gradePracticeAnswer } from "@/lib/practice";

const BodySchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to practice by category" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await gradePracticeAnswer(user.id, parsed.data.questionId, parsed.data.selectedAnswer);
  if (!result) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  return NextResponse.json(result);
}
