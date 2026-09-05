import { db } from "./db";

export interface SkillStatRow {
  skill: string;
  domain: string;
  section: string;
  correct: number;
  attempted: number;
}

async function getSkillStats(userId: string): Promise<SkillStatRow[]> {
  return (await db
    .prepare(
      "SELECT skill, domain, section, correct, attempted FROM skill_stats WHERE user_id = ? AND attempted > 0"
    )
    .all(userId)) as SkillStatRow[];
}

function accuracy(row: SkillStatRow) {
  return row.attempted === 0 ? 0 : (row.correct / row.attempted) * 100;
}

export interface DomainOpportunity {
  label: string;
  opportunity: number; // heuristic "potential improvement" points, NOT guaranteed
}

/**
 * "Where are your next 100 points?" — a transparent, explainable heuristic:
 * for each domain, average the accuracy of its skills, then convert the gap
 * from 100% into a rough point-opportunity score. This is intentionally
 * simple and disclosed, not a black-box prediction, and is always framed to
 * students as a "potential improvement area" rather than a guarantee.
 */
export async function computeNext100(userId: string): Promise<DomainOpportunity[]> {
  const stats = await getSkillStats(userId);
  const byDomain = new Map<string, { sum: number; count: number }>();
  for (const row of stats) {
    const acc = accuracy(row);
    const entry = byDomain.get(row.domain) ?? { sum: 0, count: 0 };
    entry.sum += acc;
    entry.count += 1;
    byDomain.set(row.domain, entry);
  }

  const opportunities: DomainOpportunity[] = [];
  for (const [domain, { sum, count }] of byDomain) {
    const avgAccuracy = sum / count;
    const opportunity = Math.min(45, Math.max(5, Math.round((100 - avgAccuracy) * 0.95)));
    opportunities.push({ label: domain, opportunity });
  }
  opportunities.sort((a, b) => b.opportunity - a.opportunity);

  const top = opportunities.slice(0, 3);

  // Timing is computed separately from actual pacing data across recent attempts.
  const timingRows = (await db
    .prepare(
      `SELECT time_spent_seconds, a.question_id, q.estimated_time
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       JOIN attempts att ON att.id = a.attempt_id
       WHERE att.user_id = ? AND att.status = 'completed'
       ORDER BY a.created_at DESC LIMIT 200`
    )
    .all(userId)) as { time_spent_seconds: number; estimated_time: number }[];

  let timingOpportunity = 10;
  if (timingRows.length > 0) {
    const overtimeCount = timingRows.filter((r) => r.time_spent_seconds > r.estimated_time * 1.3).length;
    const overtimeRate = overtimeCount / timingRows.length;
    timingOpportunity = Math.min(25, Math.max(5, Math.round(overtimeRate * 40)));
  }

  return [...top, { label: "Timing", opportunity: timingOpportunity }];
}

export async function computeWeakestSkill(userId: string): Promise<SkillStatRow | null> {
  const stats = (await getSkillStats(userId)).filter((s) => s.attempted >= 2);
  if (stats.length === 0) return null;
  stats.sort((a, b) => accuracy(a) - accuracy(b));
  return stats[0];
}

export interface WeaknessBucket {
  skill: string;
  status: "strong" | "improving" | "needs_practice";
  accuracy: number;
}

/** Powers the "Your BlueMind" blue-brain profile: strong / improving / needs practice. */
export async function computeBlueMindProfile(userId: string): Promise<WeaknessBucket[]> {
  const stats = (await getSkillStats(userId)).filter((s) => s.attempted >= 2);
  return stats
    .map((s) => {
      const acc = accuracy(s);
      const status: WeaknessBucket["status"] =
        acc >= 78 ? "strong" : acc >= 60 ? "improving" : "needs_practice";
      return { skill: s.skill, status, accuracy: Math.round(acc) };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

export async function getLatestCompletedAttempt(userId: string) {
  return (await db
    .prepare(
      `SELECT att.id as attemptId, att.completed_at, m.title as mockTitle, m.id as mockId
       FROM attempts att JOIN mocks m ON m.id = att.mock_id
       WHERE att.user_id = ? AND att.status = 'completed'
       ORDER BY att.completed_at DESC LIMIT 1`
    )
    .get(userId)) as { attemptId: string; completed_at: string; mockTitle: string; mockId: string } | undefined;
}

export async function getFirstCompletedAttempt(userId: string) {
  return (await db
    .prepare(
      `SELECT att.id as attemptId, att.completed_at
       FROM attempts att
       WHERE att.user_id = ? AND att.status = 'completed'
       ORDER BY att.completed_at ASC LIMIT 1`
    )
    .get(userId)) as { attemptId: string; completed_at: string } | undefined;
}

export async function getScoreForAttempt(attemptId: string) {
  const rows = (await db
    .prepare("SELECT section, estimated_score, is_official_conversion FROM score_records WHERE attempt_id = ?")
    .all(attemptId)) as { section: string; estimated_score: number; is_official_conversion: number }[];
  const total = rows.find((r) => r.section === "Total");
  const rw = rows.find((r) => r.section === "Reading and Writing");
  const math = rows.find((r) => r.section === "Math");
  return {
    total: total?.estimated_score ?? null,
    rw: rw?.estimated_score ?? null,
    math: math?.estimated_score ?? null,
    isOfficial: !!total?.is_official_conversion,
  };
}

export async function getContinueAttempt(userId: string) {
  return (await db
    .prepare(
      `SELECT att.id as attemptId, att.current_section as currentSection, att.current_module as currentModule,
              m.title as mockTitle
       FROM attempts att JOIN mocks m ON m.id = att.mock_id
       WHERE att.user_id = ? AND att.status = 'in_progress'
       ORDER BY att.started_at DESC LIMIT 1`
    )
    .get(userId)) as
    | { attemptId: string; currentSection: string; currentModule: number; mockTitle: string }
    | undefined;
}

export async function getRecentMistakesCount(userId: string, limit = 3) {
  const rows = (await db
    .prepare(
      `SELECT a.id FROM answers a
       JOIN attempts att ON att.id = a.attempt_id
       WHERE att.user_id = ? AND att.status = 'completed' AND a.is_correct = 0
       ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(userId, limit)) as { id: string }[];
  return rows.length;
}
