import { db } from "./db";
import { SAT_STRUCTURE, SAT_TEST_MONTHS } from "./sat-constants";

export interface PublicMockRow {
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
}

export interface ModuleAvailability {
  module: 1 | 2;
  questionCount: number;
}

export interface PublicMockCard {
  id: string;
  title: string;
  subtitle: string | null;
  month: string;
  year: number;
  totalQuestions: number;
  durationMinutes: number;
  math: ModuleAvailability[];
  readingWriting: ModuleAvailability[];
}

export interface PublicGroup {
  key: string;
  label: string;
  mocks: PublicMockCard[];
}

const GROUP_ORDER = ["2026", "2025", "2024", "2023"];

/**
 * Builds the public mock library grouped for the landing page — mirrors a
 * "browse by year" mock-test directory. No user context required, so this
 * is safe to call for signed-out visitors. Question counts per module come
 * straight from the questions table (module 2's count uses the 'higher'
 * pool, since public quick-practice pins Module 2 to a single fixed pool
 * rather than routing adaptively — adaptive routing only applies inside a
 * signed-in full Mock attempt).
 *
 * Groups are ALWAYS exactly the four years in GROUP_ORDER, even when a year
 * has zero mocks yet (so the sidebar shows "2023" with 0 tests rather than
 * hiding it) — any mock whose group_label isn't one of these four years is
 * left out of the public library entirely.
 */
export async function getPublicMockLibrary(): Promise<PublicGroup[]> {
  return buildMockLibrary({ gateOnRelease: true });
}

/**
 * Same shape as getPublicMockLibrary, but ignores the release flag entirely
 * — returns the TRUE question counts regardless of whether an admin has
 * hit "Release" yet. This is what powers the "Manage Questions" vs "Start
 * Practice" decision on the admin's own /mocks view: that choice should
 * depend on whether questions exist, not on whether they're visible to
 * students yet (those are two separate, independent concepts — release
 * status is still fully controlled from the Admin panel's own toggle).
 * Admin-only; callers must gate access with requireAdmin() themselves.
 */
export async function getAdminMockLibrary(): Promise<PublicGroup[]> {
  return buildMockLibrary({ gateOnRelease: false });
}

async function buildMockLibrary({ gateOnRelease }: { gateOnRelease: boolean }): Promise<PublicGroup[]> {
  const mocks = (await db
    .prepare(
      `SELECT id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official
       FROM mocks ORDER BY year DESC, order_in_month ASC`
    )
    .all()) as unknown as PublicMockRow[];

  const countStmt = db.prepare(
    `SELECT COUNT(*) as n FROM questions WHERE mock_id = ? AND section = ? AND module = ? AND (module_pool IS NULL OR module_pool = 'higher')`
  );
  const releasedStmt = db.prepare(
    `SELECT released FROM module_releases WHERE mock_id = ? AND section = ? AND module = ?`
  );
  async function isReleased(mockId: string, section: string, module: 1 | 2): Promise<boolean> {
    const row = (await releasedStmt.get(mockId, section, module)) as { released: number } | undefined;
    return !!row?.released;
  }
  async function moduleCount(mockId: string, section: string, module: 1 | 2): Promise<number> {
    if (gateOnRelease && !(await isReleased(mockId, section, module))) return 0;
    return ((await countStmt.get(mockId, section, module)) as { n: number }).n;
  }

  const cards: (PublicMockCard & { group_label: string })[] = [];
  for (const m of mocks) {
    // A module only counts as available once it's BOTH banked with
    // questions AND explicitly released by the admin — otherwise it shows
    // "Coming soon" even with questions sitting in the bank, so half-built
    // modules never accidentally go live to students. (Skipped entirely in
    // the admin variant — see gateOnRelease above.)
    const mathM1 = await moduleCount(m.id, "Math", 1);
    const mathM2 = await moduleCount(m.id, "Math", 2);
    const rwM1 = await moduleCount(m.id, "Reading and Writing", 1);
    const rwM2 = await moduleCount(m.id, "Reading and Writing", 2);
    cards.push({
      id: m.id,
      title: m.title,
      subtitle: m.subtitle,
      month: m.month,
      year: m.year,
      totalQuestions: m.total_questions,
      durationMinutes: m.duration_minutes,
      math: [
        { module: 1, questionCount: mathM1 },
        { module: 2, questionCount: mathM2 },
      ],
      readingWriting: [
        { module: 1, questionCount: rwM1 },
        { module: 2, questionCount: rwM2 },
      ],
      group_label: m.group_label,
    });
  }

  const byGroup = new Map<string, PublicMockCard[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const c of cards) {
    const { group_label, month, ...rest } = c;
    if (!byGroup.has(group_label)) continue; // not one of the four fixed years — left out of the public library
    // Real SAT test months only — a mock dated to a month the exam was never
    // actually held in (leftover bad data, or an admin typo before the
    // picker was locked down) never reaches students.
    if (!(SAT_TEST_MONTHS as readonly string[]).includes(month)) continue;
    byGroup.get(group_label)!.push({ ...rest, month });
  }

  return GROUP_ORDER.map((key) => ({ key, label: key, mocks: byGroup.get(key)! }));
}

export async function getModuleQuestionsPublic(mockId: string, section: string, module: 1 | 2) {
  if (module === 1) {
    return (await db
      .prepare("SELECT * FROM questions WHERE mock_id = ? AND section = ? AND module = 1 ORDER BY position, created_at")
      .all(mockId, section)) as unknown as any[];
  }
  return (await db
    .prepare(
      "SELECT * FROM questions WHERE mock_id = ? AND section = ? AND module = 2 AND module_pool = 'higher' ORDER BY position, created_at"
    )
    .all(mockId, section)) as unknown as any[];
}

export function moduleMinutes(section: string) {
  return section === "Math" ? SAT_STRUCTURE.math.minutesPerModule : SAT_STRUCTURE.readingWriting.minutesPerModule;
}
