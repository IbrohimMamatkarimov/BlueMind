import { db } from "./db";

/**
 * Usage tracking for the admin dashboard: "online now", active users, time
 * on BlueMind, and which parts of the site get used.
 *
 * ActivityHeartbeat posts to /api/activity/ping about once a minute while a
 * signed-in person has a BlueMind tab visible. Each report adds its seconds
 * to one (user, UTC day, feature) row and stamps users.last_seen_at.
 *
 * Paths are folded into a small fixed set of features, so the table stays
 * tiny and readable. No URLs, set IDs or question IDs are stored.
 */

const FEATURES: { key: string; label: string; test: RegExp }[] = [
  { key: "qbank-practice", label: "Question Bank practice", test: /^\/practice\/qbank\// },
  { key: "full-exam", label: "Full exams", test: /^\/practice\/[^/]+\/full\/?$/ },
  { key: "mock-test", label: "Mock tests", test: /^\/practice\/[^/]+\/[^/]+\/[^/]+\/?$/ },
  { key: "qbank-browse", label: "Question Bank browsing", test: /^\/practice(\/browse)?\/?$/ },
  { key: "mocks", label: "Mock library", test: /^\/mocks(\/|$)/ },
  { key: "today", label: "Today", test: /^\/today(\/|$)/ },
  { key: "dashboard", label: "Dashboard", test: /^\/dashboard(\/|$)/ },
  { key: "progress", label: "Progress", test: /^\/progress(\/|$)/ },
  // Keyed "mistakes" from before the rename, so earlier rows keep counting.
  { key: "mistakes", label: "Notebook", test: /^\/(notebook|mistakes)(\/|$)/ },
  { key: "vocabulary", label: "Vocabulary", test: /^\/vocabulary(\/|$)/ },
  { key: "shared", label: "Shared questions", test: /^\/q\// },
  { key: "account", label: "Account", test: /^\/account(\/|$)/ },
  { key: "coach", label: "Coach", test: /^\/coach(\/|$)/ },
  { key: "admin", label: "Admin", test: /^\/admin(\/|$)/ },
];

const LABELS = new Map<string, string>([
  ...FEATURES.map((feature) => [feature.key, feature.label] as [string, string]),
  ["home", "Home page"],
  ["other", "Other pages"],
]);

/** The coarse feature a page belongs to ("qbank-practice", "mock-test", …). */
export function featureForPath(rawPath: string): string {
  const path = (rawPath.split(/[?#]/)[0] ?? "").trim();
  if (path === "" || path === "/") return "home";
  for (const feature of FEATURES) {
    if (feature.test.test(path)) return feature.key;
  }
  return "other";
}

export function featureLabel(key: string): string {
  return LABELS.get(key) ?? "Other pages";
}

/** The most one heartbeat report may add (the client reports every 60 s). */
export const PING_MAX_SECONDS = 120;

export function clampPingSeconds(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(PING_MAX_SECONDS, Math.round(value)));
}

export async function recordActivity(userId: string, path: string, seconds: number, now: Date = new Date()): Promise<void> {
  const at = now.toISOString();
  await db
    .prepare(
      `INSERT INTO user_activity (user_id, day, feature, seconds, pings, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (user_id, day, feature) DO UPDATE
         SET seconds = user_activity.seconds + EXCLUDED.seconds,
             pings = user_activity.pings + 1,
             last_seen_at = EXCLUDED.last_seen_at`
    )
    .run(userId, at.slice(0, 10), featureForPath(path), seconds, at, at);
  await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(at, userId);
}
