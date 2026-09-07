import { db } from "./db";

export async function getQuestionNote(userId: string, questionId: string) {
  const row = await db.prepare(`
    SELECT note, updated_at FROM question_notes WHERE user_id = ? AND question_id = ?
  `).get(userId, questionId) as { note?: unknown; updated_at?: unknown } | undefined;
  return row ? { note: String(row.note ?? ""), updatedAt: String(row.updated_at) } : null;
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
