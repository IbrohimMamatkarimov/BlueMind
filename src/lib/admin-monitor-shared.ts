/**
 * Types and pure helpers for the admin "Users & activity" tab.
 *
 * Both the server queries (src/lib/admin-monitor.ts) and the React
 * dashboard use this file, so it must never import the database.
 */

export type RangeDays = 7 | 30 | 90;
export const RANGE_OPTIONS: RangeDays[] = [7, 30, 90];

export function normalizeRange(raw: unknown): RangeDays {
  const value = Number(raw);
  return value === 7 || value === 90 ? value : 30;
}

/** Someone counts as online when the heartbeat saw them this recently. */
export const LIVE_WINDOW_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function pct(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** UTC calendar days (YYYY-MM-DD), oldest first, ending with today. */
export function dayKeys(days: number, now: Date = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

export interface TrendPoint {
  date: string;
  activeUsers: number;
  signups: number;
  questions: number;
  minutes: number;
}
export type TrendMetric = Exclude<keyof TrendPoint, "date">;

/** One zero-filled point per day, so quiet days show as 0 instead of vanishing. */
export function buildTrend(days: string[], parts: Partial<Record<TrendMetric, Map<string, number>>>): TrendPoint[] {
  return days.map((date) => ({
    date,
    activeUsers: parts.activeUsers?.get(date) ?? 0,
    signups: parts.signups?.get(date) ?? 0,
    questions: parts.questions?.get(date) ?? 0,
    minutes: parts.minutes?.get(date) ?? 0,
  }));
}

/** The latest of several ISO timestamps (they sort as strings). */
export function latestIso(...values: (string | null | undefined)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest;
}

export type UserStatus = "online" | "active" | "idle" | "inactive" | "never";

export const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  active: "Active",
  idle: "Idle",
  inactive: "Inactive",
  never: "No activity yet",
};

/** Online within 3 minutes, active within 7 days, idle within 30, then inactive. */
export function userStatus(lastSeenAt: string | null, lastActiveAt: string | null, now: Date = new Date()): UserStatus {
  const t = now.getTime();
  if (lastSeenAt && t - Date.parse(lastSeenAt) <= LIVE_WINDOW_MS) return "online";
  const last = latestIso(lastSeenAt, lastActiveAt);
  if (!last) return "never";
  const age = t - Date.parse(last);
  if (age <= 7 * DAY_MS) return "active";
  if (age <= 30 * DAY_MS) return "idle";
  return "inactive";
}

export function isNewUser(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - Date.parse(createdAt) <= 7 * DAY_MS;
}

export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const diff = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A cell starting with = + - @ runs as a formula when opened in a spreadsheet.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/* ---------------------------------------------------------------------- */
/* Payloads                                                               */
/* ---------------------------------------------------------------------- */

export interface OverviewTiles {
  registered: number;
  guests: number;
  admins: number;
  liveNow: number;
  activeUsers: number;
  newSignups: number;
  questionsAnswered: number;
  accuracyPct: number | null;
  minutesOnSite: number;
  mockModules: number;
  /** First day the heartbeat recorded anything, or null before that. */
  trackingSince: string | null;
}

export interface FeatureTime {
  key: string;
  label: string;
  minutes: number;
  users: number;
}

export interface ActionCount {
  key: string;
  label: string;
  count: number;
  users: number;
}

export interface ActiveUserRow {
  id: string;
  name: string;
  email: string;
  questions: number;
  accuracyPct: number | null;
  minutes: number;
  lastSeenAt: string | null;
}

export interface QuestionStat {
  id: string;
  externalId: string | null;
  section: string;
  skill: string;
  difficulty: string;
  attempts: number;
  users: number;
  accuracyPct: number;
}

export interface CountryRow {
  country: string;
  users: number;
}

export type ActivityKind = "signup" | "practice" | "mock" | "set" | "vocab" | "report" | "shared";

export interface ActivityEvent {
  at: string;
  userId: string | null;
  userName: string;
  kind: ActivityKind;
  text: string;
}

export interface AdminOverview {
  rangeDays: RangeDays;
  generatedAt: string;
  tiles: OverviewTiles;
  trend: TrendPoint[];
  featureTime: FeatureTime[];
  actions: ActionCount[];
  mostActive: ActiveUserRow[];
  hardest: QuestionStat[];
  easiest: QuestionStat[];
  countries: CountryRow[];
  recent: ActivityEvent[];
}

export interface LiveSnapshot {
  liveNow: number;
  users: { id: string; name: string; lastSeenAt: string }[];
  generatedAt: string;
}

export interface MonitorUserRow {
  id: string;
  name: string;
  email: string;
  country: string | null;
  isGuest: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  questions: number;
  correct: number;
  accuracyPct: number | null;
  bankAnswered: number;
  mockModules: number;
  latestScore: number | null;
  minutes7d: number;
  minutesTotal: number;
  activeDays30: number;
}

export interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    country: string | null;
    isGuest: boolean;
    isAdmin: boolean;
    createdAt: string;
    lastSeenAt: string | null;
    lastActiveAt: string | null;
  };
  time: { todayMinutes: number; weekMinutes: number; monthMinutes: number; totalMinutes: number };
  totals: {
    questions: number;
    correct: number;
    accuracyPct: number | null;
    bankAnswered: number;
    mockModules: number;
    latestScore: number | null;
  };
  sections: {
    section: string;
    answered: number;
    correct: number;
    bankAnswered: number;
    mockAnswered: number;
    accuracyPct: number | null;
  }[];
  weakSkills: { section: string; skill: string; attempts: number; accuracyPct: number }[];
  daily: { date: string; questions: number; minutes: number }[];
  sessions: {
    source: "mock" | "qbank";
    title: string;
    section: string;
    module: number | null;
    mode: string;
    correct: number;
    total: number;
    completedAt: string;
  }[];
  practiceSets: { title: string; at: string; answered: number; correct: number }[];
  features: { key: string; label: string; minutes: number }[];
  counts: { vocab: number; notes: number; journal: number; reports: number; shared: number };
}

/* ---------------------------------------------------------------------- */
/* Users table: filters, search, sorting                                  */
/* ---------------------------------------------------------------------- */

export type UserFilter = "all" | "online" | "active" | "new" | "inactive" | "admins";

export const USER_FILTERS: { key: UserFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online now" },
  { key: "active", label: "Active 7d" },
  { key: "new", label: "New this week" },
  { key: "inactive", label: "Inactive 30d+" },
  { key: "admins", label: "Admins" },
];

export function matchesUserFilter(row: MonitorUserRow, filter: UserFilter, now: Date = new Date()): boolean {
  const status = userStatus(row.lastSeenAt, row.lastActiveAt, now);
  switch (filter) {
    case "online":
      return status === "online";
    case "active":
      return status === "online" || status === "active";
    case "new":
      return isNewUser(row.createdAt, now);
    case "inactive":
      return status === "inactive" || status === "never";
    case "admins":
      return row.isAdmin;
    default:
      return true;
  }
}

export function matchesSearch(row: MonitorUserRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.name, row.email, row.country ?? "", row.id].some((value) => value.toLowerCase().includes(needle));
}

export type UserSortKey =
  | "name"
  | "createdAt"
  | "lastActive"
  | "questions"
  | "accuracy"
  | "mockModules"
  | "minutes7d"
  | "activeDays30"
  | "country";
export type SortDir = "asc" | "desc";

function sortValue(row: MonitorUserRow, key: UserSortKey): string | number {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "createdAt":
      return row.createdAt;
    case "lastActive":
      return latestIso(row.lastSeenAt, row.lastActiveAt) ?? "";
    case "questions":
      return row.questions;
    case "accuracy":
      return row.accuracyPct ?? -1;
    case "mockModules":
      return row.mockModules;
    case "minutes7d":
      return row.minutes7d;
    case "activeDays30":
      return row.activeDays30;
    case "country":
      return (row.country ?? "").toLowerCase();
  }
}

/** Sorted copy; ties fall back to the name so the order is stable. */
export function sortUsers(rows: MonitorUserRow[], key: UserSortKey, dir: SortDir): MonitorUserRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return a.name.localeCompare(b.name);
  });
}
