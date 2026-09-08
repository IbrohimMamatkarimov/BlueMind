import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { StudyEntry } from "@/lib/progress-summary";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    // Old data contains the latest module/set snapshot only. Include it when
    // there is no new history for that session; never invent past retakes.
    const rows = await db.prepare(`WITH history AS (
      SELECT id, source, source_id, title, section, module, mode, full_exam_id,
        correct_count, total, completed_at, (grade_json::jsonb)->'results' AS questions
      FROM study_results WHERE user_id = ?
      UNION ALL
      SELECT r.id, 'mock', r.mock_id, m.title, r.section, r.module, 'practice', NULL,
        r.correct_count, r.total, r.completed_at, r.results_json::jsonb
      FROM module_results r JOIN mocks m ON m.id = r.mock_id
      WHERE r.user_id = ? AND NOT EXISTS (SELECT 1 FROM study_results h
        WHERE h.user_id = r.user_id AND h.source = 'mock' AND h.source_id = r.mock_id AND h.section = r.section AND h.module = r.module)
      UNION ALL
      SELECT p.id, 'qbank', p.id, COALESCE(p.title, 'Question Bank practice'), p.section, NULL, 'practice', NULL,
        p.correct_count, p.total_count, p.completed_at, COALESCE(p.results_json, '[]')::jsonb
      FROM practice_sessions p WHERE p.user_id = ? AND p.type = 'qbank' AND p.section IN ('Math', 'Reading and Writing') AND p.completed_at IS NOT NULL AND p.total_count > 0
        AND NOT EXISTS (SELECT 1 FROM study_results h WHERE h.user_id = p.user_id AND h.source = 'qbank' AND h.source_id = p.id)
    ) SELECT id, source, source_id AS "sourceId", title, section, module, mode,
      full_exam_id AS "fullExamId", correct_count AS "correctCount", total, completed_at AS "completedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'domain', q->>'domain', 'skill', q->>'skill', 'difficulty', q->>'difficulty',
        'questionType', q->>'questionType', 'isCorrect', q->'isCorrect',
        'timeSpentSeconds', q->'timeSpentSeconds'))
        FROM jsonb_array_elements(questions) q), '[]'::jsonb) AS questions
      FROM history WHERE total > 0 ORDER BY completed_at DESC`)
      .all(user.id, user.id, user.id) as StudyEntry[];
    return NextResponse.json({ entries: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your progress could not be loaded. Please try again." }, { status: 500 });
  }
}
