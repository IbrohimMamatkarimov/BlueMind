import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const saved = await db.prepare("SELECT title, grade_json FROM study_results WHERE user_id = ? AND id = ?").get(user.id, params.id) as { title: string; grade_json: string } | undefined;
  if (saved) return NextResponse.json({ ...JSON.parse(saved.grade_json), mockTitle: saved.title }, { headers: { "Cache-Control": "private, no-store" } });
  const legacy = await db.prepare(`SELECT m.title, r.correct_count, r.total, r.results_json
    FROM module_results r JOIN mocks m ON m.id = r.mock_id WHERE r.user_id = ? AND r.id = ?
    UNION ALL SELECT title, correct_count, total_count, results_json FROM practice_sessions
    WHERE user_id = ? AND id = ? AND completed_at IS NOT NULL`).get(user.id, params.id, user.id, params.id) as { title: string; correct_count: number; total: number; results_json: string } | undefined;
  if (!legacy) return NextResponse.json({ error: "This saved session was not found." }, { status: 404 });
  return NextResponse.json({ mockTitle: legacy.title, correctCount: legacy.correct_count, total: legacy.total,
    accuracyPct: legacy.total ? Math.round(legacy.correct_count / legacy.total * 100) : 0, results: JSON.parse(legacy.results_json) }, { headers: { "Cache-Control": "private, no-store" } });
}
