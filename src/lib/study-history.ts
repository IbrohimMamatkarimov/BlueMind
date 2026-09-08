import { db } from "./db";
import { newId } from "./id";

export interface SavedGrade {
  total: number;
  correctCount: number;
  accuracyPct: number;
  results: { questionId: string; domain?: string; skill: string; difficulty?: string; questionType?: string; isCorrect: boolean; timeSpentSeconds?: number }[];
}
export interface StudyRecord {
  id: string; userId: string; source: "mock" | "qbank"; sourceId: string;
  title: string; section: string; module: number | null; mode: string;
  fullExamId: string | null; grade: SavedGrade;
}

export async function readSavedGrade(userId: string, id: string, sourceId: string, database = db) {
  const row = await database.prepare("SELECT grade_json FROM study_results WHERE user_id = ? AND id = ? AND source_id = ?").get(userId, id, sourceId) as { grade_json: string } | undefined;
  return row ? JSON.parse(row.grade_json) as SavedGrade : null;
}

/** Append one server-graded submission. A retry reuses the id and cannot add a second attempt. */
export async function saveStudyResult(record: StudyRecord, database = db): Promise<SavedGrade> {
  return database.transaction((tx) => writeStudyResult(record, tx));
}

export async function writeStudyResult(record: StudyRecord, tx: Pick<typeof db, "prepare">): Promise<SavedGrade> {
    const inserted = await tx.prepare(`INSERT INTO study_results
      (id, user_id, source, source_id, title, section, module, mode, full_exam_id, correct_count, total, grade_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING`)
      .run(record.id, record.userId, record.source, record.sourceId, record.title, record.section, record.module, record.mode, record.fullExamId, record.grade.correctCount, record.grade.total, JSON.stringify(record.grade));
    if (!inserted.changes) {
      const saved = await tx.prepare("SELECT source_id, section, module, grade_json FROM study_results WHERE user_id = ? AND id = ?").get(record.userId, record.id) as { source_id: string; section: string; module: number | null; grade_json: string };
      if (saved.source_id !== record.sourceId || saved.section !== record.section || saved.module !== record.module) throw new Error("This submission ID belongs to a different session.");
      return JSON.parse(saved.grade_json) as SavedGrade;
    }
    if (record.source === "mock") {
      await tx.prepare(`INSERT INTO module_results (id, user_id, mock_id, section, module, correct_count, total, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, mock_id, section, module)
        DO UPDATE SET correct_count = EXCLUDED.correct_count, total = EXCLUDED.total,
          results_json = EXCLUDED.results_json, completed_at = EXCLUDED.completed_at`)
        .run(newId("mres"), record.userId, record.sourceId, record.section, record.module, record.grade.correctCount, record.grade.total, JSON.stringify(record.grade.results));
    }
    return record.grade;
}
