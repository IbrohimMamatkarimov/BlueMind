import { db } from "./db";
import { createBankSet, normalizeFilters } from "./qbank";

/**
 * Shared question links — /q/<questionId>.
 *
 * The Share button on the exam page hands out a link to one Question Bank
 * question. Whoever opens it (signed in) gets that question as a
 * one-question practice set on their own account, so they solve it with
 * the normal Check Answer + explanation flow and their attempt lands in
 * their own history and accuracy colours. Nothing about the sharer travels
 * in the link, and the answer is never exposed to someone who isn't signed
 * in — the landing page shows only the section, skill and difficulty.
 */

export const SHARED_SET_TITLE_PREFIX = "Shared question";

export interface SharedQuestionMeta {
  id: string;
  externalId: string | null;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
}

/** Bank questions only — mock-test questions stay inside their papers. */
export async function getSharedQuestionMeta(questionId: string): Promise<SharedQuestionMeta | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(questionId)) return null;
  const row = (await db
    .prepare(
      `SELECT id, external_id, section, domain, skill, difficulty
       FROM questions WHERE id = ? AND mock_id IS NULL`
    )
    .get(questionId)) as
    | { id: string; external_id: string | null; section: string; domain: string; skill: string; difficulty: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    externalId: row.external_id,
    section: row.section,
    domain: row.domain,
    skill: row.skill,
    difficulty: row.difficulty,
  };
}

function setHref(section: string, setId: string): string {
  return `/practice/qbank/${encodeURIComponent(section)}/${setId}`;
}

/**
 * The exam-page URL for this user's copy of a shared question. Opening the
 * same link again reuses the set it made last time, so a refresh or a
 * second visit returns to the saved progress instead of piling up sets.
 */
export async function openSharedQuestionSet(userId: string, meta: SharedQuestionMeta): Promise<string | null> {
  const existing = (await db
    .prepare(
      `SELECT id, section FROM practice_sessions
       WHERE user_id = ? AND type = 'qbank' AND question_ids = ? AND title LIKE ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, JSON.stringify([meta.id]), `${SHARED_SET_TITLE_PREFIX}%`)) as { id: string; section: string | null } | undefined;
  if (existing) return setHref(existing.section ?? meta.section, existing.id);

  const result = await createBankSet(userId, {
    filters: normalizeFilters({ section: meta.section }),
    count: 1,
    shuffle: false,
    questionIds: [meta.id],
    // The exam header turns the first " · " into ": " →
    // "Shared question: Boundaries · Hard", like "Question Bank: Boundaries · Hard".
    title: `${SHARED_SET_TITLE_PREFIX} · ${meta.skill} · ${meta.difficulty}`,
  });
  return result.ok ? setHref(result.section, result.setId) : null;
}
