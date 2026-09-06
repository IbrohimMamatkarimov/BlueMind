import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Signed-in only. Returns the full saved result (score + per-question
// breakdown) for one module, so the Review screen can render it without
// making the student retake the module.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mockId = searchParams.get("mockId");
  const section = searchParams.get("section");
  const moduleNumber = Number(searchParams.get("module"));
  if (!mockId || !section || (moduleNumber !== 1 && moduleNumber !== 2)) {
    return NextResponse.json({ error: "mockId, section, module are required" }, { status: 400 });
  }

  const row = (await db
    .prepare(
      `SELECT mr.correct_count AS "correctCount", mr.total, mr.results_json AS "resultsJson",
              mr.completed_at AS "completedAt", m.title AS "mockTitle"
       FROM module_results mr
       JOIN mocks m ON m.id = mr.mock_id
       WHERE mr.user_id = ? AND mr.mock_id = ? AND mr.section = ? AND mr.module = ?`
    )
    .get(user.id, mockId, section, moduleNumber)) as
    | { correctCount: number; total: number; resultsJson: string; completedAt: string; mockTitle: string }
    | undefined;

  if (!row) return NextResponse.json({ error: "No saved result for this module" }, { status: 404 });

  return NextResponse.json({
    correctCount: row.correctCount,
    total: row.total,
    completedAt: row.completedAt,
    mockTitle: row.mockTitle,
    results: JSON.parse(row.resultsJson),
  });
}
