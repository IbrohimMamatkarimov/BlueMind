import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  questionId: string | null;
  sourcePath: string;
  questionNumber: number;
  sourceTitle: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  externalId: string | null;
  contextText: string;
  createdAt: string;
  updatedAt: string;
}

function mapWord(row: Record<string, unknown>): VocabularyWord {
  return {
    id: String(row.id),
    word: String(row.word),
    definition: String(row.definition ?? ""),
    questionId: row.question_id == null ? null : String(row.question_id),
    sourcePath: String(row.source_path),
    questionNumber: Number(row.question_number),
    sourceTitle: String(row.source_title ?? "Practice question"),
    section: row.section == null ? null : String(row.section),
    domain: row.domain == null ? null : String(row.domain),
    skill: row.skill == null ? null : String(row.skill),
    externalId: row.external_id == null ? null : String(row.external_id),
    contextText: String(row.context_text ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const SELECT_WORDS = `
  SELECT vw.id, vw.word, vw.definition, vw.question_id, vw.source_path,
         vw.question_number, vw.created_at, vw.updated_at,
         q.section, q.domain, q.skill, q.external_id,
         CONCAT_WS(' ', NULLIF(q.passage_text, ''), q.question_text) AS context_text,
         COALESCE(m.title,
           CASE WHEN vw.source_path LIKE '/practice/qbank/%' THEN 'Question Bank'
                ELSE 'Practice question' END) AS source_title
  FROM vocabulary_words vw
  LEFT JOIN questions q ON q.id = vw.question_id
  LEFT JOIN mocks m ON m.id = q.mock_id
`;

export async function getVocabularyWords(userId: string) {
  const rows = await db.prepare(`${SELECT_WORDS}
    WHERE vw.user_id = ?
    ORDER BY vw.updated_at DESC, vw.created_at DESC
  `).all(userId) as Record<string, unknown>[];
  const words = rows.map(mapWord);
  return {
    words,
    summary: {
      total: words.length,
      defined: words.filter((item) => item.definition.length > 0).length,
      needsDefinition: words.filter((item) => item.definition.length === 0).length,
    },
  };
}

export async function createVocabularyWord(userId: string, input: {
  word: string;
  definition: string;
  questionId: string;
  sourcePath: string;
  questionNumber: number;
}) {
  const question = await db.prepare("SELECT id FROM questions WHERE id = ?").get(input.questionId);
  if (!question) return { ok: false as const, error: "That question is no longer available." };

  const cleanWord = input.word.trim();
  const cleanDefinition = input.definition.trim();
  const existing = await db.prepare(`
    SELECT id FROM vocabulary_words
    WHERE user_id = ? AND question_id = ? AND LOWER(word) = LOWER(?)
  `).get(userId, input.questionId, cleanWord) as { id?: unknown } | undefined;
  if (existing?.id) {
    if (cleanDefinition) {
      await db.prepare(`
        UPDATE vocabulary_words SET definition = ?,
          updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        WHERE id = ? AND user_id = ?
      `).run(cleanDefinition, String(existing.id), userId);
    }
    const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`)
      .get(String(existing.id), userId) as Record<string, unknown>;
    return { ok: true as const, word: mapWord(row) };
  }

  const id = randomUUID();
  await db.prepare(`
    INSERT INTO vocabulary_words
      (id, user_id, word, definition, question_id, source_path, question_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, cleanWord, cleanDefinition, input.questionId, input.sourcePath, input.questionNumber);

  const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`).get(id, userId) as Record<string, unknown>;
  return { ok: true as const, word: mapWord(row) };
}

export async function updateVocabularyWord(userId: string, id: string, word: string, definition: string) {
  const result = await db.prepare(`
    UPDATE vocabulary_words SET
      word = ?, definition = ?,
      updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHERE id = ? AND user_id = ?
  `).run(word.trim(), definition.trim(), id, userId);
  if (!result.changes) return { ok: false as const, error: "That vocabulary entry was not found." };

  const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`).get(id, userId) as Record<string, unknown>;
  return { ok: true as const, word: mapWord(row) };
}
