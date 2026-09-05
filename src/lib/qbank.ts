import { db } from "./db";
import { newId } from "./id";
import { DOMAINS } from "./sat-constants";
import { isAnswerCorrect } from "./spr-grading";
import { gradePracticeAnswer } from "./practice";

/**
 * Question Bank — the browsable pool of standalone questions (mock_id IS
 * NULL; today that's the imported College Board bank plus anything an
 * admin added directly). Students filter it, then solve a "set" of
 * questions in the same exam screen the mocks use
 * (/practice/qbank/<section>/<setId>). Sets live in practice_sessions
 * (type = 'qbank'); per-question history lands in practice_attempts and
 * skill_stats via gradePracticeAnswer, so the existing Question Bank hub
 * analytics pick it up automatically.
 */

export type BankSection = "Math" | "Reading and Writing";
export type BankStatus = "all" | "unattempted" | "attempted" | "correct" | "incorrect";

export interface BankFilters {
  section: BankSection;
  domains: string[];
  skills: string[];
  difficulties: string[];
  status: BankStatus;
  search: string;
}

export interface BankRow {
  id: string;
  externalId: string | null;
  domain: string;
  skill: string;
  difficulty: string;
  questionType: string;
  attempts: number;
  lastCorrect: boolean | null;
}

export const BANK_PAGE_SIZE_MAX = 100;
export const BANK_SET_SIZE_MAX = 60;

/** Seconds per question used to size a set's timer — the real per-module
 * pacing (32 min / 27 R&W questions, 35 min / 22 Math questions). */
export function bankSetMinutes(section: string, count: number): number {
  const perQuestion = section === "Math" ? 95 : 71;
  return Math.max(1, Math.ceil((count * perQuestion) / 60));
}

function caseOrder(column: string, values: string[]): string {
  const whens = values.map((v, i) => `WHEN '${v.replace(/'/g, "''")}' THEN ${i}`).join(" ");
  return `CASE ${column} ${whens} ELSE ${values.length} END`;
}

const DOMAIN_ORDER = caseOrder("q.domain", Object.keys(DOMAINS));
const SKILL_ORDER = caseOrder(
  "q.skill",
  Object.values(DOMAINS).flatMap((d) => d.skills)
);
const DIFFICULTY_ORDER = caseOrder("q.difficulty", ["Easy", "Medium", "Hard"]);
const DEFAULT_ORDER = `${DOMAIN_ORDER}, ${SKILL_ORDER}, ${DIFFICULTY_ORDER}, q.external_id NULLS LAST, q.position, q.id`;

/** The per-user attempt CTEs every bank query starts with: the latest
 * attempt per question (for correct/incorrect status) and attempt counts. */
const ATTEMPT_CTES = `WITH last AS (
    SELECT DISTINCT ON (question_id) question_id, is_correct
    FROM practice_attempts WHERE user_id = ?
    ORDER BY question_id, created_at DESC, id DESC
  ), cnt AS (
    SELECT question_id, COUNT(*) AS n FROM practice_attempts WHERE user_id = ? GROUP BY question_id
  )`;

function buildWhere(filters: BankFilters): { sql: string; args: unknown[] } {
  const clauses = ["q.mock_id IS NULL", "q.section = ?"];
  const args: unknown[] = [filters.section];
  const inClause = (column: string, values: string[]) => {
    if (values.length === 0) return;
    clauses.push(`${column} IN (${values.map(() => "?").join(",")})`);
    args.push(...values);
  };
  inClause("q.domain", filters.domains);
  inClause("q.skill", filters.skills);
  inClause("q.difficulty", filters.difficulties);
  switch (filters.status) {
    case "unattempted":
      clauses.push("last.question_id IS NULL");
      break;
    case "attempted":
      clauses.push("last.question_id IS NOT NULL");
      break;
    case "correct":
      clauses.push("last.is_correct = 1");
      break;
    case "incorrect":
      clauses.push("last.is_correct = 0");
      break;
  }
  const search = filters.search.trim();
  if (search) {
    clauses.push("(q.external_id ILIKE ? OR q.skill ILIKE ?)");
    args.push(`%${search}%`, `%${search}%`);
  }
  return { sql: clauses.join(" AND "), args };
}

export function normalizeFilters(input: Omit<Partial<BankFilters>, "section"> & { section: string }): BankFilters {
  const section: BankSection = input.section === "Math" ? "Math" : "Reading and Writing";
  const validDomains = Object.keys(DOMAINS).filter((d) => DOMAINS[d].section === section);
  const validSkills = validDomains.flatMap((d) => DOMAINS[d].skills);
  const status: BankStatus = (["all", "unattempted", "attempted", "correct", "incorrect"] as const).includes(
    (input.status ?? "all") as BankStatus
  )
    ? ((input.status ?? "all") as BankStatus)
    : "all";
  return {
    section,
    domains: (input.domains ?? []).filter((d) => validDomains.includes(d)),
    skills: (input.skills ?? []).filter((s) => validSkills.includes(s)),
    difficulties: (input.difficulties ?? []).filter((d) => ["Easy", "Medium", "Hard"].includes(d)),
    status,
    search: (input.search ?? "").slice(0, 40),
  };
}

function mapRow(r: {
  id: string;
  external_id: string | null;
  domain: string;
  skill: string;
  difficulty: string;
  question_type: string;
  attempts: number | string | null;
  last_correct: number | null;
}): BankRow {
  return {
    id: r.id,
    externalId: r.external_id,
    domain: r.domain,
    skill: r.skill,
    difficulty: r.difficulty,
    questionType: r.question_type,
    attempts: Number(r.attempts ?? 0),
    lastCorrect: r.last_correct === null || r.last_correct === undefined ? null : Number(r.last_correct) === 1,
  };
}

export async function listBankQuestions(
  userId: string,
  filters: BankFilters,
  page: number,
  pageSize: number
): Promise<{ total: number; page: number; pageSize: number; rows: BankRow[] }> {
  const size = Math.min(BANK_PAGE_SIZE_MAX, Math.max(1, pageSize));
  const where = buildWhere(filters);
  const countRow = (await db
    .prepare(
      `${ATTEMPT_CTES}
       SELECT COUNT(*) AS n FROM questions q
       LEFT JOIN last ON last.question_id = q.id
       WHERE ${where.sql}`
    )
    .get(userId, userId, ...where.args)) as { n: number | string };
  const total = Number(countRow?.n ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const rows = (await db
    .prepare(
      `${ATTEMPT_CTES}
       SELECT q.id, q.external_id, q.domain, q.skill, q.difficulty, q.question_type,
              last.is_correct AS last_correct, COALESCE(cnt.n, 0) AS attempts
       FROM questions q
       LEFT JOIN last ON last.question_id = q.id
       LEFT JOIN cnt ON cnt.question_id = q.id
       WHERE ${where.sql}
       ORDER BY ${DEFAULT_ORDER}
       LIMIT ? OFFSET ?`
    )
    .all(userId, userId, ...where.args, size, (safePage - 1) * size)) as Parameters<typeof mapRow>[0][];

  return { total, page: safePage, pageSize: size, rows: rows.map(mapRow) };
}

export interface BankFacetSkill {
  skill: string;
  total: number;
  attempted: number;
  correct: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
}
export interface BankFacetDomain {
  domain: string;
  total: number;
  attempted: number;
  skills: BankFacetSkill[];
}
export interface BankFacets {
  section: BankSection;
  total: number;
  attempted: number;
  correct: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
  domains: BankFacetDomain[];
}

/** Counts for the filter sidebar — every official domain/skill, zero-filled. */
export async function getBankFacets(userId: string, section: BankSection): Promise<BankFacets> {
  const rows = (await db
    .prepare(
      `${ATTEMPT_CTES}
       SELECT q.domain, q.skill, q.difficulty, COUNT(*) AS total,
              COUNT(last.question_id) AS attempted,
              SUM(CASE WHEN last.is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM questions q
       LEFT JOIN last ON last.question_id = q.id
       WHERE q.mock_id IS NULL AND q.section = ?
       GROUP BY q.domain, q.skill, q.difficulty`
    )
    .all(userId, userId, section)) as {
    domain: string;
    skill: string;
    difficulty: string;
    total: number | string;
    attempted: number | string;
    correct: number | string | null;
  }[];

  const facets: BankFacets = {
    section,
    total: 0,
    attempted: 0,
    correct: 0,
    byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
    domains: [],
  };
  const skillMap = new Map<string, BankFacetSkill>();
  for (const [domain, meta] of Object.entries(DOMAINS)) {
    if (meta.section !== section) continue;
    const d: BankFacetDomain = { domain, total: 0, attempted: 0, skills: [] };
    for (const skill of meta.skills) {
      const s: BankFacetSkill = { skill, total: 0, attempted: 0, correct: 0, byDifficulty: { Easy: 0, Medium: 0, Hard: 0 } };
      d.skills.push(s);
      skillMap.set(`${domain}::${skill}`, s);
    }
    facets.domains.push(d);
  }
  for (const r of rows) {
    const s = skillMap.get(`${r.domain}::${r.skill}`);
    const total = Number(r.total);
    const attempted = Number(r.attempted);
    const correct = Number(r.correct ?? 0);
    facets.total += total;
    facets.attempted += attempted;
    facets.correct += correct;
    if (r.difficulty === "Easy" || r.difficulty === "Medium" || r.difficulty === "Hard") facets.byDifficulty[r.difficulty] += total;
    if (!s) continue; // a skill outside the official taxonomy — counted in totals only
    s.total += total;
    s.attempted += attempted;
    s.correct += correct;
    if (r.difficulty === "Easy" || r.difficulty === "Medium" || r.difficulty === "Hard") s.byDifficulty[r.difficulty] += total;
  }
  for (const d of facets.domains) {
    d.total = d.skills.reduce((sum, s) => sum + s.total, 0);
    d.attempted = d.skills.reduce((sum, s) => sum + s.attempted, 0);
  }
  return facets;
}

/* ---------------------------------------------------------------------- */
/* Sets                                                                   */
/* ---------------------------------------------------------------------- */

export interface CreateSetInput {
  filters: BankFilters;
  count: number;
  shuffle: boolean;
  questionIds?: string[];
  title?: string;
}

function describeFilters(f: BankFilters): string {
  const parts: string[] = [];
  if (f.skills.length === 1) parts.push(f.skills[0]);
  else if (f.skills.length > 1) parts.push(`${f.skills.length} topics`);
  else if (f.domains.length === 1) parts.push(f.domains[0]);
  else if (f.domains.length > 1) parts.push(`${f.domains.length} domains`);
  else parts.push("All topics"); // the exam screen already appends the section name
  if (f.difficulties.length > 0 && f.difficulties.length < 3) parts.push(f.difficulties.join("/"));
  if (f.status === "incorrect") parts.push("missed questions");
  else if (f.status === "unattempted") parts.push("new questions");
  return parts.join(" · ");
}

export async function createBankSet(
  userId: string,
  input: CreateSetInput
): Promise<{ ok: true; setId: string; count: number; section: BankSection } | { ok: false; error: string }> {
  const count = Math.min(BANK_SET_SIZE_MAX, Math.max(1, Math.floor(input.count) || 1));
  let ids: string[] = [];
  let section = input.filters.section;
  let explicitLabel: string | null = null;

  if (input.questionIds && input.questionIds.length > 0) {
    const wanted = Array.from(new Set(input.questionIds)).slice(0, BANK_SET_SIZE_MAX);
    const rows = (await db
      .prepare(`SELECT id, section, skill FROM questions WHERE mock_id IS NULL AND id IN (${wanted.map(() => "?").join(",")})`)
      .all(...wanted)) as { id: string; section: string; skill: string }[];
    const found = new Map(rows.map((r) => [r.id, r.section]));
    const skills = new Set(rows.map((r) => r.skill));
    explicitLabel = skills.size === 1 ? Array.from(skills)[0] : `${rows.length} selected questions`;
    ids = wanted.filter((id) => found.has(id));
    if (ids.length === 0) return { ok: false, error: "Those questions aren't in the bank any more." };
    const sections = new Set(ids.map((id) => found.get(id)!));
    if (sections.size > 1) return { ok: false, error: "A set must stay within one section." };
    section = (found.get(ids[0]) === "Math" ? "Math" : "Reading and Writing") as BankSection;
  } else {
    const where = buildWhere(input.filters);
    const order = input.shuffle ? "RANDOM()" : DEFAULT_ORDER;
    const rows = (await db
      .prepare(
        `${ATTEMPT_CTES}
         SELECT q.id FROM questions q
         LEFT JOIN last ON last.question_id = q.id
         WHERE ${where.sql}
         ORDER BY ${order}
         LIMIT ?`
      )
      .all(userId, userId, ...where.args, count)) as { id: string }[];
    ids = rows.map((r) => r.id);
    if (ids.length === 0) return { ok: false, error: "No questions match those filters — try widening them." };
  }

  const title =
    (input.title ?? "").trim().slice(0, 120) || `Question Bank · ${explicitLabel ?? describeFilters({ ...input.filters, section })}`;
  const setId = newId("set");
  await db
    .prepare(
      `INSERT INTO practice_sessions (id, user_id, type, question_ids, total_count, section, title)
       VALUES (?, ?, 'qbank', ?, ?, ?, ?)`
    )
    .run(setId, userId, JSON.stringify(ids), ids.length, section, title);
  return { ok: true, setId, count: ids.length, section };
}

interface SetRow {
  id: string;
  user_id: string;
  type: string;
  question_ids: string;
  section: string | null;
  title: string | null;
  completed_at: string | null;
  correct_count: number;
  total_count: number;
  results_json: string | null;
}

async function loadSet(userId: string, setId: string, isAdmin: boolean): Promise<SetRow | null> {
  const row = (await db
    .prepare(
      `SELECT id, user_id, type, question_ids, section, title, completed_at, correct_count, total_count, results_json
       FROM practice_sessions WHERE id = ?`
    )
    .get(setId)) as SetRow | undefined;
  if (!row || row.type !== "qbank") return null;
  if (row.user_id !== userId && !isAdmin) return null;
  return row;
}

interface QuestionRow {
  id: string;
  external_id: string | null;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  passage_text: string | null;
  image_data: string | null;
  question_text: string;
  choices: string;
  correct_answer: string;
  question_type: string;
  rationale: string;
  explanation: string;
}

async function loadQuestionsInOrder(ids: string[]): Promise<QuestionRow[]> {
  if (ids.length === 0) return [];
  const rows = (await db
    .prepare(
      `SELECT id, external_id, section, domain, skill, difficulty, passage_text, image_data, question_text, choices,
              correct_answer, question_type, rationale, explanation
       FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`
    )
    .all(...ids)) as QuestionRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is QuestionRow => !!r);
}

export interface BankSetPublic {
  setId: string;
  title: string;
  section: BankSection;
  minutes: number;
  completedAt: string | null;
  correctCount: number;
  total: number;
  results: unknown[] | null;
  questions: {
    id: string;
    externalId: string | null;
    domain: string;
    skill: string;
    difficulty: string;
    passageText: string | null;
    imageData: string | null;
    questionText: string;
    choices: { id: string; text: string; imageData?: string | null }[];
    questionType: string;
  }[];
}

/** Everything the exam page needs to run a set — answers/rationale stripped. */
export async function getBankSet(userId: string, setId: string, isAdmin = false): Promise<BankSetPublic | null> {
  const set = await loadSet(userId, setId, isAdmin);
  if (!set) return null;
  const ids = JSON.parse(set.question_ids) as string[];
  const questions = await loadQuestionsInOrder(ids);
  const section: BankSection = set.section === "Math" ? "Math" : set.section === "Reading and Writing" ? "Reading and Writing" : questions[0]?.section === "Math" ? "Math" : "Reading and Writing";
  let results: unknown[] | null = null;
  if (set.results_json) {
    try {
      results = JSON.parse(set.results_json);
    } catch {
      results = null;
    }
  }
  return {
    setId: set.id,
    title: set.title ?? "Question Bank",
    section,
    minutes: bankSetMinutes(section, questions.length),
    completedAt: set.completed_at,
    correctCount: set.correct_count,
    total: questions.length,
    results,
    questions: questions.map((q) => ({
      id: q.id,
      externalId: q.external_id,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      passageText: q.passage_text ?? null,
      imageData: q.image_data ?? null,
      questionText: q.question_text,
      choices: JSON.parse(q.choices),
      questionType: q.question_type,
    })),
  };
}

export interface GradedBankQuestion {
  questionId: string;
  externalId: string | null;
  questionText: string;
  imageData: string | null;
  choices: { id: string; text: string; imageData?: string | null }[];
  skill: string;
  difficulty: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  rationale: string;
  explanation: string;
}

export interface BankGradeResult {
  total: number;
  correctCount: number;
  accuracyPct: number;
  results: GradedBankQuestion[];
}

/**
 * Grades a set. With `preview` the result is computed only (the exam
 * page's live answer-key preview); otherwise each answered question is
 * recorded through gradePracticeAnswer (practice_attempts + skill_stats)
 * and the set is marked complete with its full breakdown saved for Review.
 */
export async function gradeBankSet(
  userId: string,
  setId: string,
  answers: Record<string, string | null>,
  preview: boolean,
  isAdmin = false
): Promise<BankGradeResult | null> {
  const set = await loadSet(userId, setId, isAdmin);
  if (!set) return null;
  const ids = JSON.parse(set.question_ids) as string[];
  const questions = await loadQuestionsInOrder(ids);
  if (questions.length === 0) return null;

  let correctCount = 0;
  const results: GradedBankQuestion[] = questions.map((q) => {
    const raw = answers[q.id];
    const selected = typeof raw === "string" && raw.trim() !== "" ? raw : null;
    const isCorrect = isAnswerCorrect(q.question_type, selected, q.correct_answer);
    if (isCorrect) correctCount++;
    return {
      questionId: q.id,
      externalId: q.external_id,
      questionText: q.question_text,
      imageData: q.image_data ?? null,
      choices: JSON.parse(q.choices),
      skill: q.skill,
      difficulty: q.difficulty,
      selectedAnswer: selected,
      correctAnswer: q.correct_answer,
      isCorrect,
      rationale: q.rationale,
      explanation: q.explanation,
    };
  });

  if (!preview && set.user_id === userId) {
    // Only answered questions count as attempts — leaving one blank in a
    // timed set shouldn't brand it "incorrect" in the bank listing.
    for (const r of results) {
      if (r.selectedAnswer === null) continue;
      await gradePracticeAnswer(userId, r.questionId, r.selectedAnswer);
    }
    await db
      .prepare(
        `UPDATE practice_sessions
         SET completed_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             correct_count = ?, total_count = ?, results_json = ?
         WHERE id = ?`
      )
      .run(correctCount, results.length, JSON.stringify(results), setId);
  }

  return {
    total: results.length,
    correctCount,
    accuracyPct: Math.round((correctCount / results.length) * 100),
    results,
  };
}
