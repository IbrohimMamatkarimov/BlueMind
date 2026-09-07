import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  pronunciation: string;
  synonyms: string;
  wordForms: string;
  exampleSentence: string;
  questionId: string | null;
  sourcePath: string;
  questionNumber: number;
  sourceTitle: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  externalId: string | null;
  contextText: string;
  reviewLevel: number;
  reviewCount: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapWord(row: Record<string, unknown>): VocabularyWord {
  return {
    id: String(row.id),
    word: String(row.word),
    definition: String(row.definition ?? ""),
    pronunciation: String(row.pronunciation ?? ""),
    synonyms: String(row.synonyms ?? ""),
    wordForms: String(row.word_forms ?? ""),
    exampleSentence: String(row.example_sentence ?? ""),
    questionId: row.question_id == null ? null : String(row.question_id),
    sourcePath: String(row.source_path),
    questionNumber: Number(row.question_number),
    sourceTitle: String(row.source_title ?? "Practice question"),
    section: row.section == null ? null : String(row.section),
    domain: row.domain == null ? null : String(row.domain),
    skill: row.skill == null ? null : String(row.skill),
    externalId: row.external_id == null ? null : String(row.external_id),
    contextText: String(row.context_text ?? ""),
    reviewLevel: Number(row.review_level ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    nextReviewAt: String(row.next_review_at),
    lastReviewedAt: row.last_reviewed_at == null ? null : String(row.last_reviewed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const SELECT_WORDS = `
  SELECT vw.id, vw.word, vw.definition, vw.pronunciation, vw.synonyms,
         vw.word_forms, vw.example_sentence, vw.question_id, vw.source_path,
         vw.question_number, vw.review_level, vw.review_count,
         vw.next_review_at, vw.last_reviewed_at, vw.created_at, vw.updated_at,
         q.section, q.domain, q.skill, q.external_id,
         CONCAT_WS(' ', NULLIF(q.passage_text, ''), q.question_text) AS context_text,
         COALESCE(m.title, CASE
           WHEN vw.question_id IS NULL THEN 'Personal entry'
           WHEN vw.source_path LIKE '/practice/qbank/%' THEN 'Question Bank'
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
  const now = Date.now();
  return {
    words,
    summary: {
      total: words.length,
      defined: words.filter((item) => item.definition.length > 0).length,
      needsDefinition: words.filter((item) => item.definition.length === 0).length,
      due: words.filter((item) => item.definition.length > 0 && Date.parse(item.nextReviewAt) <= now).length,
    },
  };
}

export async function createVocabularyWord(userId: string, input: {
  word: string;
  definition: string;
  pronunciation?: string;
  synonyms?: string;
  wordForms?: string;
  exampleSentence?: string;
  questionId?: string;
  sourcePath?: string;
  questionNumber?: number;
}) {
  if (input.questionId) {
    const question = await db.prepare("SELECT id FROM questions WHERE id = ?").get(input.questionId);
    if (!question) return { ok: false as const, error: "That question is no longer available." };
  }

  const cleanWord = input.word.trim();
  const cleanDefinition = input.definition.trim();
  const existing = await db.prepare(input.questionId ? `
    SELECT id FROM vocabulary_words
    WHERE user_id = ? AND question_id = ? AND LOWER(word) = LOWER(?)
  ` : `
    SELECT id FROM vocabulary_words
    WHERE user_id = ? AND question_id IS NULL AND LOWER(word) = LOWER(?)
  `).get(...(input.questionId ? [userId, input.questionId, cleanWord] : [userId, cleanWord])) as { id?: unknown } | undefined;
  if (existing?.id) {
    await db.prepare(`
      UPDATE vocabulary_words SET
        definition = COALESCE(NULLIF(?, ''), definition),
        pronunciation = COALESCE(NULLIF(?, ''), pronunciation),
        synonyms = COALESCE(NULLIF(?, ''), synonyms),
        word_forms = COALESCE(NULLIF(?, ''), word_forms),
        example_sentence = COALESCE(NULLIF(?, ''), example_sentence),
        updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      WHERE id = ? AND user_id = ?
    `).run(cleanDefinition, input.pronunciation?.trim() ?? "", input.synonyms?.trim() ?? "",
      input.wordForms?.trim() ?? "", input.exampleSentence?.trim() ?? "", String(existing.id), userId);
    const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`)
      .get(String(existing.id), userId) as Record<string, unknown>;
    return { ok: true as const, word: mapWord(row) };
  }

  const id = randomUUID();
  await db.prepare(`
    INSERT INTO vocabulary_words
      (id, user_id, word, definition, pronunciation, synonyms, word_forms,
       example_sentence, question_id, source_path, question_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, cleanWord, cleanDefinition, input.pronunciation?.trim() ?? "",
    input.synonyms?.trim() ?? "", input.wordForms?.trim() ?? "", input.exampleSentence?.trim() ?? "",
    input.questionId ?? null, input.sourcePath ?? "", input.questionNumber ?? 0);

  const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`).get(id, userId) as Record<string, unknown>;
  return { ok: true as const, word: mapWord(row) };
}

export async function updateVocabularyWord(userId: string, id: string, input: {
  word: string;
  definition: string;
  pronunciation?: string;
  synonyms?: string;
  wordForms?: string;
  exampleSentence?: string;
}) {
  const result = await db.prepare(`
    UPDATE vocabulary_words SET
      word = ?, definition = ?, pronunciation = COALESCE(?, pronunciation),
      synonyms = COALESCE(?, synonyms), word_forms = COALESCE(?, word_forms),
      example_sentence = COALESCE(?, example_sentence),
      updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHERE id = ? AND user_id = ?
  `).run(input.word.trim(), input.definition.trim(), input.pronunciation?.trim() ?? null,
    input.synonyms?.trim() ?? null, input.wordForms?.trim() ?? null, input.exampleSentence?.trim() ?? null,
    id, userId);
  if (!result.changes) return { ok: false as const, error: "That vocabulary entry was not found." };

  const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`).get(id, userId) as Record<string, unknown>;
  return { ok: true as const, word: mapWord(row) };
}

export type VocabularyRating = "again" | "hard" | "got_it";

export async function reviewVocabularyWord(userId: string, id: string, rating: VocabularyRating) {
  const current = await db.prepare(`
    SELECT review_level FROM vocabulary_words WHERE id = ? AND user_id = ?
  `).get(id, userId) as { review_level?: unknown } | undefined;
  if (!current) return { ok: false as const, error: "That vocabulary entry was not found." };

  const oldLevel = Number(current.review_level ?? 0);
  const nextLevel = rating === "again" ? 0 : rating === "hard" ? Math.max(1, oldLevel) : Math.min(6, oldLevel + 1);
  const intervals = [0, 1, 3, 7, 14, 30, 60];
  const minutes = rating === "again" ? 10 : rating === "hard" ? Math.max(1, intervals[nextLevel]) * 0.5 * 1440 : intervals[nextLevel] * 1440;
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + minutes * 60_000).toISOString();

  await db.prepare(`
    UPDATE vocabulary_words SET review_level = ?, review_count = review_count + 1,
      last_reviewed_at = ?, next_review_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(nextLevel, now.toISOString(), nextReviewAt, now.toISOString(), id, userId);
  const row = await db.prepare(`${SELECT_WORDS} WHERE vw.id = ? AND vw.user_id = ?`).get(id, userId) as Record<string, unknown>;
  return { ok: true as const, word: mapWord(row) };
}
