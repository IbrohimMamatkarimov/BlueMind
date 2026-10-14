"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FullExamCardAction } from "@/components/FullExamCardAction";
import { fullExamAvailable, fullExamKey, TestSection } from "@/lib/test-session";
import { moduleProgressKey, savedAgo, type ProgressSummary } from "@/lib/progress-keys";
import { loadProgressList } from "@/lib/progress-sync";
import { SAT_STRUCTURE, SAT_TEST_MONTHS } from "@/lib/sat-constants";
import { CommunityLink, PageHeader } from "@/components/ui";


interface ModuleAvailability {
  module: 1 | 2;
  questionCount: number;
}
interface MockCard {
  id: string;
  title: string;
  subtitle: string | null;
  month: string;
  year: number;
  math: ModuleAvailability[];
  readingWriting: ModuleAvailability[];
}
interface Group {
  key: string;
  label: string;
  mocks: MockCard[];
}

type SectionTab = TestSection | "Full Exam";
type StatusView = "all" | "in_progress" | "solved";
type SavedScore = { correctCount: number; total: number };

const STATUS_VIEWS: { value: StatusView; label: string }[] = [
  { value: "all", label: "All tests" },
  { value: "in_progress", label: "In progress" },
  { value: "solved", label: "Solved" },
];

const SECTION_META: Record<SectionTab, { label: string; questions: number; minutes: number }> = {
  Math: { label: "Math", questions: SAT_STRUCTURE.math.totalQuestions, minutes: SAT_STRUCTURE.math.totalMinutes },
  "Reading and Writing": {
    label: "Reading & Writing",
    questions: SAT_STRUCTURE.readingWriting.totalQuestions,
    minutes: SAT_STRUCTURE.readingWriting.totalMinutes,
  },
  "Full Exam": { label: "Full Exam", questions: SAT_STRUCTURE.totalQuestions, minutes: SAT_STRUCTURE.totalMinutes + SAT_STRUCTURE.breakMinutes },
};

const BADGE_LETTERS = "ABCDEFGHIJ";

// Signed-in "My Mocks" page. Uses the same public mock library + practice
// flow as the landing page (/practice/{mockId}/{section}/{module}).
export function MockCatalog({ guest = false }: { guest?: boolean }) {
  
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState("All");
  const [activeTab, setActiveTab] = useState<SectionTab>("Math");
  const [displayedTab, setDisplayedTab] = useState<SectionTab>("Math");
  const [tabFading, setTabFading] = useState(false);

  function handleTabChange(tab: SectionTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabFading(true);
    setTimeout(() => {
      setDisplayedTab(tab);
      setTabFading(false);
    }, 180);
  }

  const [statusView, setStatusView] = useState<StatusView>("all");
  const [savedScores, setSavedScores] = useState<Record<string, SavedScore>>({});
  // Unfinished (and finished full-exam) sessions by progress key — the
  // server's copy for signed-in learners, merged with this browser's.
  const [progress, setProgress] = useState<Record<string, ProgressSummary>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [addMockYear, setAddMockYear] = useState<string | null>(null); // group key the modal is adding into

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => setIsAdmin(!guest && !!data.user?.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
  }, [guest]);

  useEffect(() => {
    // Wait for the admin check to resolve before loading mocks — otherwise
    // an admin's first load can race ahead and fetch the student-gated
    // endpoint before isAdmin flips true, showing "Manage Questions" as if
    // it were unreleased even though questions already exist.
    if (!authChecked) return;
    loadMocks();

    function loadScores() {
      fetch("/api/module-results")
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          const map: Record<string, SavedScore> = {};
          for (const r of data.results ?? []) {
            map[`${r.mockId}|${r.section}|${r.module}`] = { correctCount: r.correctCount, total: r.total };
          }
          setSavedScores(map);
        })
        .catch(() => {});
    }
    function loadProgress() {
      loadProgressList(!guest)
        .then((list) => setProgress(Object.fromEntries(list.map((item) => [item.key, item]))))
        .catch(() => {});
    }
    function refresh() {
      loadScores();
      loadProgress();
    }
    refresh();

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, isAdmin]);

  function loadMocks() {
    return fetch(isAdmin ? "/api/admin/mocks/library" : "/api/public/mocks")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setGroups(data.groups))
      .catch(() => setError("Couldn't load the mock library right now. Please refresh."));
  }

  const allMocks = useMemo(() => (groups ?? []).flatMap((g) => g.mocks.map((m) => ({ ...m, group: g.key }))), [groups]);

  const visibleMocks = useMemo(() => {
    if (activeGroup === "All") return allMocks;
    return allMocks.filter((m) => m.group === activeGroup);
  }, [allMocks, activeGroup]);

  // Assigns A/B/C... to same-titled mocks in the order they appear (e.g.
  // three separate "March 2026" forms become A, B, C) — a stable per-title
  // sequence badge, matching the reference design's form-letter chip.
  const badgeLetters = useMemo(() => {
    const counters = new Map<string, number>();
    const out: Record<string, string> = {};
    for (const m of allMocks) {
      const n = counters.get(m.title) ?? 0;
      out[m.id] = BADGE_LETTERS[n % BADGE_LETTERS.length];
      counters.set(m.title, n + 1);
    }
    return out;
  }, [allMocks]);

  // The mocks (and, per mock, the modules) a section tab shows under a
  // status view. "In progress" lists the most recently saved first.
  function entriesFor(tab: SectionTab, view: StatusView) {
    const entries = visibleMocks.flatMap((mock) => {
      if (tab === "Full Exam") {
        const saved = progress[fullExamKey(mock.id)];
        const status = !saved ? "new" : saved.step === 5 ? "complete" : "saved";
        if ((view === "in_progress" && status !== "saved") || (view === "solved" && status !== "complete")) return [];
        return [{ mock, modules: [] as ModuleAvailability[], lastSaved: saved?.savedAt ?? 0, count: 1 }];
      }
      const all = tab === "Math" ? mock.math : mock.readingWriting;
      if (view === "all") return [{ mock, modules: all, lastSaved: 0, count: all.length }];
      const modules = all.filter((m) => m.questionCount > 0 && (view === "in_progress"
        ? !!progress[moduleProgressKey(mock.id, tab, m.module)]
        : !!savedScores[`${mock.id}|${tab}|${m.module}`]));
      if (modules.length === 0) return [];
      const lastSaved = Math.max(0, ...modules.map((m) => progress[moduleProgressKey(mock.id, tab, m.module)]?.savedAt ?? 0));
      return [{ mock, modules, lastSaved, count: modules.length }];
    });
    if (view === "in_progress") entries.sort((a, b) => b.lastSaved - a.lastSaved);
    return entries;
  }
  function countFor(tab: SectionTab, view: StatusView) {
    return entriesFor(tab, view).reduce((sum, entry) => sum + entry.count, 0);
  }
  const entries = entriesFor(displayedTab, statusView);
  // Shown in an empty status view: the other sections that do have tests in it.
  const elsewhere = statusView === "all" ? [] : (Object.keys(SECTION_META) as SectionTab[])
    .filter((tab) => tab !== displayedTab)
    .map((tab) => ({ tab, count: countFor(tab, statusView) }))
    .filter((item) => item.count > 0);

  const sectionMeta = SECTION_META[displayedTab];

  if (error) return <div className="card p-6 text-brand-red text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Build your confidence" title="SAT Mock Tests" description="Choose a paper, find your pace, and make every practice count." />

      {/* Section switcher — centered on its own row, dark-mode toggle pinned
          to the right edge of that same row. Matches PublicLanding.tsx. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap justify-center items-center gap-1 bg-slate-100 rounded-full p-1">
          {(Object.keys(SECTION_META) as SectionTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              aria-pressed={activeTab === tab}
              className={`px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                activeTab === tab ? "bg-white text-brand-navy shadow-sm" : "text-brand-slate hover:text-brand-navy"
              }`}
            >
              {SECTION_META[tab].label}
            </button>
          ))}
        </div>

        {/* Status views. These are the learner's own tests, so admins get
            the student actions here too. Counts follow the section tab. */}
        <div className="flex items-center gap-1 rounded-full border border-brand-border bg-white p-1" role="group" aria-label="Filter by status">
          {STATUS_VIEWS.map(({ value, label }) => {
            const count = value === "all" ? 0 : countFor(activeTab, value);
            return (
              <button
                key={value}
                onClick={() => setStatusView(value)}
                aria-pressed={statusView === value}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  statusView === value ? "bg-brand-blue text-white shadow-sm" : "text-brand-slate hover:text-brand-navy"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`min-w-[1.25rem] rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${
                    statusView === value ? "bg-white/20 text-white" : value === "in_progress" ? "bg-emerald-100 text-emerald-700" : "bg-brand-blue-light text-brand-blue"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Year/group filter pills */}
      {groups && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveGroup("All")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:scale-105 ${
              activeGroup === "All"
                ? "bg-brand-blue text-white shadow-sm"
                : "bg-white border border-brand-border text-brand-navy hover:bg-slate-50 hover:border-brand-blue/40"
            }`}
          >
            All years
          </button>
          {groups.map((g) => (
            <div key={g.key} className="shrink-0 flex items-center gap-1">
              <button
                onClick={() => setActiveGroup(g.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:scale-105 ${
                  activeGroup === g.key
                    ? "bg-brand-blue text-white shadow-sm"
                    : "bg-white border border-brand-border text-brand-navy hover:bg-slate-50 hover:border-brand-blue/40"
                }`}
              >
                {g.label}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setAddMockYear(g.key)}
                  title={`Add a mock to ${g.label}`}
                  className="w-7 h-7 rounded-full border border-dashed border-brand-blue/50 text-brand-blue flex items-center justify-center hover:bg-brand-blue-light"
                >
                  +
                </button>
              )}
            </div>
          ))}
          {isAdmin && (
            <button
              onClick={() => setAddMockYear("__new__")}
              className="shrink-0 flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-semibold border border-dashed border-brand-blue/50 text-brand-blue hover:bg-brand-blue-light"
            >
              + Add Mock
            </button>
          )}
        </div>
      )}

      {!groups ? (
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      ) : (
        <div
          className={`grid sm:grid-cols-2 xl:grid-cols-3 items-start gap-4 transition-all duration-200 ${
            tabFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
          }`}
        >
          {entries.map(({ mock, modules }) => {
            return (
              <div key={mock.id} className="mock-card card p-5 flex flex-col relative overflow-hidden">
                <div className="flex items-start gap-2.5 mb-3.5 relative z-10">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-brand-navy leading-tight tracking-tight">{mock.title}</h3>
                    {mock.subtitle && <p className="text-xs text-brand-slate mt-0.5">{mock.subtitle}</p>}
                  </div>
                  <span className="shrink-0 w-7 h-7 rounded-lg border-2 border-brand-blue text-brand-blue text-sm font-bold flex items-center justify-center">
                    {badgeLetters[mock.id]}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-brand-navy border border-brand-border rounded-lg px-3 py-2 mb-3 relative z-10">
                  <span className="flex items-center gap-1.5">
                    <ClockIcon />
                    {sectionMeta.minutes} min
                  </span>
                  <span className="w-px h-3.5 bg-brand-border" />
                  <span className="flex items-center gap-1.5">
                    <DocIcon />
                    {sectionMeta.questions} questions
                  </span>
                </div>
                <div className="mt-4 space-y-2 relative z-10">
                  {displayedTab === "Full Exam" ? <FullExamCardAction mockId={mock.id} available={fullExamAvailable(mock)} progress={progress[fullExamKey(mock.id)]} /> : modules.map((m) => {
                    const saved = savedScores[`${mock.id}|${displayedTab}|${m.module}`];
                    return (
                      <ModuleRow
                        key={m.module}
                        mockId={mock.id}
                        section={displayedTab}
                        module={m.module}
                        available={m.questionCount > 0}
                        questionCount={m.questionCount}
                        saved={saved}
                        // A solved module being retaken still reads as solved (score + Review) in that view.
                        progress={statusView === "solved" ? undefined : progress[moduleProgressKey(mock.id, displayedTab, m.module)]}
                        isAdmin={isAdmin && statusView === "all"}
                        onCountChange={loadMocks}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {entries.length === 0 && statusView === "all" && (
            <p className="text-sm text-brand-slate col-span-full text-center py-12">
              No mock tests available yet{activeGroup !== "All" ? ` for ${activeGroup}` : ""} — check back soon.
            </p>
          )}
          {entries.length === 0 && statusView !== "all" && (
            <div className="col-span-full card px-6 py-12 text-center">
              <p className="font-semibold text-brand-navy">
                {statusView === "in_progress" ? `No ${sectionMeta.label} tests in progress` : `No solved ${sectionMeta.label} tests yet`}
                {activeGroup !== "All" ? ` for ${activeGroup}` : ""}
              </p>
              <p className="mt-1 text-sm text-brand-slate">
                {statusView === "in_progress"
                  ? "Start a test and leave before submitting. It waits here, on any device you sign in on."
                  : guest
                    ? "Sign in to keep your scores. Finished tests then move here."
                    : "Submit a test and it moves here with your score, ready to review or retake."}
              </p>
              {elsewhere.length > 0 ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {elsewhere.map(({ tab, count }) => (
                    <button key={tab} onClick={() => handleTabChange(tab)} className="rounded-full border border-brand-border px-4 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-light">
                      {count} in {SECTION_META[tab].label}
                    </button>
                  ))}
                </div>
              ) : (
                <button onClick={() => setStatusView("all")} className="mt-4 rounded-full bg-brand-blue px-5 py-2 text-xs font-semibold text-white hover:bg-brand-blue-dark">
                  Browse all tests
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <CommunityLink />

      {isAdmin && addMockYear !== null && (
        <AddMockModal
          defaultGroup={addMockYear === "__new__" ? undefined : addMockYear}
          onClose={() => setAddMockYear(null)}
          onCreated={() => {
            setAddMockYear(null);
            loadMocks();
          }}
        />
      )}
    </div>
  );
}

function ModuleRow({
  mockId,
  section,
  module,
  available,
  questionCount,
  saved,
  progress,
  isAdmin,
}: {
  mockId: string;
  section: TestSection;
  module: 1 | 2;
  available: boolean;
  questionCount: number;
  saved?: SavedScore;
  progress?: ProgressSummary;
  isAdmin: boolean;
  onCountChange?: () => void;
}) {
  const inProgress = !!progress;

  return (
    <div className="border border-brand-border rounded-lg px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-bold text-brand-navy block tracking-tight">Module {module}</span>
          {!isAdmin && available && saved && !inProgress && (
            <span className="text-xs text-brand-slate tabular-nums">
              Score: {saved.correctCount}/{saved.total}
            </span>
          )}
          {!isAdmin && available && inProgress && (
            <span className="block text-xs text-brand-slate">
              <span className="font-semibold text-brand-green">In progress</span>
              {typeof progress?.answered === "number" && <span className="tabular-nums"> · {progress.answered}/{questionCount} answered</span>}
              {!!progress?.savedAt && <span> · {savedAgo(progress.savedAt)}</span>}
            </span>
          )}
        </div>

        {!isAdmin && !available && <span className="text-xs text-brand-slate shrink-0">Coming soon</span>}

        {!isAdmin && available && inProgress && (
          <Link
            href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
            className="shrink-0 whitespace-nowrap rounded-full bg-brand-green text-white text-xs font-semibold tracking-wide px-4 py-1.5 shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Continue
          </Link>
        )}

        {!isAdmin && available && !inProgress && !saved && (
          <Link
            href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
            className="shrink-0 whitespace-nowrap rounded-full bg-brand-blue text-white text-xs font-semibold tracking-wide px-4 py-1.5 shadow-sm hover:bg-brand-blue-dark transition-colors"
          >
            Start Practice
          </Link>
        )}

        {!isAdmin && available && !inProgress && saved && (
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}?review=1`}
              className="whitespace-nowrap text-xs font-semibold tracking-wide text-brand-blue rounded-full border-2 border-brand-blue px-4 py-1.5 hover:bg-brand-blue-light transition-colors"
            >
              Review
            </Link>
            <Link
              href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
              title="Retake this module — replaces your saved score"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-brand-border text-brand-slate hover:text-brand-blue hover:border-brand-blue transition-colors"
            >
              <RetakeIcon />
            </Link>
          </div>
        )}

        {isAdmin && (
          <Link
            href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}${available ? "" : "?admin=1"}`}
            className={
              available
                ? "shrink-0 whitespace-nowrap rounded-full bg-brand-blue text-white text-xs font-semibold tracking-wide px-4 py-1.5 shadow-sm hover:bg-brand-blue-dark transition-colors"
                : "shrink-0 whitespace-nowrap rounded-full text-xs font-semibold tracking-wide px-4 py-1.5 border border-brand-blue text-brand-blue hover:bg-brand-blue-light transition-colors"
            }
          >
            {available ? "Start Practice" : "Manage Questions"}
          </Link>
        )}
      </div>

      {/* MockQuestionsInline removed — "Manage Questions" now opens the real
          exam page in admin mode instead of this separate gray form panel. */}
    </div>
  );
}

const CATALOG_YEARS = [2026, 2025, 2024, 2023]; // must match GROUP_ORDER in lib/mock-library.ts exactly —
// a mock created outside these four years silently never appears anywhere
// in the public library, so the picker below can't offer any others.

function AddMockModal({
  defaultGroup,
  onClose,
  onCreated,
}: {
  defaultGroup?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(
    defaultGroup && CATALOG_YEARS.includes(Number(defaultGroup)) ? Number(defaultGroup) : CATALOG_YEARS[0]
  );
  const [month, setMonth] = useState<string>(SAT_TEST_MONTHS[0]);
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Mock name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: version.trim() || null,
          groupLabel: String(year),
          month,
          year,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create mock");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30" onClick={onClose}>
      <form
        onSubmit={handleCreate}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-brand-navy">Add Mock</h2>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <label className="block text-sm text-brand-navy">
          Mock Name
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. August 2024"
            className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-brand-navy">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
            >
              {CATALOG_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-brand-navy">
            Month
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
            >
              {SAT_TEST_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm text-brand-navy">
          Version (optional)
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="International V2"
            className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm text-brand-slate px-3 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
            {saving ? "Creating\u2026" : "Create Mock"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 4L2.5 11.5c-1 .4-1 1.5.1 1.8l4.4 1.4 1.7 5.4c.3.9 1.4 1.1 2 .4l2.5-2.8 4.6 3.4c.8.6 2 .2 2.2-.8L22 5c.2-1-.7-1.7-1.6-1.3z"
        fill="white"
      />
      <path d="M8.5 14.5L18 7l-8 8.7" stroke="#229ED9" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.5 14.2A8.5 8.5 0 119.8 3.5a7 7 0 0010.7 10.7z" fill="currentColor" />
    </svg>
  );
}

function RetakeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6V3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Same decorative hero illustrations as the Question Bank page's two hub
// cards — kept as local copies here rather than a shared import, since
// they're small, self-contained SVGs with no logic and pulling in a whole
// shared-component file for two icons would be more churn than it's worth.
function BookHeroIllustration() {
  return (
    <svg width="110" height="100" viewBox="0 0 120 110" fill="none" aria-hidden="true" className="opacity-90">
      <path d="M12 20c18-8 34-8 48 4 14-12 30-12 48-4v70c-18-8-34-8-48 4-14-12-30-12-48-4V20z" fill="white" fillOpacity="0.92" />
      <path d="M60 24v70" stroke="#e879c9" strokeWidth="1.5" />
      <path d="M22 34c10-4 20-4 30 2M22 46c10-4 20-4 30 2M22 58c10-4 20-4 30 2" stroke="#f0abd8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M68 36c10-6 20-6 30-2M68 48c10-6 20-6 30-2" stroke="#f0abd8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M78 20l16 10-9 3 2 10-11-9z" fill="#fbbf24" />
    </svg>
  );
}
function MathHeroIllustration() {
  return (
    <svg width="110" height="100" viewBox="0 0 120 110" fill="none" aria-hidden="true" className="opacity-90">
      <rect x="18" y="18" width="54" height="54" rx="4" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" transform="rotate(-18 45 45)" />
      <path d="M60 70L100 30M100 70L60 30" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      <circle cx="90" cy="80" r="14" stroke="white" strokeWidth="2" fill="none" opacity="0.8" />
    </svg>
  );
}
