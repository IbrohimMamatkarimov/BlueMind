import { NextRequest, NextResponse } from "next/server";
import { getModuleQuestionsPublic } from "@/lib/mock-library";
import { isAnswerCorrect } from "@/lib/spr-grading";

// Public grading for guest single-module practice. Stateless — computes the
// score from the submitted answers against the DB's correct answers and
// returns full explanations, but writes nothing anywhere. This is what
// keeps "not signed in, nothing saved" true while still giving guests a
// real results view instead of just a raw score.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { mockId, section, module, answers } = body ?? {};

  if (!mockId || !section || (module !== 1 && module !== 2) || typeof answers !== "object") {
    return NextResponse.json({ error: "mockId, section, module, and answers are required" }, { status: 400 });
  }

  const rows = await getModuleQuestionsPublic(mockId, section, module);
  if (rows.length === 0) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  let correctCount = 0;
  const results = rows.map((q) => {
    const selected: string | null = answers[q.id] ?? null;
    // Student-produced-response questions ("grid-ins") accept any
    // mathematically equivalent form — "3/2", "1.5", "6/4", "1 1/2" are all
    // the same answer. Multiple-choice keeps exact choice-id matching.
    const isCorrect = isAnswerCorrect(q.question_type, selected, q.correct_answer);
    if (isCorrect) correctCount += 1;
    return {
      questionId: q.id,
      questionText: q.question_text,
      imageData: q.image_data ?? null,
      choices: JSON.parse(q.choices),
      skill: q.skill,
      difficulty: q.difficulty,
      selectedAnswer: selected,
      correctAnswer: q.correct_answer,
      isCorrect,
      rationale: q.rationale,
      explanation: q.explanation,
    };
  });

  return NextResponse.json({
    total: rows.length,
    correctCount,
    accuracyPct: Math.round((correctCount / rows.length) * 100),
    results,
  });
}
