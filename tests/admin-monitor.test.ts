import assert from "node:assert/strict";
import test from "node:test";
import { clampPingSeconds, featureForPath, featureLabel } from "../src/lib/activity";
import {
  buildTrend,
  dayKeys,
  formatMinutes,
  matchesSearch,
  matchesUserFilter,
  normalizeRange,
  sortUsers,
  timeAgo,
  toCsv,
  userStatus,
  type MonitorUserRow,
} from "../src/lib/admin-monitor-shared";

const NOW = new Date("2026-09-11T12:00:00Z");

function user(overrides: Partial<MonitorUserRow> = {}): MonitorUserRow {
  return {
    id: "user_1",
    name: "Emperor",
    email: "emperor@example.com",
    country: "Uzbekistan",
    isGuest: false,
    isAdmin: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    lastSeenAt: null,
    lastActiveAt: null,
    questions: 0,
    correct: 0,
    accuracyPct: null,
    bankAnswered: 0,
    mockModules: 0,
    latestScore: null,
    minutes7d: 0,
    minutesTotal: 0,
    activeDays30: 0,
    ...overrides,
  };
}

test("pages fold into a few readable features, never raw URLs", () => {
  assert.equal(featureForPath("/practice/qbank/Reading%20and%20Writing/set_x"), "qbank-practice");
  assert.equal(featureForPath("/practice/browse"), "qbank-browse");
  assert.equal(featureForPath("/practice"), "qbank-browse");
  assert.equal(featureForPath("/practice/mock_1/Math/2"), "mock-test");
  assert.equal(featureForPath("/practice/mock_1/full"), "full-exam");
  assert.equal(featureForPath("/q/q_abc"), "shared");
  assert.equal(featureForPath("/progress?tab=math"), "progress");
  assert.equal(featureForPath("/"), "home");
  assert.equal(featureForPath("/something-new"), "other");
  assert.equal(featureLabel("qbank-practice"), "Question Bank practice");
  assert.equal(featureLabel("nope"), "Other pages");
});

test("heartbeat reports are clamped to 0-120 whole seconds", () => {
  assert.equal(clampPingSeconds(-5), 0);
  assert.equal(clampPingSeconds("abc"), 0);
  assert.equal(clampPingSeconds(61.4), 61);
  assert.equal(clampPingSeconds(9999), 120);
});

test("daily series are zero-filled, oldest first, in UTC", () => {
  const days = dayKeys(3, new Date("2026-09-11T23:30:00Z"));
  assert.deepEqual(days, ["2026-09-09", "2026-09-10", "2026-09-11"]);
  const trend = buildTrend(days, { questions: new Map([["2026-09-10", 7]]) });
  assert.deepEqual(trend.map((point) => point.questions), [0, 7, 0]);
  assert.deepEqual(trend.map((point) => point.activeUsers), [0, 0, 0]);
  assert.equal(normalizeRange("90"), 90);
  assert.equal(normalizeRange("365"), 30);
});

test("status: online within 3 minutes, active within 7 days, idle within 30", () => {
  assert.equal(userStatus("2026-09-11T11:58:30.000Z", null, NOW), "online");
  assert.equal(userStatus("2026-09-11T11:50:00.000Z", null, NOW), "active");
  assert.equal(userStatus(null, "2026-09-01T12:00:00.000Z", NOW), "idle");
  assert.equal(userStatus(null, "2026-07-01T12:00:00.000Z", NOW), "inactive");
  assert.equal(userStatus(null, null, NOW), "never");
});

test("filters and search pick the right users", () => {
  const online = user({ id: "a", lastSeenAt: "2026-09-11T11:59:00.000Z" });
  const dormant = user({ id: "b", name: "Dormant", createdAt: "2026-05-01T00:00:00.000Z", lastActiveAt: "2026-06-01T00:00:00.000Z" });
  const fresh = user({ id: "c", name: "Fresh", createdAt: "2026-09-10T00:00:00.000Z", isAdmin: true });
  assert.equal(matchesUserFilter(online, "online", NOW), true);
  assert.equal(matchesUserFilter(online, "active", NOW), true);
  assert.equal(matchesUserFilter(dormant, "inactive", NOW), true);
  assert.equal(matchesUserFilter(fresh, "inactive", NOW), true);
  assert.equal(matchesUserFilter(fresh, "new", NOW), true);
  assert.equal(matchesUserFilter(dormant, "new", NOW), false);
  assert.equal(matchesUserFilter(fresh, "admins", NOW), true);
  assert.equal(matchesSearch(dormant, "dorm"), true);
  assert.equal(matchesSearch(dormant, "uzbek"), true);
  assert.equal(matchesSearch(dormant, "tashkent"), false);
});

test("sorting by last active puts recent users first and never-active users last", () => {
  const rows = [
    user({ id: "never", name: "Never" }),
    user({ id: "old", name: "Old", lastActiveAt: "2026-08-01T00:00:00.000Z" }),
    user({ id: "new", name: "New", lastSeenAt: "2026-09-11T11:00:00.000Z" }),
  ];
  assert.deepEqual(sortUsers(rows, "lastActive", "desc").map((row) => row.id), ["new", "old", "never"]);
  assert.deepEqual(sortUsers(rows, "name", "asc").map((row) => row.id), ["never", "new", "old"]);
});

test("CSV export escapes quotes and commas and neutralises spreadsheet formulas", () => {
  const csv = toCsv([
    ["Name", "Note"],
    ['Ann "A", Jr', "=HYPERLINK(1)"],
    [5, null],
  ]);
  assert.equal(csv, 'Name,Note\r\n"Ann ""A"", Jr",\'=HYPERLINK(1)\r\n5,');
});

test("times read naturally", () => {
  assert.equal(timeAgo("2026-09-11T11:59:30.000Z", NOW), "just now");
  assert.equal(timeAgo("2026-09-11T11:15:00.000Z", NOW), "45 min ago");
  assert.equal(timeAgo("2026-09-11T07:00:00.000Z", NOW), "5 h ago");
  assert.equal(timeAgo("2026-09-08T12:00:00.000Z", NOW), "3 d ago");
  assert.equal(timeAgo(null, NOW), "—");
  assert.equal(formatMinutes(0), "0 min");
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(200), "3 h 20 min");
});
