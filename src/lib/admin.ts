import { db } from "./db";
import { newId } from "./id";

export interface AdminMockRow {
  id: string;
  title: string;
  subtitle: string | null;
  group_label: string;
  month: string;
  year: number;
  order_in_month: number;
  total_questions: number;
  duration_minutes: number;
  is_official: number;
  created_at: string;
}

export interface AdminMockSummary extends AdminMockRow {
  questionCount: number;
  attemptCount: number;
}

export async function listMocksAdmin(): Promise<AdminMockSummary[]> {
  const mocks = (await db
    .prepare(
      `SELECT id, title, subtitle, group_label, month, year, order_in_month,
              total_questions, duration_minutes, is_official, created_at
       FROM mocks ORDER BY year DESC, month, order_in_month ASC`
    )
    .all()) as AdminMockRow[];

  const qCount = db.prepare("SELECT COUNT(*) as n FROM questions WHERE mock_id = ?");
  const aCount = db.prepare("SELECT COUNT(*) as n FROM attempts WHERE mock_id = ?");

  const out: AdminMockSummary[] = [];
  for (const m of mocks) {
    out.push({
      ...m,
      questionCount: ((await qCount.get(m.id)) as { n: number }).n,
      attemptCount: ((await aCount.get(m.id)) as { n: number }).n,
    });
  }
  return out;
}

export interface CreateMockInput {
  title: string;
  subtitle?: string | null;
  groupLabel: string;
  month: string;
  year: number;
  orderInMonth?: number;
  totalQuestions?: number;
  durationMinutes?: number;
}

export async function createMockAdmin(input: CreateMockInput): Promise<string> {
  const id = newId("mock");
  await db
    .prepare(
      `INSERT INTO mocks (id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      id,
      input.title,
      input.subtitle ?? null,
      input.groupLabel,
      input.month,
      input.year,
      input.orderInMonth ?? 1,
      input.totalQuestions ?? 98,
      input.durationMinutes ?? 134
    );
  return id;
}

export interface UpdateMockInput {
  title?: string;
  subtitle?: string | null;
  groupLabel?: string;
  month?: string;
  year?: number;
  orderInMonth?: number;
}

export async function updateMockAdmin(id: string, patch: UpdateMockInput): Promise<{ ok: boolean; error?: string }> {
  const columnMap: Record<keyof UpdateMockInput, string> = {
    title: "title",
    subtitle: "subtitle",
    groupLabel: "group_label",
    month: "month",
    year: "year",
    orderInMonth: "order_in_month",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(patch) as (keyof UpdateMockInput)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${columnMap[key]} = ?`);
    values.push(value);
  }
  if (sets.length === 0) return { ok: true };
  values.push(id);
  const result = await db.prepare(`UPDATE mocks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  if (result.changes === 0) return { ok: false, error: "Mock not found" };
  return { ok: true };
}

export async function deleteMockAdmin(id: string): Promise<{ ok: boolean; error?: string }> {
  const attemptCount = ((await db.prepare("SELECT COUNT(*) as n FROM attempts WHERE mock_id = ?").get(id)) as {
    n: number;
  }).n;
  if (attemptCount > 0) {
    return { ok: false, error: `Can't delete — ${attemptCount} student attempt(s) reference this mock.` };
  }
  await db.prepare("DELETE FROM questions WHERE mock_id = ?").run(id);
  await db.prepare("DELETE FROM mocks WHERE id = ?").run(id);
  return { ok: true };
}

/** Full reset: deletes every mock and every question, plus everything that
 * references them (attempts, answers, score records, module results,
 * question reports, practice attempts, score conversions) so the database
 * comes back with zero foreign-key debris — used when starting over with
 * an entirely new question bank. Unlike deleteMockAdmin, this does NOT
 * refuse when attempts exist; that guard exists to protect individual
 * mocks with real student history, not a deliberate full wipe. Signed-up
 * user accounts, sessions, and skill_stats are left untouched (skill_stats
 * keys off skill name, not question id, so it isn't orphaned by this).
 * coach_conversations are kept for history but detached from the
 * now-deleted questions they referenced.
 *
 * Runs inside a real transaction (db.transaction) — a partial wipe from a
 * mid-way failure would leave dangling foreign-key references, which a
 * sequence of independent pooled queries can't safely guarantee against.
 */
export async function wipeAllMockContent(): Promise<{ mocksDeleted: number; questionsDeleted: number }> {
  const mocksDeleted = ((await db.prepare("SELECT COUNT(*) as n FROM mocks").get()) as { n: number }).n;
  const questionsDeleted = ((await db.prepare("SELECT COUNT(*) as n FROM questions").get()) as { n: number }).n;

  await db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM answers").run();
    await tx.prepare("DELETE FROM score_records").run();
    await tx.prepare("DELETE FROM module_results").run();
    await tx.prepare("DELETE FROM attempts").run();
    await tx.prepare("DELETE FROM question_reports").run();
    await tx.prepare("DELETE FROM practice_attempts").run();
    await tx.prepare("DELETE FROM score_conversions").run();
    await tx.prepare("UPDATE coach_conversations SET question_id = NULL WHERE question_id IS NOT NULL").run();
    await tx.prepare("DELETE FROM questions").run();
    await tx.prepare("DELETE FROM mocks").run();
  });

  return { mocksDeleted, questionsDeleted };
}

export interface AdminQuestionRow {
  id: string;
  mock_id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  module: number;
  module_pool: string | null;
  passage_text: string | null;
  image_data: string | null;
  question_text: string;
  choices: string;
  correct_answer: string;
  question_type: string;
  rationale: string;
  explanation: string;
  estimated_time: number;
  source: string;
  review_status: string;
  created_at: string;
  position: number;
}

export async function listQuestionsForMock(mockId: string): Promise<AdminQuestionRow[]> {
  return (await db
    .prepare(
      `SELECT id, mock_id, section, domain, skill, difficulty, module, module_pool,
              passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
              estimated_time, source, review_status, created_at, position
       FROM questions WHERE mock_id = ? ORDER BY section, module, position, created_at`
    )
    .all(mockId)) as AdminQuestionRow[];
}

/** Standalone Practice Question Bank content — questions with no mock_id,
 * added directly (manually or via AI import) rather than through a mock's
 * question bank. These surface in the student-facing Practice section
 * automatically since getPracticeQuestions() doesn't filter by mock_id. */
export async function listStandaloneQuestions(): Promise<AdminQuestionRow[]> {
  return (await db
    .prepare(
      `SELECT id, mock_id, section, domain, skill, difficulty, module, module_pool,
              passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
              estimated_time, source, review_status, created_at
       FROM questions WHERE mock_id IS NULL ORDER BY section, skill, id`
    )
    .all()) as AdminQuestionRow[];
}

export interface QuestionInput {
  mockId: string | null;
  section: "Math" | "Reading and Writing";
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  module: 1 | 2;
  modulePool?: "higher" | "lower" | null;
  passageText?: string | null;
  imageData?: string | null;
  questionText: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
  estimatedTime?: number;
  source?: string;
}

export async function addQuestionAdmin(q: QuestionInput): Promise<string> {
  const id = newId("q");
  // Module 2 is served to students filtered to module_pool = 'higher'
  // (see getModuleQuestionsPublic) — a module-2 question saved without an
  // explicit pool becomes permanently invisible to that query even though
  // it's sitting right there in the bank. Default it here, at the single
  // shared insert path every admin UI goes through, instead of requiring
  // every caller to remember to set it.
  const modulePool = q.modulePool ?? (q.module === 2 ? "higher" : null);
  // Position within this exact (mock, section, module) group — appends to
  // the end, so questions show up and get served to students in the order
  // they were actually added, instead of sorting by their random id.
  const maxPosRow = (await db
    .prepare("SELECT MAX(position) as maxPos FROM questions WHERE mock_id IS NOT DISTINCT FROM ? AND section = ? AND module = ?")
    .get(q.mockId ?? null, q.section, q.module)) as { maxPos: number | null };
  const nextPosition = (maxPosRow.maxPos ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO questions
        (id, mock_id, section, domain, skill, difficulty, module, module_pool,
         passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
         estimated_time, source, version, review_status, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'validated', ?)`
    )
    .run(
      id,
      q.mockId ?? null,
      q.section,
      q.domain,
      q.skill,
      q.difficulty,
      q.module,
      modulePool,
      q.passageText ?? null,
      q.imageData ?? null,
      q.questionText,
      JSON.stringify(q.choices),
      q.correctAnswer,
      q.questionType,
      q.rationale,
      q.explanation,
      q.estimatedTime ?? 75,
      q.source ?? "Admin",
      nextPosition
    );
  return id;
}

/**
 * Inserts a new question immediately AFTER `afterQuestionId` (or at the
 * very front of the module if `afterQuestionId` is null), shifting every
 * question that comes after it down by one position — the fix for AI
 * extraction skipping a question: instead of every subsequent question
 * being permanently off by one, an admin inserts the missing one exactly
 * where it belongs and everything after it renumbers automatically.
 *
 * Runs inside a real transaction — the position shift and the insert must
 * both happen or neither should, or questions end up with duplicate/
 * conflicting position numbers.
 */
export async function insertQuestionAdminAfter(
  afterQuestionId: string | null,
  q: QuestionInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let afterPosition = 0;
  if (afterQuestionId) {
    const anchor = (await db
      .prepare("SELECT position, mock_id, section, module FROM questions WHERE id = ?")
      .get(afterQuestionId)) as { position: number; mock_id: string | null; section: string; module: number } | undefined;
    if (!anchor) return { ok: false, error: "Question to insert after was not found" };
    afterPosition = anchor.position;
  }

  const modulePool = q.modulePool ?? (q.module === 2 ? "higher" : null);
  const id = newId("q");

  await db.transaction(async (tx) => {
    await tx
      .prepare(
        "UPDATE questions SET position = position + 1 WHERE mock_id IS NOT DISTINCT FROM ? AND section = ? AND module = ? AND position > ?"
      )
      .run(q.mockId ?? null, q.section, q.module, afterPosition);

    await tx
      .prepare(
        `INSERT INTO questions
          (id, mock_id, section, domain, skill, difficulty, module, module_pool,
           passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
           estimated_time, source, version, review_status, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'validated', ?)`
      )
      .run(
        id,
        q.mockId ?? null,
        q.section,
        q.domain,
        q.skill,
        q.difficulty,
        q.module,
        modulePool,
        q.passageText ?? null,
        q.imageData ?? null,
        q.questionText,
        JSON.stringify(q.choices),
        q.correctAnswer,
        q.questionType,
        q.rationale,
        q.explanation,
        q.estimatedTime ?? 75,
        q.source ?? "Admin",
        afterPosition + 1
      );
  });

  return { ok: true, id };
}

export async function getQuestionByIdAdmin(id: string): Promise<AdminQuestionRow | null> {
  const row = (await db
    .prepare(
      `SELECT id, mock_id, section, domain, skill, difficulty, module, module_pool,
              passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
              estimated_time, source, review_status, created_at, position
       FROM questions WHERE id = ?`
    )
    .get(id)) as AdminQuestionRow | undefined;
  return row ?? null;
}

export interface UpdateQuestionInput {
  section?: "Math" | "Reading and Writing";
  domain?: string;
  skill?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  module?: 1 | 2;
  modulePool?: "higher" | "lower" | null;
  passageText?: string | null;
  imageData?: string | null;
  questionText?: string;
  choices?: { id: string; text: string }[];
  correctAnswer?: string;
  questionType?: "multiple_choice" | "spr";
  rationale?: string;
  explanation?: string;
  estimatedTime?: number;
  source?: string;
}

const UPDATABLE_COLUMNS: Record<keyof UpdateQuestionInput, string> = {
  section: "section",
  domain: "domain",
  skill: "skill",
  difficulty: "difficulty",
  module: "module",
  modulePool: "module_pool",
  passageText: "passage_text",
  imageData: "image_data",
  questionText: "question_text",
  choices: "choices",
  correctAnswer: "correct_answer",
  questionType: "question_type",
  rationale: "rationale",
  explanation: "explanation",
  estimatedTime: "estimated_time",
  source: "source",
};

/** Partial update — only the fields present in `patch` are written. Used by
 * the admin "edit question" form so re-saving a question doesn't require
 * resubmitting every field. Always bumps `version` and `updated_at`. */
export async function updateQuestionAdmin(
  id: string,
  patch: UpdateQuestionInput
): Promise<{ ok: boolean; error?: string }> {
  const keys = Object.keys(patch) as (keyof UpdateQuestionInput)[];
  if (keys.length === 0) return { ok: true };

  // Same module-2-needs-'higher'-pool fix as addQuestionAdmin, for the case
  // where a question's module is changed to 2 without also setting a pool.
  if (patch.module === 2 && patch.modulePool === undefined) {
    patch = { ...patch, modulePool: "higher" };
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of keys) {
    const column = UPDATABLE_COLUMNS[key];
    if (!column) continue;
    let value: unknown = patch[key];
    if (key === "choices" && value !== undefined) value = JSON.stringify(value);
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length === 0) return { ok: true };

  sets.push("version = version + 1", "updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')");
  values.push(id);

  const result = await db.prepare(`UPDATE questions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  if (result.changes === 0) return { ok: false, error: "Question not found" };
  return { ok: true };
}

/** Deletes every question in one exact (mock, section, module) group —
 * used for "start this module over" after a bad AI import, so the admin
 * doesn't have to delete questions one at a time. Skips (and reports) any
 * question a student has already answered, same guard as the single-
 * question delete, so this can never quietly destroy real attempt data. */
export async function deleteAllQuestionsForModule(
  mockId: string,
  section: "Math" | "Reading and Writing",
  module: 1 | 2
): Promise<{ deleted: number; skipped: number }> {
  const rows = (await db
    .prepare("SELECT id FROM questions WHERE mock_id = ? AND section = ? AND module = ?")
    .all(mockId, section, module)) as { id: string }[];

  let deleted = 0;
  let skipped = 0;
  const answerCountStmt = db.prepare("SELECT COUNT(*) as n FROM answers WHERE question_id = ?");
  const deleteStmt = db.prepare("DELETE FROM questions WHERE id = ?");

  for (const row of rows) {
    const answerCount = ((await answerCountStmt.get(row.id)) as { n: number }).n;
    if (answerCount > 0) {
      skipped++;
      continue;
    }
    await deleteStmt.run(row.id);
    deleted++;
  }

  return { deleted, skipped };
}

export async function deleteQuestionAdmin(id: string): Promise<{ ok: boolean; error?: string }> {
  const answerCount = ((await db.prepare("SELECT COUNT(*) as n FROM answers WHERE question_id = ?").get(id)) as {
    n: number;
  }).n;
  if (answerCount > 0) {
    return { ok: false, error: `Can't delete — ${answerCount} student answer(s) reference this question.` };
  }
  await db.prepare("DELETE FROM questions WHERE id = ?").run(id);
  return { ok: true };
}

// ---------------- Module release status ----------------
// A module can have questions banked without being visible to students yet
// — the admin explicitly "releases" it once it's ready. Independent of
// question count so a half-finished module never accidentally goes live.

export interface ModuleReleaseRow {
  section: "Math" | "Reading and Writing";
  module: 1 | 2;
  released: boolean;
  questionCount: number;
}

const RELEASE_SLOTS: { section: "Math" | "Reading and Writing"; module: 1 | 2 }[] = [
  { section: "Reading and Writing", module: 1 },
  { section: "Reading and Writing", module: 2 },
  { section: "Math", module: 1 },
  { section: "Math", module: 2 },
];

export async function getModuleReleasesForMock(mockId: string): Promise<ModuleReleaseRow[]> {
  const releasedRows = (await db
    .prepare("SELECT section, module, released FROM module_releases WHERE mock_id = ?")
    .all(mockId)) as { section: string; module: number; released: number }[];
  const releasedMap = new Map(releasedRows.map((r) => [`${r.section}|${r.module}`, !!r.released]));

  const countStmt = db.prepare(
    "SELECT COUNT(*) as n FROM questions WHERE mock_id = ? AND section = ? AND module = ? AND (module_pool IS NULL OR module_pool = 'higher')"
  );

  const out: ModuleReleaseRow[] = [];
  for (const slot of RELEASE_SLOTS) {
    out.push({
      section: slot.section,
      module: slot.module,
      released: releasedMap.get(`${slot.section}|${slot.module}`) ?? false,
      questionCount: ((await countStmt.get(mockId, slot.section, slot.module)) as { n: number }).n,
    });
  }
  return out;
}

export async function setModuleReleased(
  mockId: string,
  section: "Math" | "Reading and Writing",
  module: 1 | 2,
  released: boolean
): Promise<{ ok: boolean; error?: string }> {
  const existing = await db
    .prepare("SELECT mock_id FROM module_releases WHERE mock_id = ? AND section = ? AND module = ?")
    .get(mockId, section, module);
  if (existing) {
    await db
      .prepare(
        "UPDATE module_releases SET released = ?, released_at = CASE WHEN ? THEN to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') ELSE released_at END WHERE mock_id = ? AND section = ? AND module = ?"
      )
      .run(released ? 1 : 0, released ? 1 : 0, mockId, section, module);
  } else {
    await db
      .prepare("INSERT INTO module_releases (mock_id, section, module, released, released_at) VALUES (?, ?, ?, ?, ?)")
      .run(mockId, section, module, released ? 1 : 0, released ? new Date().toISOString() : null);
  }
  return { ok: true };
}

/** Quick fix-it-all: releases every (mock, section, module) that has at
 * least one question banked (higher pool) and isn't already released.
 * Exists because the release gate's one-time backfill only auto-published
 * modules at the EXACT real-SAT count (22 Math / 27 R&W) — anything even
 * one question off (a shorter practice set, a module still being filled
 * in when the gate shipped) silently sat behind "Coming soon" from then
 * on, which looks indistinguishable from banked content having vanished.
 * This is the recovery action for that: bring everything with content
 * back to visible in one click, then use the per-module Release/Unrelease
 * toggle for anything you deliberately want to keep hidden going forward. */
export async function releaseAllBankedModules(): Promise<{ released: number }> {
  const rows = (await db
    .prepare(
      `SELECT DISTINCT mock_id, section, module FROM questions
       WHERE mock_id IS NOT NULL AND (module_pool IS NULL OR module_pool = 'higher')`
    )
    .all()) as { mock_id: string; section: string; module: number }[];

  let released = 0;
  for (const r of rows) {
    const count = (
      (await db
        .prepare(
          "SELECT COUNT(*) as n FROM questions WHERE mock_id = ? AND section = ? AND module = ? AND (module_pool IS NULL OR module_pool = 'higher')"
        )
        .get(r.mock_id, r.section, r.module)) as { n: number }
    ).n;
    if (count === 0) continue;
    const existing = (await db
      .prepare("SELECT released FROM module_releases WHERE mock_id = ? AND section = ? AND module = ?")
      .get(r.mock_id, r.section, r.module)) as { released: number } | undefined;
    if (existing?.released) continue;
    await setModuleReleased(r.mock_id, r.section as "Math" | "Reading and Writing", r.module as 1 | 2, true);
    released++;
  }
  return { released };
}

// ---------------- Real users ----------------

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  is_guest: number;
  created_at: string;
  attemptCount: number;
  completedAttemptCount: number;
  latestScore: number | null;
  lastActiveAt: string | null;
}

/** Real signed-up users only (excludes guest accounts), newest first, with
 * a quick activity summary for the admin "Users" tab. */
export async function listUsersAdmin(): Promise<AdminUserRow[]> {
  const users = (await db
    .prepare(`SELECT id, email, name, is_guest, created_at FROM users WHERE is_guest = 0 ORDER BY created_at DESC`)
    .all()) as { id: string; email: string; name: string; is_guest: number; created_at: string }[];

  const attemptStats = db.prepare(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            MAX(started_at) as lastActive
     FROM attempts WHERE user_id = ?`
  );
  const latestScoreStmt = db.prepare(
    `SELECT sr.estimated_score as score
     FROM score_records sr
     JOIN attempts a ON a.id = sr.attempt_id
     WHERE a.user_id = ? AND sr.section = 'Total'
     ORDER BY sr.created_at DESC LIMIT 1`
  );

  const out: AdminUserRow[] = [];
  for (const u of users) {
    const stats = (await attemptStats.get(u.id)) as { total: number; completed: number; lastActive: string | null };
    const latest = (await latestScoreStmt.get(u.id)) as { score: number } | undefined;
    out.push({
      ...u,
      attemptCount: stats.total ?? 0,
      completedAttemptCount: stats.completed ?? 0,
      latestScore: latest?.score ?? null,
      lastActiveAt: stats.lastActive,
    });
  }
  return out;
}

// ---------------- Question reports ----------------

export interface CreateReportInput {
  questionId: string;
  userId?: string | null;
  reason: string;
  details?: string | null;
}

export async function createQuestionReport(input: CreateReportInput): Promise<{ ok: boolean; error?: string }> {
  const question = await db.prepare("SELECT id FROM questions WHERE id = ?").get(input.questionId);
  if (!question) return { ok: false, error: "Question not found" };
  await db
    .prepare(`INSERT INTO question_reports (id, question_id, user_id, reason, details) VALUES (?, ?, ?, ?, ?)`)
    .run(newId("report"), input.questionId, input.userId ?? null, input.reason, input.details ?? null);
  return { ok: true };
}

export interface AdminReportRow {
  id: string;
  question_id: string;
  user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  question_text: string;
  section: string;
  skill: string;
  mock_title: string | null;
  reporter_email: string | null;
}

export async function listReportsAdmin(status?: string): Promise<AdminReportRow[]> {
  const where = status ? "WHERE r.status = ?" : "";
  const rows = (await db
    .prepare(
      `SELECT r.id, r.question_id, r.user_id, r.reason, r.details, r.status, r.created_at, r.resolved_at,
              q.question_text, q.section, q.skill, m.title as mock_title, u.email as reporter_email
       FROM question_reports r
       JOIN questions q ON q.id = r.question_id
       LEFT JOIN mocks m ON m.id = q.mock_id
       LEFT JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.created_at DESC`
    )
    .all(...(status ? [status] : []))) as AdminReportRow[];
  return rows;
}

export async function updateReportStatus(
  id: string,
  status: "open" | "resolved" | "dismissed"
): Promise<{ ok: boolean; error?: string }> {
  const resolvedAt = status === "open" ? null : new Date().toISOString();
  const result = await db
    .prepare("UPDATE question_reports SET status = ?, resolved_at = ? WHERE id = ?")
    .run(status, resolvedAt, id);
  if (result.changes === 0) return { ok: false, error: "Report not found" };
  return { ok: true };
}
