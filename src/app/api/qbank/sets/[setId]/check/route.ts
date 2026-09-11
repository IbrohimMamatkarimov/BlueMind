import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradePracticeAnswer } from "@/lib/practice";
import { getQuestionAccuracy } from "@/lib/qbank";
import { EMPTY_ACCURACY } from "@/lib/qbank-accuracy";

const BodySchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.string().min(1),
  // Which attempt of this question within the set this check is (1 = the
  // first check, 2 = after one "Try again", …). Repeating a number the set
  // already holds returns the saved result instead of recording again.
  sessionAttempt: z.number().int().min(1).max(10000).optional(),
});

/** Grades and records one Question Bank answer immediately, returning the
 * learner's updated accuracy on that question for the navigator colour. */
export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose an answer before checking." }, { status: 400 });

  const session = (await db
    .prepare("SELECT question_ids FROM practice_sessions WHERE id = ? AND user_id = ? AND type = 'qbank'")
    .get(params.setId, user.id)) as { question_ids: string } | undefined;
  if (!session) return NextResponse.json({ error: "Practice session not found" }, { status: 404 });

  let ids: string[] = [];
  try { ids = JSON.parse(session.question_ids); } catch { /* invalid session */ }
  if (!ids.includes(parsed.data.questionId)) {
    return NextResponse.json({ error: "That question is not part of this session." }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize checks for this session. This makes two simultaneous clicks
      // behave as one attempt, including the skill-stat update.
      await tx.prepare("SELECT id FROM practice_sessions WHERE id = ? AND user_id = ? FOR UPDATE").get(params.setId, user.id);
      const graded = await gradePracticeAnswer(
        user.id, parsed.data.questionId, parsed.data.selectedAnswer.trim(), tx, params.setId, undefined, parsed.data.sessionAttempt ?? 1
      );
      if (!graded) return null;
      const stats = await getQuestionAccuracy(user.id, [parsed.data.questionId], params.setId, tx);
      return { ...graded, stats: stats.get(parsed.data.questionId) ?? EMPTY_ACCURACY };
    });
    if (!result) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Your answer could not be saved. Please try checking it again." }, { status: 503 });
  }
}
