"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronsUpDown,
  ClipboardCheck,
  Clock,
  Download,
  Flag,
  ListChecks,
  Radio,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Target,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  RANGE_OPTIONS,
  STATUS_LABEL,
  USER_FILTERS,
  formatMinutes,
  isNewUser,
  latestIso,
  matchesSearch,
  matchesUserFilter,
  pct,
  plural,
  sortUsers,
  timeAgo,
  toCsv,
  userStatus,
  type ActivityEvent,
  type ActivityKind,
  type AdminOverview,
  type LiveSnapshot,
  type MonitorUserRow,
  type QuestionStat,
  type RangeDays,
  type SortDir,
  type TrendMetric,
  type TrendPoint,
  type UserDetail,
  type UserFilter,
  type UserSortKey,
  type UserStatus,
} from "@/lib/admin-monitor-shared";

/*
 * Admin "Users & activity" tab, modelled on the iGeoUz Admin Command Center:
 * a live counter, KPI tiles, a daily trend, usage breakdowns, most active
 * users, hardest/easiest questions, a recent-activity feed, and a
 * searchable, sortable users table with a per-user drawer and CSV export.
 *
 * Charts follow the house data-viz rules: one series per chart in the brand
 * blue (--viz-1), hairline grids, a tooltip on hover, and a data table for
 * every plotted series. The date range sits above everything it scopes.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

function shortDate(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? fallback);
  return data as T;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/* ---------------------------------------------------------------------- */
/* Page                                                                   */
/* ---------------------------------------------------------------------- */

export function AdminMonitor() {
  const [range, setRange] = useState<RangeDays>(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [users, setUsers] = useState<MonitorUserRow[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadOverview = useCallback(async (days: RangeDays) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      setOverview(await getJson<AdminOverview>(`/api/admin/overview?days=${days}`, "Could not load the dashboard."));
      setNow(new Date());
    } catch (error) {
      setOverviewError(messageOf(error, "Could not load the dashboard."));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersError(null);
    try {
      const data = await getJson<{ users: MonitorUserRow[] }>("/api/admin/users", "Could not load users.");
      setUsers(data.users);
    } catch (error) {
      setUsersError(messageOf(error, "Could not load users."));
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      setLive(await getJson<LiveSnapshot>("/api/admin/live", "Could not check who is online."));
      setNow(new Date());
    } catch {
      // Keep the last count; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    void loadOverview(range);
  }, [range, loadOverview]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadLive();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadLive();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadLive]);

  const closeDetail = useCallback(() => setDetailId(null), []);

  function refresh() {
    void loadOverview(range);
    void loadUsers();
    void loadLive();
  }

  return (
    <div className="space-y-6">
      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-brand-border bg-white p-0.5">
          {RANGE_OPTIONS.map((days) => (
            <button
              key={days}
              onClick={() => setRange(days)}
              aria-pressed={range === days}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                range === days ? "bg-brand-blue text-white" : "text-brand-slate hover:text-brand-navy"
              }`}
            >
              Last {days} days
            </button>
          ))}
        </div>
        <LiveTag live={live} />
        <div className="ml-auto flex items-center gap-3 text-xs text-brand-slate">
          {overview && <span>Updated {timeAgo(overview.generatedAt, now)}</span>}
          <button onClick={refresh} className="btn-secondary inline-flex items-center gap-1.5 text-xs">
            <RefreshCw size={14} className={overviewLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {overviewError && (
        <p role="alert" className="rounded-lg bg-brand-red-light px-3 py-2 text-sm text-brand-red">
          {overviewError}
        </p>
      )}

      {!overview ? (
        !overviewError && <OverviewSkeleton />
      ) : (
        // Refetching keeps the previous render, dimmed — no skeleton flash.
        <div className={`space-y-6 transition-opacity ${overviewLoading ? "opacity-60" : ""}`}>
          <KpiRow tiles={overview.tiles} liveNow={live?.liveNow ?? overview.tiles.liveNow} range={range} />
          <TrendCard trend={overview.trend} range={range} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Where time goes" subtitle={`Minutes on each part of BlueMind · last ${range} days`}>
              <BarList
                rows={overview.featureTime.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.minutes,
                  display: formatMinutes(row.minutes),
                  hint: `${formatMinutes(row.minutes)} by ${plural(row.users, "person", "people")}`,
                }))}
                empty="Nothing yet. Time on each page appears here as people use BlueMind."
              />
            </Panel>
            <Panel title="What people did" subtitle={`Last ${range} days`}>
              <ul className="space-y-0.5">
                {overview.actions.map((action) => (
                  <li
                    key={action.key}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 rounded-md px-1 py-1.5 hover:bg-slate-50"
                  >
                    <span className="truncate text-sm text-brand-navy">{action.label}</span>
                    <span className="text-sm font-semibold tabular-nums text-brand-navy">{fmt(action.count)}</span>
                    <span className="w-24 text-right text-xs tabular-nums text-brand-slate">
                      {action.count > 0 ? `by ${plural(action.users, "person", "people")}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Most active users" subtitle={`By time on BlueMind, then questions · last ${range} days`}>
              {overview.mostActive.length === 0 ? (
                <p className="text-sm text-brand-slate">No activity in this range.</p>
              ) : (
                <ul className="space-y-0.5">
                  {overview.mostActive.map((user) => (
                    <li key={user.id}>
                      <button
                        onClick={() => setDetailId(user.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-brand-navy">{user.name}</span>
                          <span className="block truncate text-xs text-brand-slate">{user.email}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums text-brand-slate">
                          <span className="block font-semibold text-brand-navy">{plural(user.questions, "question")}</span>
                          {[user.accuracyPct === null ? null : `${user.accuracyPct}%`, user.minutes > 0 ? formatMinutes(user.minutes) : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Hardest questions" subtitle={`Question Bank, lowest accuracy · last ${range} days`}>
              <QuestionList rows={overview.hardest} empty="Needs at least two answers on a question." />
            </Panel>
            <Panel title="Easiest questions" subtitle={`Question Bank, highest accuracy · last ${range} days`}>
              <QuestionList rows={overview.easiest} empty="Needs at least two answers on a question." />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Recent activity" subtitle="The latest things people did">
              <ActivityFeed events={overview.recent} now={now} onOpen={setDetailId} />
            </Panel>
            <Panel title="Where users are from" subtitle="Country from each account page">
              <BarList
                rows={overview.countries.map((row) => ({
                  key: row.country,
                  label: row.country,
                  value: row.users,
                  display: fmt(row.users),
                  hint: plural(row.users, "user"),
                }))}
                empty="No accounts yet."
              />
            </Panel>
          </div>
        </div>
      )}

      <UsersSection users={users} error={usersError} now={now} onOpen={setDetailId} />

      {detailId && <UserDrawer userId={detailId} now={now} onClose={closeDetail} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Building blocks                                                        */
/* ---------------------------------------------------------------------- */

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-brand-navy">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-brand-slate">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-[340px] animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

function LiveTag({ live }: { live: LiveSnapshot | null }) {
  const count = live?.liveNow ?? 0;
  const names = live?.users.map((user) => user.name).join(", ") ?? "";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-semibold text-brand-navy"
      title={names ? `Online now: ${names}` : "Nobody is online right now"}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {count > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-green opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${count > 0 ? "bg-brand-green" : "bg-slate-300"}`} />
      </span>
      {live ? `${fmt(count)} online now` : "Checking who is online…"}
    </span>
  );
}

function StatTile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-brand-slate">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-blue-light text-brand-blue" aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold text-brand-navy">{value}</div>
      <div className="mt-1 text-xs text-brand-slate">{sub}</div>
    </div>
  );
}

function KpiRow({ tiles, liveNow, range }: { tiles: AdminOverview["tiles"]; liveNow: number; range: RangeDays }) {
  // Active users include guest accounts, so compare against every account.
  const accounts = tiles.registered + tiles.guests;
  const activeShare = pct(Math.min(tiles.activeUsers, accounts), accounts);
  const items: { icon: ReactNode; label: string; value: string; sub: string }[] = [
    {
      icon: <Users size={15} />,
      label: "Registered users",
      value: fmt(tiles.registered),
      sub: [plural(tiles.admins, "admin"), tiles.guests > 0 ? plural(tiles.guests, "guest") : null].filter(Boolean).join(" · "),
    },
    { icon: <Radio size={15} />, label: "Online now", value: fmt(liveNow), sub: "Seen in the last 3 minutes" },
    {
      icon: <UserCheck size={15} />,
      label: "Active users",
      value: fmt(tiles.activeUsers),
      sub: activeShare === null ? `Last ${range} days` : `${activeShare}% of all accounts · last ${range} days`,
    },
    {
      icon: <ListChecks size={15} />,
      label: "Questions answered",
      value: fmt(tiles.questionsAnswered),
      sub: `Question Bank and mocks · last ${range} days`,
    },
    {
      icon: <Target size={15} />,
      label: "Accuracy",
      value: tiles.accuracyPct === null ? "—" : `${tiles.accuracyPct}%`,
      sub: `Of answered questions · last ${range} days`,
    },
    {
      icon: <Clock size={15} />,
      label: "Time on BlueMind",
      value: formatMinutes(tiles.minutesOnSite),
      sub: tiles.trackingSince ? `Tracked since ${shortDate(tiles.trackingSince)}` : "Tracking starts with this update",
    },
    { icon: <ClipboardCheck size={15} />, label: "Mock modules finished", value: fmt(tiles.mockModules), sub: `Last ${range} days` },
    { icon: <UserPlus size={15} />, label: "New sign-ups", value: fmt(tiles.newSignups), sub: `Last ${range} days` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <StatTile key={item.label} {...item} />
      ))}
    </div>
  );
}

function ChartTip({
  active,
  label,
  value,
  format,
  extra,
}: {
  active?: boolean;
  label?: unknown;
  value?: unknown;
  format: (value: number) => string;
  extra?: string;
}) {
  if (!active || label === undefined || label === null) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-card"
      style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink)" }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--viz-1)" }} />
        <span className="text-sm font-bold">{format(Number(value ?? 0))}</span>
      </div>
      <div className="mt-0.5" style={{ color: "var(--muted)" }}>
        {shortDate(String(label))}
        {extra ? ` · ${extra}` : ""}
      </div>
    </div>
  );
}

const TREND_METRICS: { key: TrendMetric; label: string; format: (value: number) => string }[] = [
  { key: "activeUsers", label: "Active users", format: (value) => plural(value, "user") },
  { key: "questions", label: "Questions answered", format: (value) => plural(value, "question") },
  { key: "signups", label: "Sign-ups", format: (value) => plural(value, "sign-up") },
  { key: "minutes", label: "Time on BlueMind", format: (value) => formatMinutes(value) },
];

function TrendCard({ trend, range }: { trend: TrendPoint[]; range: RangeDays }) {
  const [metric, setMetric] = useState<TrendMetric>("activeUsers");
  const [showTable, setShowTable] = useState(false);
  const meta = TREND_METRICS.find((m) => m.key === metric) ?? TREND_METRICS[0];
  const values = trend.map((point) => point[metric]);
  const today = values[values.length - 1] ?? 0;
  const peak = values.reduce((best, value, i) => (value > values[best] ? i : best), 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const summary =
    metric === "activeUsers"
      ? `Today ${meta.format(today)} · busiest day ${shortDate(trend[peak]?.date ?? "")} with ${meta.format(values[peak] ?? 0)}`
      : `${meta.format(total)} in ${range} days · today ${meta.format(today)}`;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-brand-navy">{meta.label} per day</h3>
          <p className="mt-0.5 text-xs text-brand-slate">{summary}</p>
        </div>
        <div role="group" aria-label="Metric" className="flex flex-wrap gap-1.5">
          {TREND_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                metric === m.key ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:text-brand-navy"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 h-[260px]" role="img" aria-label={`${meta.label} per day over the last ${range} days. ${summary}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              minTickGap={32}
            />
            <YAxis
              allowDecimals={false}
              width={44}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => value.toLocaleString("en-US")}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
              content={(props) => <ChartTip active={props.active} label={props.label} value={props.payload?.[0]?.value} format={meta.format} />}
            />
            <Area
              type="linear"
              dataKey={metric}
              stroke="var(--viz-1)"
              strokeWidth={2}
              fill="var(--viz-1)"
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 5, fill: "var(--viz-1)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <button
        onClick={() => setShowTable((value) => !value)}
        aria-expanded={showTable}
        className="mt-3 text-xs font-semibold text-brand-blue hover:underline"
      >
        {showTable ? "Hide data table" : "Show data table"}
      </button>
      {showTable && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-brand-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-brand-border text-left text-brand-slate">
                <th scope="col" className="px-3 py-2 font-semibold">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{meta.label}</th>
              </tr>
            </thead>
            <tbody>
              {[...trend].reverse().map((point) => (
                <tr key={point.date} className="border-b border-brand-border last:border-0">
                  <td className="px-3 py-1.5 text-brand-navy">{shortDate(point.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-brand-navy">{meta.format(point[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Horizontal bars: one series, one hue, square at the baseline, 4px rounded end. */
function BarList({
  rows,
  empty,
}: {
  rows: { key: string; label: string; value: number; display: string; hint?: string }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-brand-slate">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li
          key={row.key}
          title={row.hint}
          className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-1.5 hover:bg-slate-50"
        >
          <span className="truncate text-sm text-brand-navy">{row.label}</span>
          <div className="h-3">
            <div
              className="h-3 rounded-r-[4px]"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: "var(--viz-1)" }}
              aria-hidden="true"
            />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-brand-slate">{row.display}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionList({ rows, empty }: { rows: QuestionStat[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-brand-slate">{empty}</p>;
  return (
    <ul>
      {rows.map((question) => (
        <li key={question.id} className="flex items-center justify-between gap-3 border-b border-brand-border py-2.5 last:border-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-brand-navy">{question.skill}</p>
            <p className="truncate text-xs text-brand-slate">
              {question.difficulty} · {question.section === "Math" ? "Math" : "Reading and Writing"}
              {question.externalId ? ` · ID ${question.externalId}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold tabular-nums text-brand-navy">{question.accuracyPct}%</p>
            <p className="text-[11px] tabular-nums text-brand-slate">
              {plural(question.attempts, "answer")} · {plural(question.users, "person", "people")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const KIND_ICON: Record<ActivityKind, ReactNode> = {
  signup: <UserPlus size={14} />,
  practice: <ListChecks size={14} />,
  mock: <ClipboardCheck size={14} />,
  set: <ClipboardCheck size={14} />,
  vocab: <BookOpen size={14} />,
  report: <Flag size={14} />,
  shared: <Share2 size={14} />,
};

function ActivityFeed({ events, now, onOpen }: { events: ActivityEvent[]; now: Date; onOpen: (userId: string) => void }) {
  if (events.length === 0) return <p className="text-sm text-brand-slate">Nothing has happened yet.</p>;
  return (
    <ul className="max-h-[420px] overflow-y-auto pr-1">
      {events.map((event, i) => (
        <li key={`${event.at}-${event.kind}-${i}`} className="flex items-start gap-3 border-b border-brand-border py-2.5 last:border-0">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-brand-slate" aria-hidden="true">
            {KIND_ICON[event.kind]}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-brand-navy">
              {event.userId ? (
                <button onClick={() => onOpen(event.userId as string)} className="font-semibold hover:text-brand-blue hover:underline">
                  {event.userName}
                </button>
              ) : (
                <span className="font-semibold">{event.userName}</span>
              )}{" "}
              <span className="text-brand-slate">{event.text}</span>
            </p>
            <p className="text-xs text-brand-slate" title={formatDateTime(event.at)}>
              {timeAgo(event.at, now)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: UserStatus }) {
  const online = status === "online";
  const dot = online ? "bg-brand-green" : status === "active" ? "bg-slate-500" : status === "idle" ? "bg-slate-400" : "bg-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        online ? "bg-brand-green-light text-brand-green" : "bg-slate-100 text-brand-slate"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Users table                                                            */
/* ---------------------------------------------------------------------- */

const COLUMNS: { key: UserSortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "User" },
  { key: "lastActive", label: "Last active" },
  { key: "createdAt", label: "Joined" },
  { key: "questions", label: "Questions", align: "right" },
  { key: "accuracy", label: "Accuracy", align: "right" },
  { key: "mockModules", label: "Mock modules", align: "right" },
  { key: "minutes7d", label: "Time (7 days)", align: "right" },
  { key: "activeDays30", label: "Active days (30)", align: "right" },
  { key: "country", label: "Country" },
];

function UsersSection({
  users,
  error,
  now,
  onOpen,
}: {
  users: MonitorUserRow[] | null;
  error: string | null;
  now: Date;
  onOpen: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<UserFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: UserSortKey; dir: SortDir }>({ key: "lastActive", dir: "desc" });

  const counts = useMemo(() => {
    const result = {} as Record<UserFilter, number>;
    for (const option of USER_FILTERS) {
      result[option.key] = users ? users.filter((user) => matchesUserFilter(user, option.key, now)).length : 0;
    }
    return result;
  }, [users, now]);

  const rows = useMemo(
    () =>
      users
        ? sortUsers(
            users.filter((user) => matchesUserFilter(user, filter, now) && matchesSearch(user, search)),
            sort.key,
            sort.dir
          )
        : [],
    [users, filter, search, sort, now]
  );

  function toggleSort(key: UserSortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "country" ? "asc" : "desc" }
    );
  }

  function exportCsv() {
    const header = [
      "Name",
      "Email",
      "Country",
      "Status",
      "Joined",
      "Last active",
      "Questions answered",
      "Accuracy %",
      "Mock modules",
      "Latest score",
      "Minutes (7 days)",
      "Minutes (total)",
      "Active days (30)",
      "Admin",
    ];
    const body = rows.map((user) => [
      user.name,
      user.email,
      user.country ?? "",
      STATUS_LABEL[userStatus(user.lastSeenAt, user.lastActiveAt, now)],
      user.createdAt.slice(0, 10),
      latestIso(user.lastSeenAt, user.lastActiveAt) ?? "",
      user.questions,
      user.accuracyPct ?? "",
      user.mockModules,
      user.latestScore ?? "",
      user.minutes7d,
      user.minutesTotal,
      user.activeDays30,
      user.isAdmin ? "yes" : "no",
    ]);
    // Byte-order mark so Excel reads the file as UTF-8 (names with accents).
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([bom + toCsv([header, ...body])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bluemind-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto font-bold text-brand-navy">Users</h3>
        <label className="relative flex min-w-[240px] flex-1 items-center sm:flex-none">
          <Search size={15} className="pointer-events-none absolute left-3 text-brand-slate" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, country or ID"
            aria-label="Search users"
            className="w-full rounded-lg border border-brand-border bg-white py-2 pl-9 pr-3 text-sm text-brand-navy outline-none focus:border-brand-blue"
          />
        </label>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="btn-secondary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
          title="Download the users shown below as a spreadsheet"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter users" className="flex flex-wrap gap-1.5">
          {USER_FILTERS.map((option) => (
            <button
              key={option.key}
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === option.key
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-brand-border text-brand-slate hover:text-brand-navy"
              }`}
            >
              {option.label} <span className="tabular-nums opacity-80">{counts[option.key]}</span>
            </button>
          ))}
        </div>
        {users && (
          <span className="text-xs font-semibold text-brand-slate" aria-live="polite">
            Showing {fmt(rows.length)} of {plural(users.length, "user")}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-brand-red">
          {error}
        </p>
      )}

      {!users ? (
        !error && <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-slate">No users match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-brand-border text-xs text-brand-slate">
                {COLUMNS.slice(0, 1).map((column) => (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} />
                ))}
                <th scope="col" className="py-2 pr-3 text-left font-semibold">
                  Status
                </th>
                {COLUMNS.slice(1).map((column) => (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const status = userStatus(user.lastSeenAt, user.lastActiveAt, now);
                const lastActive = latestIso(user.lastSeenAt, user.lastActiveAt);
                return (
                  <tr key={user.id} className="border-b border-brand-border last:border-0 hover:bg-slate-50">
                    <td className="max-w-[260px] py-2.5 pr-3">
                      <button onClick={() => onOpen(user.id)} className="block max-w-full text-left">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-brand-navy hover:text-brand-blue">{user.name}</span>
                          {user.isAdmin && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-brand-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-brand-blue">
                              <ShieldCheck size={11} aria-hidden="true" /> Admin
                            </span>
                          )}
                          {isNewUser(user.createdAt, now) && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-slate">New</span>
                          )}
                          {user.isGuest && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-slate">Guest</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-brand-slate">{user.email}</span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusPill status={status} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-brand-slate" title={lastActive ? formatDateTime(lastActive) : undefined}>
                      {timeAgo(lastActive, now)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-brand-slate">{formatDate(user.createdAt)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-brand-navy">{fmt(user.questions)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-brand-navy">{user.accuracyPct === null ? "—" : `${user.accuracyPct}%`}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-brand-navy">{fmt(user.mockModules)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-brand-navy">{formatMinutes(user.minutes7d)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-brand-navy">{user.activeDays30}</td>
                    <td className="py-2.5 pr-3 text-brand-slate">{user.country ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: { key: UserSortKey; label: string; align?: "right" };
  sort: { key: UserSortKey; dir: SortDir };
  onSort: (key: UserSortKey) => void;
}) {
  const active = sort.key === column.key;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 pr-3 font-semibold ${column.align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-brand-navy ${active ? "text-brand-navy" : ""}`}
      >
        {column.label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp size={12} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown size={12} className="opacity-50" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

/* ---------------------------------------------------------------------- */
/* User drawer                                                            */
/* ---------------------------------------------------------------------- */

function UserDrawer({ userId, now, onClose }: { userId: string; now: Date; onClose: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    getJson<UserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`, "Could not load this user.")
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(messageOf(err, "Could not load this user."));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = detail?.user.name ?? "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-user-title"
      className="fixed inset-0 z-50 flex justify-end bg-brand-navy/30"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-[-8px_0_30px_rgba(15,23,42,0.18)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-lg font-bold text-white"
              aria-hidden="true"
            >
              {(name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 id="admin-user-title" className="truncate text-lg font-bold text-brand-navy">
                {detail ? name : error ? "User" : "Loading user…"}
              </h2>
              {detail && <p className="truncate text-sm text-brand-slate">{detail.user.email}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-brand-slate hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-brand-red">
            {error}
          </p>
        )}
        {!detail && !error && (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {detail && <UserDetailBody detail={detail} now={now} />}
      </div>
    </div>
  );
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand-border px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">{label}</div>
      <div className="mt-1 text-lg font-bold text-brand-navy">{value}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-bold text-brand-navy">{title}</h3>
      {children}
    </section>
  );
}

function UserDetailBody({ detail, now }: { detail: UserDetail; now: Date }) {
  const [showDailyTable, setShowDailyTable] = useState(false);
  const { user, time, totals } = detail;
  const status = userStatus(user.lastSeenAt, user.lastActiveAt, now);
  const lastActive = latestIso(user.lastSeenAt, user.lastActiveAt);
  const dailyTotal = detail.daily.reduce((sum, day) => sum + day.questions, 0);
  const activeDays = detail.daily.filter((day) => day.questions > 0 || day.minutes > 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-brand-slate">
        <StatusPill status={status} />
        {user.isAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-light px-2 py-0.5 font-semibold text-brand-blue">
            <ShieldCheck size={12} aria-hidden="true" /> Admin
          </span>
        )}
        {user.isGuest && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Guest</span>}
        <span>{user.country ?? "Country not set"}</span>
        <span aria-hidden="true">·</span>
        <span>Joined {formatDate(user.createdAt)}</span>
        <span aria-hidden="true">·</span>
        <span title={lastActive ? formatDateTime(lastActive) : undefined}>Last active {timeAgo(lastActive, now)}</span>
      </div>

      <DrawerSection title="Time on BlueMind">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniTile label="Today" value={formatMinutes(time.todayMinutes)} />
          <MiniTile label="7 days" value={formatMinutes(time.weekMinutes)} />
          <MiniTile label="30 days" value={formatMinutes(time.monthMinutes)} />
          <MiniTile label="All time" value={formatMinutes(time.totalMinutes)} />
        </div>
      </DrawerSection>

      <DrawerSection title="Performance">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniTile label="Questions" value={fmt(totals.questions)} />
          <MiniTile label="Accuracy" value={totals.accuracyPct === null ? "—" : `${totals.accuracyPct}%`} />
          <MiniTile label="Mock modules" value={fmt(totals.mockModules)} />
          <MiniTile label="Latest score" value={totals.latestScore === null ? "—" : fmt(totals.latestScore)} />
        </div>
        <div className="mt-4 space-y-3">
          {detail.sections.map((section) => (
            <div key={section.section}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-brand-navy">{section.section}</span>
                <span className="tabular-nums text-brand-slate">
                  {section.accuracyPct === null
                    ? "No answers yet"
                    : `${section.accuracyPct}% · ${fmt(section.correct)} of ${fmt(section.answered)} (bank ${fmt(section.bankAnswered)}, mocks ${fmt(section.mockAnswered)})`}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full" style={{ background: "var(--viz-1-track)" }}>
                <div className="h-2 rounded-full" style={{ width: `${section.accuracyPct ?? 0}%`, background: "var(--viz-1)" }} />
              </div>
            </div>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection title="Last 30 days">
        <p className="-mt-2 mb-2 text-xs text-brand-slate">
          {plural(dailyTotal, "question")} answered · active on {plural(activeDays, "day")}
        </p>
        <div className="h-[170px]" role="img" aria-label={`Questions answered per day over the last 30 days: ${dailyTotal} in total.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={detail.daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
                minTickGap={28}
              />
              <YAxis allowDecimals={false} width={32} tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "var(--line)", opacity: 0.4 }}
                content={(props) => {
                  const point = props.payload?.[0]?.payload as UserDetail["daily"][number] | undefined;
                  return (
                    <ChartTip
                      active={props.active}
                      label={props.label}
                      value={point?.questions}
                      format={(value) => plural(value, "question")}
                      extra={point ? `${formatMinutes(point.minutes)} on BlueMind` : undefined}
                    />
                  );
                }}
              />
              <Bar dataKey="questions" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <button
          onClick={() => setShowDailyTable((value) => !value)}
          aria-expanded={showDailyTable}
          className="mt-2 text-xs font-semibold text-brand-blue hover:underline"
        >
          {showDailyTable ? "Hide data table" : "Show data table"}
        </button>
        {showDailyTable && (
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-brand-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-brand-border text-left text-brand-slate">
                  <th scope="col" className="px-3 py-2 font-semibold">Day</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Questions</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.daily].reverse().map((day) => (
                  <tr key={day.date} className="border-b border-brand-border last:border-0">
                    <td className="px-3 py-1.5 text-brand-navy">{shortDate(day.date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-brand-navy">{fmt(day.questions)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-brand-navy">{formatMinutes(day.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DrawerSection>

      {detail.weakSkills.length > 0 && (
        <DrawerSection title="Weakest skills (Question Bank)">
          <ul>
            {detail.weakSkills.map((skill) => (
              <li key={`${skill.section}-${skill.skill}`} className="flex items-center justify-between gap-3 border-b border-brand-border py-2 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-brand-navy">{skill.skill}</span>
                  <span className="block text-xs text-brand-slate">{skill.section}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-brand-slate">
                  <span className="block text-sm font-bold text-brand-navy">{skill.accuracyPct}%</span>
                  {plural(skill.attempts, "answer")}
                </span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Recent sessions">
        {detail.sessions.length === 0 ? (
          <p className="text-sm text-brand-slate">No finished mock modules or submitted sets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="border-b border-brand-border text-left text-brand-slate">
                  <th scope="col" className="py-2 pr-3 font-semibold">Session</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Section</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Result</th>
                  <th scope="col" className="py-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((session, i) => (
                  <tr key={`${session.completedAt}-${i}`} className="border-b border-brand-border last:border-0">
                    <td className="max-w-[220px] truncate py-2 pr-3 text-brand-navy" title={session.title}>
                      {session.source === "mock" ? "Mock · " : "Set · "}
                      {session.title}
                      {session.module ? ` · M${session.module}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-brand-slate">{session.section === "Math" ? "Math" : "R&W"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-brand-navy">
                      {session.correct}/{session.total} · {pct(session.correct, session.total) ?? 0}%
                    </td>
                    <td className="whitespace-nowrap py-2 text-brand-slate" title={formatDateTime(session.completedAt)}>
                      {timeAgo(session.completedAt, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DrawerSection>

      {detail.practiceSets.length > 0 && (
        <DrawerSection title="Question Bank practice">
          <ul>
            {detail.practiceSets.map((set, i) => (
              <li key={`${set.at}-${i}`} className="flex items-center justify-between gap-3 border-b border-brand-border py-2 last:border-0">
                <span className="min-w-0 truncate text-sm text-brand-navy" title={set.title}>
                  {set.title}
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-brand-slate">
                  <span className="block font-semibold text-brand-navy">
                    {set.correct}/{set.answered} correct
                  </span>
                  {timeAgo(set.at, now)}
                </span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Where their time goes">
        <BarList
          rows={detail.features.map((feature) => ({
            key: feature.key,
            label: feature.label,
            value: feature.minutes,
            display: formatMinutes(feature.minutes),
          }))}
          empty="No time recorded yet. It starts with this update."
        />
      </DrawerSection>

      <DrawerSection title="Other activity">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniTile label="Words saved" value={fmt(detail.counts.vocab)} />
          <MiniTile label="Notes" value={fmt(detail.counts.notes)} />
          <MiniTile label="Journal" value={fmt(detail.counts.journal)} />
          <MiniTile label="Shared opened" value={fmt(detail.counts.shared)} />
          <MiniTile label="Reports" value={fmt(detail.counts.reports)} />
        </div>
      </DrawerSection>
    </div>
  );
}
