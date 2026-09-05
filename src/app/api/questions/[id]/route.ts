import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// User-facing single-question fetch — distinct from the admin route, which
// is gated by isAdmin and returns everything including review_status/source.
// This one is for Coach handoff after a mistake: any signed-in student can
// pull the full detail (including correct_answer/rationale) of a question
// they've already answered, so Coach has real context to work with.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const q = db
    .prepare(
      `SELECT id, section, domain, skill, difficulty, passage_text, question_text, choices,
              correct_answer, question_type, rationale, explanation
       FROM questions WHERE id = ?`
    )
    .get(params.id) as any;
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  return NextResponse.json({
    id: q.id,
    section: q.section,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    passageText: q.passage_text ?? null,
    questionText: q.question_text,
    choices: JSON.parse(q.choices),
    correctAnswer: q.correct_answer,
    questionType: q.question_type,
    rationale: q.rationale,
    explanation: q.explanation,
  });
}
