import { NextRequest, NextResponse } from "next/server";
import { getModuleQuestionsPublic } from "@/lib/mock-library";
import { isAnswerCorrect } from "@/lib/spr-grading";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveStudyResult } from "@/lib/study-history";

// Previews and guest grading are read-only. Signed-in submissions save server-graded history.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { mockId, section, module, answers } = body ?? {};

  if (!mockId || !section || (module !== 1 && module !== 2) || answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json({ error: "mockId, section, module, and answers are required" }, { status: 400 });
  }

  if (section !== "Math" && section !== "Reading and Writing") return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  const submissionId = typeof body.submissionId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(body.submissionId) ? body.submissionId : null;
  const user = submissionId && body.preview !== true ? await getCurrentUser() : null;
  const rows = await getModuleQuestionsPublic(mockId, section, module);
  if (rows.length === 0) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  let correctCount = 0;
  const results = rows.map((q) => {
    const selected: string | null = typeof answers[q.id] === "string" ? answers[q.id] : null;
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

  const grade = {
    total: rows.length,
    correctCount,
    accuracyPct: Math.round((correctCount / rows.length) * 100),
    results,
  };
  if (user && submissionId) {
    const mock = await db.prepare("SELECT title FROM mocks WHERE id = ?").get(mockId) as { title: string };
    try {
      const saved = await saveStudyResult({ id: submissionId, userId: user.id, source: "mock", sourceId: mockId,
        title: mock.title, section, module, mode: ["timed", "untimed", "exam"].includes(body.mode) ? body.mode : "timed",
        fullExamId: typeof body.fullExamId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(body.fullExamId) ? body.fullExamId : null, grade });
      return NextResponse.json(saved);
    } catch {
      return NextResponse.json({ error: "Your result could not be saved. Your answers are still here; please retry submission." }, { status: 503 });
    }
  }
  return NextResponse.json(grade);
}
