import { db } from "./db";

export interface SavedGrade {
  total: number;
  correctCount: number;
  accuracyPct: number;
  results: { questionId: string; skill: string; isCorrect: boolean; [key: string]: unknown }[];
}
export interface StudyRecord {
  id: string; userId: string; source: "mock" | "qbank"; sourceId: string;
  title: string; section: string; module: number | null; mode: string;
  fullExamId: string | null; grade: SavedGrade;
}

export async function readSavedGrade(userId: string, id: string, sourceId: string) {
  const row = await db.prepare("SELECT grade_json FROM study_results WHERE user_id = ? AND id = ? AND source_id = ?").get(userId, id, sourceId) as { grade_json: string } | undefined;
  return row ? JSON.parse(row.grade_json) as SavedGrade : null;
}

/** Append one server-graded submission. A retry reuses the id and cannot add a second attempt. */
export async function saveStudyResult(record: StudyRecord): Promise<SavedGrade> {
  return db.transaction(async (tx) => {
    const inserted = await tx.prepare(`INSERT INTO study_results
      (id, user_id, source, source_id, title, section, module, mode, full_exam_id, correct_count, total, grade_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING`)
      .run(record.id, record.userId, record.source, record.sourceId, record.title, record.section, record.module, record.mode, record.fullExamId, record.grade.correctCount, record.grade.total, JSON.stringify(record.grade));
    if (!inserted.changes) {
      const saved = await tx.prepare("SELECT source_id, grade_json FROM study_results WHERE user_id = ? AND id = ?").get(record.userId, record.id) as { source_id: string; grade_json: string };
      if (saved.source_id !== record.sourceId) throw new Error("This submission ID belongs to a different session.");
      return JSON.parse(saved.grade_json) as SavedGrade;
    }
    if (record.source === "mock") {
      await tx.prepare(`INSERT INTO module_results (id, user_id, mock_id, section, module, correct_count, total, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, mock_id, section, module)
        DO UPDATE SET correct_count = EXCLUDED.correct_count, total = EXCLUDED.total,
          results_json = EXCLUDED.results_json, completed_at = EXCLUDED.completed_at`)
        .run(record.id, record.userId, record.sourceId, record.section, record.module, record.grade.correctCount, record.grade.total, JSON.stringify(record.grade.results));
    }
    return record.grade;
  });
}
