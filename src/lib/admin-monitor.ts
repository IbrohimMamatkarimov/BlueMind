import { db } from "./db";
import { isAdminEmail } from "./auth";
import { featureLabel } from "./activity";
import {
  LIVE_WINDOW_MS,
  buildTrend,
  dayKeys,
  latestIso,
  pct,
  plural,
  type ActionCount,
  type ActiveUserRow,
  type ActivityEvent,
  type AdminOverview,
  type CountryRow,
  type FeatureTime,
  type LiveSnapshot,
  type MonitorUserRow,
  type QuestionStat,
  type RangeDays,
  type UserDetail,
} from "./admin-monitor-shared";

/**
 * Queries behind the admin "Users & activity" tab.
 *
 * Presence and time on site come from the heartbeat table (user_activity and
 * users.last_seen_at, see src/lib/activity.ts). Everything else is read from
 * data BlueMind already keeps: Question Bank checks (practice_attempts),
 * finished mock modules and submitted sets (study_results), vocabulary,
 * notes, the mistakes journal and question reports. So the numbers cover
 * history from before the heartbeat existed too.
 *
 * All timestamps are ISO-8601 UTC strings, so a day key such as
 * "2026-09-05" works directly as a lower bound in string comparisons.
 */

type Num = number | string | null | undefined;

function num(value: Num): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dayMap(rows: { d: string; v: Num }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.d, num(row.v)] as [string, number]));
}

/** A question needs this many checks before it can rank as hardest/easiest. */
const MIN_QUESTION_ATTEMPTS = 2;

/** Who did anything on a day: heartbeat, Question Bank checks, finished work. */
const ACTIVE_UNION = `
  SELECT user_id, day AS d FROM user_activity WHERE day >= ?
  UNION ALL SELECT user_id, substr(created_at, 1, 10) FROM practice_attempts WHERE created_at >= ?
  UNION ALL SELECT user_id, substr(completed_at, 1, 10) FROM study_results WHERE completed_at >= ?`;

const ACTIONS: { key: string; label: string; sql: string }[] = [
  {
    key: "bank",
    label: "Question Bank answers checked",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM practice_attempts WHERE created_at >= ?",
  },
  {
    key: "mock",
    label: "Mock modules finished",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM study_results WHERE source = 'mock' AND completed_at >= ?",
  },
  {
    key: "set",
    label: "Question Bank sets submitted",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM study_results WHERE source = 'qbank' AND completed_at >= ?",
  },
  {
    key: "shared",
    label: "Shared questions opened",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM practice_sessions WHERE type = 'qbank' AND title LIKE 'Shared question%' AND created_at >= ?",
  },
  {
    key: "vocab",
    label: "Vocabulary words saved",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM vocabulary_words WHERE created_at >= ?",
  },
  {
    key: "notes",
    label: "Question notes written",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM question_notes WHERE updated_at >= ?",
  },
  {
    key: "journal",
    label: "Mistake journal entries",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM mistake_journal_entries WHERE updated_at >= ?",
  },
  {
    key: "reports",
    label: "Question problems reported",
    sql: "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM question_reports WHERE created_at >= ?",
  },
];

const REPORT_REASONS: Record<string, string> = {
  wrong_answer: "marked answer looks wrong",
  typo: "typo or formatting",
  unclear: "question is unclear",
  broken: "choices or image broken",
  other: "other problem",
};

export async function getAdminOverview(rangeDays: RangeDays, now: Date = new Date()): Promise<AdminOverview> {
  const days = dayKeys(rangeDays, now);
  const since = days[0];
  const liveCutoff = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();

  const people = (await db
    .prepare(
      `SELECT COUNT(*) FILTER (WHERE is_guest = 0) AS registered,
              COUNT(*) FILTER (WHERE is_guest = 1) AS guests,
              COUNT(*) FILTER (WHERE is_guest = 0 AND created_at >= ?) AS new_signups,
              COUNT(*) FILTER (WHERE last_seen_at >= ?) AS live_now
       FROM users`
    )
    .get(since, liveCutoff)) as { registered: Num; guests: Num; new_signups: Num; live_now: Num };
  const emails = (await db.prepare("SELECT email FROM users WHERE is_guest = 0").all()) as { email: string }[];
  const active = (await db
    .prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM (${ACTIVE_UNION}) t`)
    .get(since, since, since)) as { n: Num };
  const bank = (await db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(is_correct), 0) AS c FROM practice_attempts WHERE created_at >= ?")
    .get(since)) as { n: Num; c: Num };
  const mock = (await db
    .prepare(
      `SELECT COUNT(*) AS modules, COALESCE(SUM(total), 0) AS n, COALESCE(SUM(correct_count), 0) AS c
       FROM study_results WHERE source = 'mock' AND completed_at >= ?`
    )
    .get(since)) as { modules: Num; n: Num; c: Num };
  const time = (await db
    .prepare("SELECT COALESCE(SUM(seconds), 0) AS s FROM user_activity WHERE day >= ?")
    .get(since)) as { s: Num };
  const tracking = (await db.prepare("SELECT MIN(day) AS d FROM user_activity").get()) as { d: string | null } | undefined;

  const trend = buildTrend(days, {
    activeUsers: dayMap(
      (await db
        .prepare(`SELECT d, COUNT(DISTINCT user_id) AS v FROM (${ACTIVE_UNION}) t GROUP BY d`)
        .all(since, since, since)) as { d: string; v: Num }[]
    ),
    signups: dayMap(
      (await db
        .prepare(
          "SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM users WHERE is_guest = 0 AND created_at >= ? GROUP BY 1"
        )
        .all(since)) as { d: string; v: Num }[]
    ),
    questions: dayMap(
      (await db
        .prepare(
          `SELECT d, SUM(v) AS v FROM (
             SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM practice_attempts WHERE created_at >= ? GROUP BY 1
             UNION ALL
             SELECT substr(completed_at, 1, 10) AS d, SUM(total) AS v FROM study_results
             WHERE source = 'mock' AND completed_at >= ? GROUP BY 1
           ) t GROUP BY d`
        )
        .all(since, since)) as { d: string; v: Num }[]
    ),
    minutes: new Map(
      (
        (await db
          .prepare("SELECT day AS d, SUM(seconds) AS v FROM user_activity WHERE day >= ? GROUP BY day")
          .all(since)) as { d: string; v: Num }[]
      ).map((row) => [row.d, Math.round(num(row.v) / 60)] as [string, number])
    ),
  });

  const featureTime: FeatureTime[] = (
    (await db
      .prepare(
        `SELECT feature, SUM(seconds) AS s, COUNT(DISTINCT user_id) AS u
         FROM user_activity WHERE day >= ? GROUP BY feature ORDER BY SUM(seconds) DESC`
      )
      .all(since)) as { feature: string; s: Num; u: Num }[]
  )
    .map((row) => ({ key: row.feature, label: featureLabel(row.feature), minutes: Math.round(num(row.s) / 60), users: num(row.u) }))
    .filter((row) => row.minutes > 0);

  const actions: ActionCount[] = [];
  for (const action of ACTIONS) {
    const row = (await db.prepare(action.sql).get(since)) as { n: Num; u: Num } | undefined;
    actions.push({ key: action.key, label: action.label, count: num(row?.n), users: num(row?.u) });
  }

  const mostActive: ActiveUserRow[] = (
    (await db
      .prepare(
        `WITH a AS (SELECT user_id, SUM(seconds) AS s FROM user_activity WHERE day >= ? GROUP BY user_id),
              p AS (SELECT user_id, COUNT(*) AS n, SUM(is_correct) AS c FROM practice_attempts WHERE created_at >= ? GROUP BY user_id),
              m AS (SELECT user_id, SUM(total) AS n, SUM(correct_count) AS c FROM study_results
                    WHERE source = 'mock' AND completed_at >= ? GROUP BY user_id)
         SELECT u.id, u.name, u.email, u.last_seen_at,
                COALESCE(a.s, 0) AS s,
                COALESCE(p.n, 0) + COALESCE(m.n, 0) AS q,
                COALESCE(p.c, 0) + COALESCE(m.c, 0) AS c
         FROM users u
         LEFT JOIN a ON a.user_id = u.id
         LEFT JOIN p ON p.user_id = u.id
         LEFT JOIN m ON m.user_id = u.id
         WHERE COALESCE(a.s, 0) > 0 OR COALESCE(p.n, 0) + COALESCE(m.n, 0) > 0
         ORDER BY s DESC, q DESC
         LIMIT 8`
      )
      .all(since, since, since)) as { id: string; name: string; email: string; last_seen_at: string | null; s: Num; q: Num; c: Num }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    questions: num(row.q),
    accuracyPct: pct(num(row.c), num(row.q)),
    minutes: Math.round(num(row.s) / 60),
    lastSeenAt: row.last_seen_at,
  }));

  const questionStats: QuestionStat[] = (
    (await db
      .prepare(
        `SELECT q.id, q.external_id, q.section, q.skill, q.difficulty,
                COUNT(*) AS n, COUNT(DISTINCT pa.user_id) AS u, COALESCE(SUM(pa.is_correct), 0) AS c
         FROM practice_attempts pa JOIN questions q ON q.id = pa.question_id
         WHERE pa.created_at >= ?
         GROUP BY q.id, q.external_id, q.section, q.skill, q.difficulty
         HAVING COUNT(*) >= ?`
      )
      .all(since, MIN_QUESTION_ATTEMPTS)) as {
      id: string;
      external_id: string | null;
      section: string;
      skill: string;
      difficulty: string;
      n: Num;
      u: Num;
      c: Num;
    }[]
  ).map((row) => ({
    id: row.id,
    externalId: row.external_id,
    section: row.section,
    skill: row.skill,
    difficulty: row.difficulty,
    attempts: num(row.n),
    users: num(row.u),
    accuracyPct: pct(num(row.c), num(row.n)) ?? 0,
  }));
  const hardest = questionStats
    .filter((q) => q.accuracyPct < 100)
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempts - a.attempts)
    .slice(0, 5);
  const hardestIds = new Set(hardest.map((q) => q.id));
  const easiest = questionStats
    .filter((q) => q.accuracyPct > 0 && !hardestIds.has(q.id))
    .sort((a, b) => b.accuracyPct - a.accuracyPct || b.attempts - a.attempts)
    .slice(0, 5);

  const countries: CountryRow[] = (
    (await db
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(country), ''), 'Not set') AS country, COUNT(*) AS n
         FROM users WHERE is_guest = 0 GROUP BY 1 ORDER BY n DESC, 1 LIMIT 12`
      )
      .all()) as { country: string; n: Num }[]
  ).map((row) => ({ country: row.country, users: num(row.n) }));

  return {
    rangeDays,
    generatedAt: now.toISOString(),
    tiles: {
      registered: num(people.registered),
      guests: num(people.guests),
      admins: emails.filter((row) => isAdminEmail(row.email)).length,
      liveNow: num(people.live_now),
      activeUsers: num(active.n),
      newSignups: num(people.new_signups),
      questionsAnswered: num(bank.n) + num(mock.n),
      accuracyPct: pct(num(bank.c) + num(mock.c), num(bank.n) + num(mock.n)),
      minutesOnSite: Math.round(num(time.s) / 60),
      mockModules: num(mock.modules),
      trackingSince: tracking?.d ?? null,
    },
    trend,
    featureTime,
    actions,
    mostActive,
    hardest,
    easiest,
    countries,
    recent: await getRecentActivity(40),
  };
}

/** The latest things people did, newest first, merged from every source. */
export async function getRecentActivity(limit = 40): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];

  const signups = (await db
    .prepare("SELECT id, name, created_at FROM users WHERE is_guest = 0 ORDER BY created_at DESC LIMIT ?")
    .all(limit)) as { id: string; name: string; created_at: string }[];
  for (const row of signups) {
    events.push({ at: row.created_at, userId: row.id, userName: row.name, kind: "signup", text: "joined BlueMind" });
  }

  // Question Bank checks, one line per person, set and day.
  const practice = (await db
    .prepare(
      `SELECT pa.user_id, u.name, ps.title, MAX(pa.created_at) AS at, COUNT(*) AS n, COALESCE(SUM(pa.is_correct), 0) AS c
       FROM practice_attempts pa
       JOIN users u ON u.id = pa.user_id
       LEFT JOIN practice_sessions ps ON ps.id = pa.session_id
       GROUP BY pa.user_id, u.name, pa.session_id, ps.title, substr(pa.created_at, 1, 10)
       ORDER BY MAX(pa.created_at) DESC
       LIMIT ?`
    )
    .all(limit)) as { user_id: string; name: string; title: string | null; at: string; n: Num; c: Num }[];
  for (const row of practice) {
    const where = row.title ? ` in "${row.title}"` : "";
    events.push({
      at: row.at,
      userId: row.user_id,
      userName: row.name,
      kind: "practice",
      text: `answered ${plural(num(row.n), "Question Bank question")}${where} · ${num(row.c)} correct`,
    });
  }

  const finished = (await db
    .prepare(
      `SELECT sr.user_id, u.name, sr.source, sr.title, sr.section, sr.module, sr.correct_count, sr.total, sr.completed_at
       FROM study_results sr JOIN users u ON u.id = sr.user_id
       ORDER BY sr.completed_at DESC
       LIMIT ?`
    )
    .all(limit)) as {
    user_id: string;
    name: string;
    source: string;
    title: string;
    section: string;
    module: Num;
    correct_count: Num;
    total: Num;
    completed_at: string;
  }[];
  for (const row of finished) {
    const score = `${num(row.correct_count)}/${num(row.total)} correct`;
    if (row.source === "mock") {
      const moduleLabel = row.module === null || row.module === undefined ? "" : ` · module ${num(row.module)}`;
      events.push({
        at: row.completed_at,
        userId: row.user_id,
        userName: row.name,
        kind: "mock",
        text: `finished ${row.title} (${row.section}${moduleLabel}) · ${score}`,
      });
    } else {
      events.push({ at: row.completed_at, userId: row.user_id, userName: row.name, kind: "set", text: `submitted "${row.title}" · ${score}` });
    }
  }

  const vocab = (await db
    .prepare(
      `SELECT v.user_id, u.name, MAX(v.created_at) AS at, COUNT(*) AS n
       FROM vocabulary_words v JOIN users u ON u.id = v.user_id
       GROUP BY v.user_id, u.name, substr(v.created_at, 1, 10)
       ORDER BY MAX(v.created_at) DESC
       LIMIT 20`
    )
    .all()) as { user_id: string; name: string; at: string; n: Num }[];
  for (const row of vocab) {
    events.push({ at: row.at, userId: row.user_id, userName: row.name, kind: "vocab", text: `saved ${plural(num(row.n), "vocabulary word")}` });
  }

  const reports = (await db
    .prepare(
      `SELECT r.user_id, u.name, r.reason, r.created_at
       FROM question_reports r LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC
       LIMIT 20`
    )
    .all()) as { user_id: string | null; name: string | null; reason: string; created_at: string }[];
  for (const row of reports) {
    events.push({
      at: row.created_at,
      userId: row.user_id,
      userName: row.name ?? "A visitor",
      kind: "report",
      text: `reported a question (${REPORT_REASONS[row.reason] ?? row.reason})`,
    });
  }

  const shared = (await db
    .prepare(
      `SELECT ps.user_id, u.name, ps.title, ps.created_at
       FROM practice_sessions ps JOIN users u ON u.id = ps.user_id
       WHERE ps.type = 'qbank' AND ps.title LIKE 'Shared question%'
       ORDER BY ps.created_at DESC
       LIMIT 20`
    )
    .all()) as { user_id: string; name: string; title: string | null; created_at: string }[];
  for (const row of shared) {
    const topic = (row.title ?? "").replace(/^Shared question · /, "");
    events.push({
      at: row.created_at,
      userId: row.user_id,
      userName: row.name,
      kind: "shared",
      text: topic ? `opened a shared question (${topic})` : "opened a shared question",
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, limit);
}

/** Every account with its activity summary, newest account first. */
export async function listUsersMonitor(now: Date = new Date()): Promise<MonitorUserRow[]> {
  const weekStart = dayKeys(7, now)[0];
  const monthStart = dayKeys(30, now)[0];
  const rows = (await db
    .prepare(
      `WITH p AS (SELECT user_id, COUNT(*) AS n, SUM(is_correct) AS c, MAX(created_at) AS last_at
                  FROM practice_attempts GROUP BY user_id),
            m AS (SELECT user_id, COUNT(*) AS modules, SUM(total) AS n, SUM(correct_count) AS c
                  FROM study_results WHERE source = 'mock' GROUP BY user_id),
            s AS (SELECT user_id, MAX(completed_at) AS last_at FROM study_results GROUP BY user_id),
            t AS (SELECT user_id, MAX(started_at) AS last_at FROM attempts GROUP BY user_id),
            a AS (SELECT user_id, SUM(seconds) AS total_s,
                         SUM(CASE WHEN day >= ? THEN seconds ELSE 0 END) AS week_s
                  FROM user_activity GROUP BY user_id),
            d AS (SELECT user_id, COUNT(DISTINCT d) AS days30 FROM (${ACTIVE_UNION}) x GROUP BY user_id),
            sc AS (SELECT DISTINCT ON (att.user_id) att.user_id, r.estimated_score
                   FROM score_records r JOIN attempts att ON att.id = r.attempt_id
                   WHERE r.section = 'Total'
                   ORDER BY att.user_id, r.created_at DESC)
       SELECT u.id, u.name, u.email, u.country, u.is_guest, u.created_at, u.last_seen_at,
              COALESCE(p.n, 0) AS bank_n, COALESCE(p.c, 0) AS bank_c, p.last_at AS bank_last,
              COALESCE(m.modules, 0) AS mock_modules, COALESCE(m.n, 0) AS mock_n, COALESCE(m.c, 0) AS mock_c,
              s.last_at AS study_last, t.last_at AS attempt_last,
              COALESCE(a.total_s, 0) AS total_s, COALESCE(a.week_s, 0) AS week_s,
              COALESCE(d.days30, 0) AS days30, sc.estimated_score AS latest_score
       FROM users u
       LEFT JOIN p ON p.user_id = u.id
       LEFT JOIN m ON m.user_id = u.id
       LEFT JOIN s ON s.user_id = u.id
       LEFT JOIN t ON t.user_id = u.id
       LEFT JOIN a ON a.user_id = u.id
       LEFT JOIN d ON d.user_id = u.id
       LEFT JOIN sc ON sc.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all(weekStart, monthStart, monthStart, monthStart)) as {
    id: string;
    name: string;
    email: string;
    country: string | null;
    is_guest: Num;
    created_at: string;
    last_seen_at: string | null;
    bank_n: Num;
    bank_c: Num;
    bank_last: string | null;
    mock_modules: Num;
    mock_n: Num;
    mock_c: Num;
    study_last: string | null;
    attempt_last: string | null;
    total_s: Num;
    week_s: Num;
    days30: Num;
    latest_score: Num;
  }[];

  return rows.map((row) => {
    const questions = num(row.bank_n) + num(row.mock_n);
    const correct = num(row.bank_c) + num(row.mock_c);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      country: row.country && row.country.trim() ? row.country.trim() : null,
      isGuest: num(row.is_guest) === 1,
      isAdmin: isAdminEmail(row.email),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      lastActiveAt: latestIso(row.last_seen_at, row.bank_last, row.study_last, row.attempt_last),
      questions,
      correct,
      accuracyPct: pct(correct, questions),
      bankAnswered: num(row.bank_n),
      mockModules: num(row.mock_modules),
      latestScore: row.latest_score === null || row.latest_score === undefined ? null : num(row.latest_score),
      minutes7d: Math.round(num(row.week_s) / 60),
      minutesTotal: Math.round(num(row.total_s) / 60),
      activeDays30: num(row.days30),
    };
  });
}

/** Everything the user drawer shows for one account, or null if it's gone. */
export async function getUserMonitorDetail(userId: string, now: Date = new Date()): Promise<UserDetail | null> {
  const user = (await db
    .prepare("SELECT id, name, email, country, is_guest, created_at, last_seen_at FROM users WHERE id = ?")
    .get(userId)) as
    | { id: string; name: string; email: string; country: string | null; is_guest: Num; created_at: string; last_seen_at: string | null }
    | undefined;
  if (!user) return null;

  const today = dayKeys(1, now)[0];
  const month = dayKeys(30, now);
  const weekStart = dayKeys(7, now)[0];
  const monthStart = month[0];

  const time = (await db
    .prepare(
      `SELECT COALESCE(SUM(seconds) FILTER (WHERE day >= ?), 0) AS today,
              COALESCE(SUM(seconds) FILTER (WHERE day >= ?), 0) AS week,
              COALESCE(SUM(seconds) FILTER (WHERE day >= ?), 0) AS month,
              COALESCE(SUM(seconds), 0) AS total
       FROM user_activity WHERE user_id = ?`
    )
    .get(today, weekStart, monthStart, userId)) as { today: Num; week: Num; month: Num; total: Num };

  const bankBySection = (await db
    .prepare(
      "SELECT section, COUNT(*) AS n, COALESCE(SUM(is_correct), 0) AS c FROM practice_attempts WHERE user_id = ? GROUP BY section"
    )
    .all(userId)) as { section: string; n: Num; c: Num }[];
  const mockBySection = (await db
    .prepare(
      `SELECT section, COUNT(*) AS modules, COALESCE(SUM(total), 0) AS n, COALESCE(SUM(correct_count), 0) AS c
       FROM study_results WHERE user_id = ? AND source = 'mock' GROUP BY section`
    )
    .all(userId)) as { section: string; modules: Num; n: Num; c: Num }[];

  const sectionNames = ["Reading and Writing", "Math"];
  for (const row of [...bankBySection, ...mockBySection]) {
    if (!sectionNames.includes(row.section)) sectionNames.push(row.section);
  }
  const sections = sectionNames.map((section) => {
    const b = bankBySection.find((row) => row.section === section);
    const m = mockBySection.find((row) => row.section === section);
    const answered = num(b?.n) + num(m?.n);
    const correct = num(b?.c) + num(m?.c);
    return { section, answered, correct, bankAnswered: num(b?.n), mockAnswered: num(m?.n), accuracyPct: pct(correct, answered) };
  });

  const weakSkills = (
    (await db
      .prepare(
        `SELECT section, skill, COUNT(*) AS n, COALESCE(SUM(is_correct), 0) AS c
         FROM practice_attempts WHERE user_id = ?
         GROUP BY section, skill
         HAVING COUNT(*) >= 2
         ORDER BY SUM(is_correct)::float / COUNT(*) ASC, COUNT(*) DESC
         LIMIT 6`
      )
      .all(userId)) as { section: string; skill: string; n: Num; c: Num }[]
  ).map((row) => ({ section: row.section, skill: row.skill, attempts: num(row.n), accuracyPct: pct(num(row.c), num(row.n)) ?? 0 }));

  const minutesByDay = new Map(
    (
      (await db
        .prepare("SELECT day AS d, SUM(seconds) AS v FROM user_activity WHERE user_id = ? AND day >= ? GROUP BY day")
        .all(userId, monthStart)) as { d: string; v: Num }[]
    ).map((row) => [row.d, Math.round(num(row.v) / 60)] as [string, number])
  );
  const questionsByDay = dayMap(
    (await db
      .prepare(
        `SELECT d, SUM(v) AS v FROM (
           SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM practice_attempts
           WHERE user_id = ? AND created_at >= ? GROUP BY 1
           UNION ALL
           SELECT substr(completed_at, 1, 10) AS d, SUM(total) AS v FROM study_results
           WHERE user_id = ? AND source = 'mock' AND completed_at >= ? GROUP BY 1
         ) t GROUP BY d`
      )
      .all(userId, monthStart, userId, monthStart)) as { d: string; v: Num }[]
  );
  const daily = month.map((date) => ({ date, questions: questionsByDay.get(date) ?? 0, minutes: minutesByDay.get(date) ?? 0 }));

  const sessions: UserDetail["sessions"] = (
    (await db
      .prepare(
        `SELECT source, title, section, module, mode, correct_count, total, completed_at
         FROM study_results WHERE user_id = ? ORDER BY completed_at DESC LIMIT 12`
      )
      .all(userId)) as {
      source: string;
      title: string;
      section: string;
      module: Num;
      mode: string;
      correct_count: Num;
      total: Num;
      completed_at: string;
    }[]
  ).map((row) => ({
    source: row.source === "qbank" ? "qbank" : "mock",
    title: row.title,
    section: row.section,
    module: row.module === null || row.module === undefined ? null : num(row.module),
    mode: row.mode,
    correct: num(row.correct_count),
    total: num(row.total),
    completedAt: row.completed_at,
  }));

  const practiceSets = (
    (await db
      .prepare(
        `SELECT ps.title, MAX(pa.created_at) AS at, COUNT(*) AS n, COALESCE(SUM(pa.is_correct), 0) AS c
         FROM practice_attempts pa LEFT JOIN practice_sessions ps ON ps.id = pa.session_id
         WHERE pa.user_id = ?
         GROUP BY pa.session_id, ps.title
         ORDER BY MAX(pa.created_at) DESC
         LIMIT 8`
      )
      .all(userId)) as { title: string | null; at: string; n: Num; c: Num }[]
  ).map((row) => ({ title: row.title ?? "Question Bank practice", at: row.at, answered: num(row.n), correct: num(row.c) }));

  const features = (
    (await db
      .prepare("SELECT feature, SUM(seconds) AS s FROM user_activity WHERE user_id = ? GROUP BY feature ORDER BY SUM(seconds) DESC")
      .all(userId)) as { feature: string; s: Num }[]
  )
    .map((row) => ({ key: row.feature, label: featureLabel(row.feature), minutes: Math.round(num(row.s) / 60) }))
    .filter((row) => row.minutes > 0);

  const counts = (await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM vocabulary_words WHERE user_id = ?) AS vocab,
              (SELECT COUNT(*) FROM question_notes WHERE user_id = ?) AS notes,
              (SELECT COUNT(*) FROM mistake_journal_entries WHERE user_id = ?) AS journal,
              (SELECT COUNT(*) FROM question_reports WHERE user_id = ?) AS reports,
              (SELECT COUNT(*) FROM practice_sessions
                 WHERE user_id = ? AND type = 'qbank' AND title LIKE 'Shared question%') AS shared`
    )
    .get(userId, userId, userId, userId, userId)) as { vocab: Num; notes: Num; journal: Num; reports: Num; shared: Num };

  const latestScore = (await db
    .prepare(
      `SELECT r.estimated_score AS score FROM score_records r JOIN attempts a ON a.id = r.attempt_id
       WHERE a.user_id = ? AND r.section = 'Total' ORDER BY r.created_at DESC LIMIT 1`
    )
    .get(userId)) as { score: Num } | undefined;
  const lastAttempt = (await db.prepare("SELECT MAX(started_at) AS at FROM attempts WHERE user_id = ?").get(userId)) as
    | { at: string | null }
    | undefined;

  const questions = sections.reduce((sum, row) => sum + row.answered, 0);
  const correct = sections.reduce((sum, row) => sum + row.correct, 0);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      country: user.country && user.country.trim() ? user.country.trim() : null,
      isGuest: num(user.is_guest) === 1,
      isAdmin: isAdminEmail(user.email),
      createdAt: user.created_at,
      lastSeenAt: user.last_seen_at,
      lastActiveAt: latestIso(user.last_seen_at, practiceSets[0]?.at, sessions[0]?.completedAt, lastAttempt?.at),
    },
    time: {
      todayMinutes: Math.round(num(time.today) / 60),
      weekMinutes: Math.round(num(time.week) / 60),
      monthMinutes: Math.round(num(time.month) / 60),
      totalMinutes: Math.round(num(time.total) / 60),
    },
    totals: {
      questions,
      correct,
      accuracyPct: pct(correct, questions),
      bankAnswered: bankBySection.reduce((sum, row) => sum + num(row.n), 0),
      mockModules: mockBySection.reduce((sum, row) => sum + num(row.modules), 0),
      latestScore: latestScore ? num(latestScore.score) : null,
    },
    sections,
    weakSkills,
    daily,
    sessions,
    practiceSets,
    features,
    counts: {
      vocab: num(counts.vocab),
      notes: num(counts.notes),
      journal: num(counts.journal),
      reports: num(counts.reports),
      shared: num(counts.shared),
    },
  };
}

/** Who the heartbeat saw in the last few minutes (polled by the dashboard). */
export async function getLiveSnapshot(now: Date = new Date()): Promise<LiveSnapshot> {
  const cutoff = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
  const rows = (await db
    .prepare("SELECT id, name, last_seen_at FROM users WHERE last_seen_at >= ? ORDER BY last_seen_at DESC LIMIT 50")
    .all(cutoff)) as { id: string; name: string; last_seen_at: string }[];
  return {
    liveNow: rows.length,
    users: rows.map((row) => ({ id: row.id, name: row.name, lastSeenAt: row.last_seen_at })),
    generatedAt: now.toISOString(),
  };
}
