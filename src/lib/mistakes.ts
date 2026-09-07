import { db } from "./db";
import { createBankSet, normalizeFilters, type BankSection } from "./qbank";

export interface MistakeRow {
  questionId: string;
  externalId: string | null;
  section: BankSection;
  domain: string;
  skill: string;
  difficulty: string;
  questionText: string;
  questionType: string;
  mistakeCount: number;
  attemptCount: number;
  latestCorrect: boolean;
  lastAttemptAt: string;
  lastMissedAt: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  source: string;
  journal: MistakeJournalEntry | null;
}

export interface MistakeJournalEntry {
  reason: string;
  warning: string;
  category: MistakeCategory;
  updatedAt: string;
}

export type MistakeCategory = "unclassified" | "concept_gap" | "careless_error" | "misread_question" | "timing_issue" | "strategy_issue";

export interface MistakeSkill {
  skill: string;
  domain: string;
  attempted: number;
  correct: number;
  mistakes: number;
  accuracyPct: number;
}

const EVENTS_SQL = `
  SELECT pa.question_id, pa.selected_answer,
         COALESCE(pa.correct_answer, q.correct_answer) AS correct_answer,
         pa.is_correct, pa.created_at, 'Question Bank' AS source
  FROM practice_attempts pa
  JOIN questions q ON q.id = pa.question_id
  WHERE pa.user_id = ?
  UNION ALL
  SELECT result->>'questionId' AS question_id,
         NULLIF(result->>'selectedAnswer', 'null') AS selected_answer,
         result->>'correctAnswer' AS correct_answer,
         CASE WHEN result->>'isCorrect' = 'true' THEN 1 ELSE 0 END AS is_correct,
         sr.completed_at AS created_at, 'Mock Test' AS source
  FROM study_results sr
  CROSS JOIN LATERAL jsonb_array_elements((sr.grade_json::jsonb)->'results') AS result
  WHERE sr.user_id = ? AND sr.source = 'mock'
  UNION ALL
  SELECT a.question_id, a.selected_answer, a.correct_answer,
         a.is_correct, a.created_at, 'Mock Test' AS source
  FROM answers a
  JOIN attempts att ON att.id = a.attempt_id
  WHERE att.user_id = ? AND att.status = 'completed'
`;

export async function getMistakes(userId: string, section: BankSection) {
  const rows = (await db.prepare(`
    WITH events AS (${EVENTS_SQL}),
    missed AS (
      SELECT question_id, COUNT(*) AS attempt_count,
             SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS mistake_count,
             MAX(CASE WHEN is_correct = 0 THEN created_at ELSE NULL END) AS last_missed_at
      FROM events GROUP BY question_id
      HAVING SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) > 0
    ),
    latest AS (
      SELECT DISTINCT ON (question_id) question_id, selected_answer, correct_answer,
             is_correct, created_at, source
      FROM events ORDER BY question_id, created_at DESC
    )
    SELECT q.id AS question_id, q.external_id, q.section, q.domain, q.skill,
           q.difficulty, q.question_text, q.question_type,
           missed.mistake_count, missed.attempt_count, missed.last_missed_at,
           latest.is_correct AS latest_correct, latest.created_at AS last_attempt_at,
           latest.selected_answer, latest.correct_answer, latest.source,
           journal.reason AS journal_reason, journal.warning AS journal_warning,
           journal.category AS journal_category,
           journal.updated_at AS journal_updated_at
    FROM missed
    JOIN latest ON latest.question_id = missed.question_id
    JOIN questions q ON q.id = missed.question_id
    LEFT JOIN mistake_journal_entries journal
      ON journal.question_id = q.id AND journal.user_id = ?
    WHERE q.section = ?
    ORDER BY latest.is_correct ASC, missed.mistake_count DESC, latest.created_at DESC
  `).all(userId, userId, userId, userId, section)) as Record<string, unknown>[];

  const mistakes: MistakeRow[] = rows.map((row) => ({
    questionId: String(row.question_id), externalId: row.external_id ? String(row.external_id) : null,
    section: row.section === "Math" ? "Math" : "Reading and Writing",
    domain: String(row.domain), skill: String(row.skill), difficulty: String(row.difficulty),
    questionText: String(row.question_text), questionType: String(row.question_type),
    mistakeCount: Number(row.mistake_count), attemptCount: Number(row.attempt_count),
    latestCorrect: Number(row.latest_correct) === 1, lastAttemptAt: String(row.last_attempt_at),
    lastMissedAt: String(row.last_missed_at), selectedAnswer: row.selected_answer == null ? null : String(row.selected_answer),
    correctAnswer: String(row.correct_answer), source: String(row.source),
    journal: row.journal_updated_at == null ? null : {
      reason: String(row.journal_reason ?? ""), warning: String(row.journal_warning ?? ""),
      category: String(row.journal_category ?? "unclassified") as MistakeCategory,
      updatedAt: String(row.journal_updated_at),
    },
  }));

  const skillRows = (await db.prepare(`
    WITH events AS (${EVENTS_SQL})
    SELECT q.domain, q.skill, COUNT(*) AS attempted,
           SUM(CASE WHEN e.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
           SUM(CASE WHEN e.is_correct = 0 THEN 1 ELSE 0 END) AS mistakes
    FROM events e JOIN questions q ON q.id = e.question_id
    WHERE q.section = ?
    GROUP BY q.domain, q.skill
    ORDER BY (SUM(CASE WHEN e.is_correct = 1 THEN 1 ELSE 0 END)::float / COUNT(*)) ASC, COUNT(*) DESC
  `).all(userId, userId, userId, section)) as Record<string, unknown>[];

  const skills: MistakeSkill[] = skillRows.map((row) => {
    const attempted = Number(row.attempted); const correct = Number(row.correct);
    return { domain: String(row.domain), skill: String(row.skill), attempted, correct,
      mistakes: Number(row.mistakes), accuracyPct: attempted ? Math.round((correct / attempted) * 100) : 0 };
  });

  return { mistakes, skills, summary: { total: mistakes.length,
    needsReview: mistakes.filter((item) => !item.latestCorrect).length,
    improved: mistakes.filter((item) => item.latestCorrect).length,
    repeated: mistakes.filter((item) => item.mistakeCount > 1).length } };
}

export async function saveMistakeJournalEntry(
  userId: string,
  section: BankSection,
  questionId: string,
  reason: string,
  warning: string,
  category: MistakeCategory,
) {
  const notebook = await getMistakes(userId, section);
  if (!notebook.mistakes.some((item) => item.questionId === questionId)) {
    return { ok: false as const, error: "That question is not in your mistakes notebook." };
  }

  const cleanReason = reason.trim();
  const cleanWarning = warning.trim();
  if (!cleanReason && !cleanWarning && category === "unclassified") {
    await db.prepare("DELETE FROM mistake_journal_entries WHERE user_id = ? AND question_id = ?")
      .run(userId, questionId);
    return { ok: true as const, entry: null };
  }

  const row = await db.prepare(`
    INSERT INTO mistake_journal_entries (user_id, question_id, reason, warning, category)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, question_id) DO UPDATE SET
      reason = EXCLUDED.reason,
      warning = EXCLUDED.warning,
      category = EXCLUDED.category,
      updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    RETURNING reason, warning, category, updated_at
  `).get(userId, questionId, cleanReason, cleanWarning, category) as Record<string, unknown>;

  return { ok: true as const, entry: {
    reason: String(row.reason), warning: String(row.warning), category: String(row.category) as MistakeCategory,
    updatedAt: String(row.updated_at),
  } };
}

export async function createMistakePracticeSet(userId: string, section: BankSection, requestedIds: string[]) {
  const notebook = await getMistakes(userId, section);
  const allowed = new Set(notebook.mistakes.map((item) => item.questionId));
  const ids = Array.from(new Set(requestedIds)).filter((id) => allowed.has(id));
  if (!ids.length) return { ok: false as const, error: "Choose at least one question from your notebook." };
  return createBankSet(userId, { filters: normalizeFilters({ section }), count: ids.length, shuffle: false,
    questionIds: ids, title: "Mistakes Notebook review", allowMockQuestions: true });
}
