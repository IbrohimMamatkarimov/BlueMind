import { db } from "./db";
import { createBankSet, normalizeFilters, type BankSection } from "./qbank";

export interface NotebookNote {
  questionId: string;
  externalId: string | null;
  section: BankSection;
  domain: string;
  skill: string;
  difficulty: string;
  questionText: string;
  source: string;
  note: string;
  updatedAt: string;
}

export async function getQuestionNote(userId: string, questionId: string) {
  const row = await db.prepare(`
    SELECT note, updated_at FROM question_notes WHERE user_id = ? AND question_id = ?
  `).get(userId, questionId) as { note?: unknown; updated_at?: unknown } | undefined;
  return row ? { note: String(row.note ?? ""), updatedAt: String(row.updated_at) } : null;
}

/** Every note the learner has written on questions in one section, newest
 * first — the Notebook's "My notes" tab. */
export async function listQuestionNotes(userId: string, section: BankSection): Promise<NotebookNote[]> {
  const rows = (await db.prepare(`
    SELECT n.question_id, n.note, n.updated_at, q.external_id, q.section, q.domain,
           q.skill, q.difficulty, q.question_text, q.mock_id
    FROM question_notes n
    JOIN questions q ON q.id = n.question_id
    WHERE n.user_id = ? AND q.section = ?
    ORDER BY n.updated_at DESC
  `).all(userId, section)) as Record<string, unknown>[];
  return rows.map((row) => ({
    questionId: String(row.question_id), externalId: row.external_id ? String(row.external_id) : null,
    section: row.section === "Math" ? "Math" : "Reading and Writing",
    domain: String(row.domain), skill: String(row.skill), difficulty: String(row.difficulty),
    questionText: String(row.question_text), source: row.mock_id ? "Mock Test" : "Question Bank",
    note: String(row.note), updatedAt: String(row.updated_at),
  }));
}

export async function saveQuestionNote(userId: string, questionId: string, note: string) {
  const question = await db.prepare("SELECT id FROM questions WHERE id = ?").get(questionId);
  if (!question) return { ok: false as const, error: "That question is no longer available." };
  const cleanNote = note.trim();
  if (!cleanNote) {
    await db.prepare("DELETE FROM question_notes WHERE user_id = ? AND question_id = ?").run(userId, questionId);
    return { ok: true as const, note: null };
  }
  const row = await db.prepare(`
    INSERT INTO question_notes (user_id, question_id, note) VALUES (?, ?, ?)
    ON CONFLICT (user_id, question_id) DO UPDATE SET note = EXCLUDED.note,
      updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    RETURNING note, updated_at
  `).get(userId, questionId, cleanNote) as Record<string, unknown>;
  return { ok: true as const, note: { note: String(row.note), updatedAt: String(row.updated_at) } };
}

/** Starts a practice set from questions the learner has written notes on. */
export async function createNotePracticeSet(userId: string, section: BankSection, requestedIds: string[]) {
  const notes = await listQuestionNotes(userId, section);
  const allowed = new Set(notes.map((item) => item.questionId));
  const ids = Array.from(new Set(requestedIds)).filter((id) => allowed.has(id));
  if (!ids.length) return { ok: false as const, error: "Choose at least one question you have a note on." };
  return createBankSet(userId, { filters: normalizeFilters({ section }), count: ids.length, shuffle: false,
    questionIds: ids, title: "Notebook notes review", allowMockQuestions: true });
}
