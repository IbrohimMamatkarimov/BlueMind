import { db } from "./db";
import { DOMAINS } from "./sat-constants";
import { newId } from "./id";
import { isAnswerCorrect } from "./spr-grading";

/**
 * "Practice by category" — separate from the timed Mock flow. Lets a
 * signed-in student drill a specific skill (e.g. "Linear Equations") across
 * every question in the bank tagged with it, regardless of which mock it
 * came from. Answers/rationale are never sent to the client until grading.
 */

export interface SkillCount {
  domain: string;
  skill: string;
  section: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  attempted: number;
  correct: number;
}

export async function getPracticeCounts(userId?: string): Promise<SkillCount[]> {
  const rows = (await db
    .prepare(
      `SELECT domain, skill, section, difficulty, COUNT(*) as total
       FROM questions
       GROUP BY domain, skill, section, difficulty`
    )
    .all()) as { domain: string; skill: string; section: string; difficulty: string; total: number }[];

  // Zero-fill skills with no banked questions yet so the UI can show every
  // official skill, not just the ones that happen to have content.
  const bySkill = new Map<string, { total: number; easy: number; medium: number; hard: number }>();
  for (const r of rows) {
    const key = `${r.section}::${r.skill}`;
    const entry = bySkill.get(key) ?? { total: 0, easy: 0, medium: 0, hard: 0 };
    entry.total += r.total;
    if (r.difficulty === "Easy") entry.easy += r.total;
    if (r.difficulty === "Medium") entry.medium += r.total;
    if (r.difficulty === "Hard") entry.hard += r.total;
    bySkill.set(key, entry);
  }

  const statsBySkill = new Map<string, { attempted: number; correct: number }>();
  if (userId) {
    const statRows = (await db
      .prepare(`SELECT skill, attempted, correct FROM skill_stats WHERE user_id = ?`)
      .all(userId)) as { skill: string; attempted: number; correct: number }[];
    for (const s of statRows) statsBySkill.set(s.skill, { attempted: s.attempted, correct: s.correct });
  }

  const out: SkillCount[] = [];
  for (const [domain, meta] of Object.entries(DOMAINS)) {
    for (const skill of meta.skills) {
      const entry = bySkill.get(`${meta.section}::${skill}`) ?? { total: 0, easy: 0, medium: 0, hard: 0 };
      const stat = statsBySkill.get(skill) ?? { attempted: 0, correct: 0 };
      out.push({ domain, skill, section: meta.section, ...entry, ...stat });
    }
  }
  return out;
}

export interface PracticeQuestionPublic {
  id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  passageText: string | null;
  questionText: string;
  choices: { id: string; text: string }[];
  questionType: string;
}

/** Pulls up to `limit` questions for a skill, answers/rationale stripped.
 * `difficulty` optionally restricts to one of Easy/Medium/Hard; omitted/"" means mixed. */
export async function getPracticeQuestions(skill: string, limit = 10, difficulty?: string): Promise<PracticeQuestionPublic[]> {
  const rows = (difficulty
    ? await db
        .prepare(
          `SELECT id, section, domain, skill, difficulty, passage_text, question_text, choices, question_type
           FROM questions WHERE skill = ? AND difficulty = ? ORDER BY RANDOM() LIMIT ?`
        )
        .all(skill, difficulty, limit)
    : await db
        .prepare(
          `SELECT id, section, domain, skill, difficulty, passage_text, question_text, choices, question_type
           FROM questions WHERE skill = ? ORDER BY RANDOM() LIMIT ?`
        )
        .all(skill, limit)) as any[];

  return rows.map((q) => ({
    id: q.id,
    section: q.section,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    passageText: q.passage_text ?? null,
    questionText: q.question_text,
    choices: JSON.parse(q.choices),
    questionType: q.question_type,
  }));
}

export interface MultiPracticeParams {
  skills: string[];
  difficulties: string[]; // subset of Easy/Medium/Hard; empty = all
  limit: number;
  shuffle: boolean;
  excludeSeenUserId?: string; // if set, skip questions this user already has an answer row for
}

/** Combined-pool version of getPracticeQuestions — powers the "Practice by
 * Category" multi-select picker (any mix of skills across both sections,
 * any mix of difficulties, optional shuffle, optional "exclude questions
 * I've already seen"). */
export async function getPracticeQuestionsMulti(params: MultiPracticeParams): Promise<PracticeQuestionPublic[]> {
  const { skills, difficulties, limit, shuffle, excludeSeenUserId } = params;
  if (skills.length === 0) return [];

  const clauses: string[] = [`skill IN (${skills.map(() => "?").join(",")})`];
  const args: unknown[] = [...skills];

  if (difficulties.length > 0) {
    clauses.push(`difficulty IN (${difficulties.map(() => "?").join(",")})`);
    args.push(...difficulties);
  }

  if (excludeSeenUserId) {
    clauses.push(
      `id NOT IN (SELECT a.question_id FROM answers a JOIN attempts att ON att.id = a.attempt_id WHERE att.user_id = ?)`
    );
    args.push(excludeSeenUserId);
  }

  const order = shuffle ? "ORDER BY RANDOM()" : "ORDER BY skill, id";
  args.push(limit);

  const rows = (await db
    .prepare(
      `SELECT id, section, domain, skill, difficulty, passage_text, question_text, choices, question_type
       FROM questions WHERE ${clauses.join(" AND ")} ${order} LIMIT ?`
    )
    .all(...args)) as any[];

  return rows.map((q) => ({
    id: q.id,
    section: q.section,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    passageText: q.passage_text ?? null,
    questionText: q.question_text,
    choices: JSON.parse(q.choices),
    questionType: q.question_type,
  }));
}

export interface GradePracticeResult {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string;
  rationale: string;
  explanation: string;
}

/**
 * Grades a single practice answer and rolls the result into skill_stats
 * (upserted per user+skill) so the dashboard's skill breakdown stays live
 * without a separate batch job.
 */
export async function gradePracticeAnswer(
  userId: string,
  questionId: string,
  selectedAnswer: string | null
): Promise<GradePracticeResult | null> {
  const q = (await db
    .prepare(
      `SELECT id, section, domain, skill, difficulty, correct_answer, rationale, explanation, question_type
       FROM questions WHERE id = ?`
    )
    .get(questionId)) as
    | {
        id: string;
        section: string;
        domain: string;
        skill: string;
        difficulty: string;
        correct_answer: string;
        rationale: string;
        explanation: string;
        question_type: string;
      }
    | undefined;
  if (!q) return null;

  const isCorrect = isAnswerCorrect(q.question_type, selectedAnswer, q.correct_answer);

  const existing = (await db
    .prepare("SELECT id, correct, attempted FROM skill_stats WHERE user_id = ? AND skill = ?")
    .get(userId, q.skill)) as { id: string; correct: number; attempted: number } | undefined;

  if (existing) {
    await db
      .prepare(
        `UPDATE skill_stats SET correct = correct + ?, attempted = attempted + 1, last_updated = datetime('now') WHERE id = ?`
      )
      .run(isCorrect ? 1 : 0, existing.id);
  } else {
    await db
      .prepare(
        `INSERT INTO skill_stats (id, user_id, section, domain, skill, correct, attempted)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
      .run(newId("stat"), userId, q.section, q.domain, q.skill, isCorrect ? 1 : 0);
  }

  // Per-question history — powers the Question Bank's real "X of Y solved"
  // and per-topic accuracy (including the first-try-only variant), which
  // skill_stats' running totals alone can't answer (it can't tell you how
  // many *distinct* questions were solved, only a correct/attempted tally).
  const priorAttempts = (
    (await db
      .prepare("SELECT COUNT(*) as n FROM practice_attempts WHERE user_id = ? AND question_id = ?")
      .get(userId, questionId)) as { n: number }
  ).n;
  await db
    .prepare(
      `INSERT INTO practice_attempts (id, user_id, question_id, section, skill, is_correct, attempt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(newId("pa"), userId, questionId, q.section, q.skill, isCorrect ? 1 : 0, priorAttempts + 1);

  return {
    questionId: q.id,
    isCorrect,
    correctAnswer: q.correct_answer,
    rationale: q.rationale,
    explanation: q.explanation,
  };
}

/* ---------------------------------------------------------------------- */
/* Question Bank hub — the "467 of 1,492 solved" overview cards            */
/* ---------------------------------------------------------------------- */

export interface SectionOverview {
  section: string;
  total: number;
  solved: number;
  pct: number;
}

export async function getQuestionBankOverview(userId: string): Promise<SectionOverview[]> {
  const totals = (await db
    .prepare(`SELECT section, COUNT(*) as total FROM questions GROUP BY section`)
    .all()) as { section: string; total: number }[];

  const solvedRows = (await db
    .prepare(
      `SELECT section, COUNT(DISTINCT question_id) as solved FROM practice_attempts WHERE user_id = ? GROUP BY section`
    )
    .all(userId)) as { section: string; solved: number }[];
  const solvedBySection = new Map(solvedRows.map((r) => [r.section, r.solved]));

  return ["Reading and Writing", "Math"].map((section) => {
    const total = totals.find((t) => t.section === section)?.total ?? 0;
    const solved = Math.min(solvedBySection.get(section) ?? 0, total);
    return { section, total, solved, pct: total > 0 ? Math.round((solved / total) * 100) : 0 };
  });
}

export interface GlobalPracticeStats {
  questionsAttempted: number;
  currentAccuracyPct: number | null;
  skillsMastered: number; // skills with >=5 attempts and >=90% accuracy
  studyStreakDays: number;
}

export async function getGlobalPracticeStats(userId: string): Promise<GlobalPracticeStats> {
  const totals = (await db
    .prepare(
      `SELECT COUNT(DISTINCT question_id) as attempted,
              SUM(is_correct) as correct,
              COUNT(*) as attempts
       FROM practice_attempts WHERE user_id = ?`
    )
    .get(userId)) as { attempted: number; correct: number | null; attempts: number };

  const skillRows = (await db
    .prepare(
      `SELECT skill, COUNT(*) as attempts, SUM(is_correct) as correct
       FROM practice_attempts WHERE user_id = ? GROUP BY skill`
    )
    .all(userId)) as { skill: string; attempts: number; correct: number }[];
  const skillsMastered = skillRows.filter((s) => s.attempts >= 5 && s.correct / s.attempts >= 0.9).length;

  const dayRows = (await db
    .prepare(`SELECT DISTINCT date(created_at) as day FROM practice_attempts WHERE user_id = ? ORDER BY day DESC`)
    .all(userId)) as { day: string }[];
  let studyStreakDays = 0;
  if (dayRows.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cursor = new Date(today);
    const daySet = new Set(dayRows.map((d) => d.day));
    // Streak counts backward from today; a gap yesterday-vs-today is still
    // allowed once (you haven't practiced *today* yet) before it breaks.
    for (let i = 0; i < 366; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (daySet.has(key)) {
        studyStreakDays++;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    questionsAttempted: totals.attempted ?? 0,
    currentAccuracyPct: totals.attempts > 0 ? Math.round(((totals.correct ?? 0) / totals.attempts) * 100) : null,
    skillsMastered,
    studyStreakDays,
  };
}

/* ---------------------------------------------------------------------- */
/* Section detail — the per-topic Progress/Accuracy table                 */
/* ---------------------------------------------------------------------- */

export interface TopicRow {
  domain: string;
  skill: string;
  total: number;
  solved: number;
  accuracyPct: number | null; // null = not attempted yet
  isWeak: boolean;
}

/** `firstTryOnly` mirrors the reference UI's "First-try accuracy" toggle —
 * counts only each question's first attempt rather than every retry. */
export async function getSectionTopicList(userId: string, section: string, firstTryOnly: boolean): Promise<TopicRow[]> {
  const totalRows = (await db
    .prepare(`SELECT domain, skill, COUNT(*) as total FROM questions WHERE section = ? GROUP BY domain, skill`)
    .all(section)) as { domain: string; skill: string; total: number }[];

  const attemptRows = (firstTryOnly
    ? await db
        .prepare(
          `SELECT skill, COUNT(DISTINCT question_id) as solved,
                  SUM(is_correct) as correct, COUNT(*) as graded
           FROM practice_attempts
           WHERE user_id = ? AND section = ? AND attempt_number = 1
           GROUP BY skill`
        )
        .all(userId, section)
    : await db
        .prepare(
          `SELECT skill, COUNT(DISTINCT question_id) as solved,
                  SUM(is_correct) as correct, COUNT(*) as graded
           FROM practice_attempts
           WHERE user_id = ? AND section = ?
           GROUP BY skill`
        )
        .all(userId, section)) as { skill: string; solved: number; correct: number; graded: number }[];
  const bySkill = new Map(attemptRows.map((r) => [r.skill, r]));

  // "Weak" reads from skill_stats (BlueMind's lifetime signal from both
  // mocks and practice), independent of this section's own drill history —
  // matches the reference, where a topic can be tagged Weak from mock
  // performance even with zero practice-drill attempts of its own.
  const weakStats = (await db
    .prepare("SELECT skill, correct, attempted FROM skill_stats WHERE user_id = ?")
    .all(userId)) as {
    skill: string;
    correct: number;
    attempted: number;
  }[];
  const weakSet = new Set(
    weakStats.filter((s) => s.attempted >= 5 && s.correct / s.attempted < 0.6).map((s) => s.skill)
  );

  return totalRows.map((t) => {
    const a = bySkill.get(t.skill);
    const solved = Math.min(a?.solved ?? 0, t.total);
    const accuracyPct = a && a.graded > 0 ? Math.round((a.correct / a.graded) * 100) : null;
    return { domain: t.domain, skill: t.skill, total: t.total, solved, accuracyPct, isWeak: weakSet.has(t.skill) };
  });
}
