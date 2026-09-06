import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gradeBankSet } from "@/lib/qbank";
import { db } from "@/lib/db";
import { readSavedGrade, saveStudyResult } from "@/lib/study-history";

// Grades a Question Bank set. `preview: true` only computes the score (the
// exam page's answer-key preview inside Module Review); a real submit
// records every answered question in practice_attempts + skill_stats and
// saves the breakdown on the set for the Review screen.
export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const answers = body && typeof body.answers === "object" && body.answers !== null ? (body.answers as Record<string, string | null>) : null;
  if (!answers) return NextResponse.json({ error: "answers are required" }, { status: 400 });
  const preview = body.preview === true;

  const submissionId = typeof body.submissionId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(body.submissionId) ? body.submissionId : null;
  if (!preview && submissionId) {
    const saved = await readSavedGrade(user.id, submissionId, params.setId);
    if (saved) return NextResponse.json(saved);
  }
  const result = await gradeBankSet(user.id, params.setId, answers, preview, user.isAdmin);
  if (!result) return NextResponse.json({ error: "Practice set not found" }, { status: 404 });
  if (!preview && submissionId) {
    const set = await db.prepare("SELECT title, section, user_id FROM practice_sessions WHERE id = ?").get(params.setId) as { title: string; section: string; user_id: string };
    if (set.user_id === user.id) {
      try {
        const saved = await saveStudyResult({ id: submissionId, userId: user.id, source: "qbank", sourceId: params.setId, title: set.title ?? "Question Bank practice",
          section: set.section, module: null, mode: ["timed", "untimed", "exam"].includes(body.mode) ? body.mode : "timed", fullExamId: null,
          grade: { ...result, results: result.results.map((question) => ({ ...question })) } });
        return NextResponse.json(saved);
      } catch {
        return NextResponse.json({ error: "Your result could not be saved. Please retry submission." }, { status: 503 });
      }
    }
  }
  return NextResponse.json(result);
}
