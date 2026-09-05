"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SAT_STRUCTURE, SAT_TEST_MONTHS } from "@/lib/sat-constants";
import { BrainWatermark } from "@/components/BrainLogo";
import { useTheme } from "@/components/AppShell";

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

type SectionTab = "Math" | "Reading and Writing";

const SECTION_META: Record<SectionTab, { label: string; questions: number; minutes: number }> = {
  Math: { label: "Math", questions: SAT_STRUCTURE.math.totalQuestions, minutes: SAT_STRUCTURE.math.totalMinutes },
  "Reading and Writing": {
    label: "Reading & Writing",
    questions: SAT_STRUCTURE.readingWriting.totalQuestions,
    minutes: SAT_STRUCTURE.readingWriting.totalMinutes,
  },
};

const BADGE_LETTERS = "ABCDEFGHIJ";

// Signed-in "My Mocks" page. Uses the same public mock library + practice
// flow as the landing page (/practice/{mockId}/{section}/{module}).
export default function MocksPage() {
  const { dark, toggleDark } = useTheme();
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

  const [savedScores, setSavedScores] = useState<Record<string, { correctCount: number; total: number }>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [addMockYear, setAddMockYear] = useState<string | null>(null); // group key the modal is adding into

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => setIsAdmin(!!data.user?.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
  }, []);

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
          const map: Record<string, { correctCount: number; total: number }> = {};
          for (const r of data.results ?? []) {
            map[`${r.mockId}|${r.section}|${r.module}`] = { correctCount: r.correctCount, total: r.total };
          }
          setSavedScores(map);
        })
        .catch(() => {});
    }
    loadScores();

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) loadScores();
    }
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", loadScores);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", loadScores);
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

  const sectionMeta = SECTION_META[displayedTab];

  if (error) return <div className="card p-6 text-brand-red text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Telegram community banner — identical to the guest-facing landing
          page's version (PublicLanding.tsx), so signed-in users see the
          exact same banner instead of it only existing for guests. */}
      <a
        href="https://t.me/bluemind_uz"
        target="_blank"
        rel="noreferrer"
        className="group flex items-center justify-between gap-4 rounded-2xl border border-brand-border px-5 py-4 hover:border-brand-blue/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-10 h-10 rounded-full bg-[#229ED9] text-white flex items-center justify-center">
            <TelegramIcon />
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-navy">Join our Telegram community</p>
            <p className="text-xs text-brand-slate">@bluemind_uz — updates, new mocks, and support</p>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-brand-blue text-brand-blue text-xs font-semibold px-4 py-2 group-hover:bg-brand-blue-light transition-colors">
          Join Telegram
        </span>
      </a>

      {/* Plain header — no gradient banner. Dark-mode toggle and section
          tabs live in the top-right, same as before. */}
      <div className="mb-1">
        <h1 className="text-2xl font-bold text-brand-navy">SAT Mock Tests</h1>
        <p className="text-brand-slate mt-1 text-sm">Practice realistic full-length SAT tests and learn from every mistake.</p>
      </div>

      {/* Section switcher — centered on its own row, dark-mode toggle pinned
          to the right edge of that same row. Matches PublicLanding.tsx. */}
      <div className="relative flex items-center justify-center">
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {(Object.keys(SECTION_META) as SectionTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                activeTab === tab ? "bg-white text-brand-navy shadow-sm" : "text-brand-slate hover:text-brand-navy"
              }`}
            >
              {SECTION_META[tab].label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleDark}
          title={dark ? "Switch to light background" : "Switch to dark background"}
          className="absolute right-0 w-10 h-10 rounded-full border border-brand-border text-brand-navy flex items-center justify-center hover:bg-slate-50"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
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
          className={`grid sm:grid-cols-2 lg:grid-cols-3 items-start gap-4 transition-all duration-200 ${
            tabFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
          }`}
        >
          {visibleMocks.map((mock) => {
            const modules = displayedTab === "Math" ? mock.math : mock.readingWriting;
            return (
              <div key={mock.id} className="card rounded-2xl p-4 flex flex-col relative overflow-hidden transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
                <BrainWatermark className="absolute -top-6 -right-6" size={160} opacity={dark ? 0.16 : 0.09} dark={dark} />
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
                  {modules.map((m) => {
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
                        isAdmin={isAdmin}
                        onCountChange={loadMocks}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {visibleMocks.length === 0 && (
            <p className="text-sm text-brand-slate col-span-full text-center py-12">
              No mocks uploaded yet{activeGroup !== "All" ? ` for ${activeGroup}` : ""} — check back soon.
            </p>
          )}
        </div>
      )}

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
  isAdmin,
  onCountChange,
}: {
  mockId: string;
  section: SectionTab;
  module: 1 | 2;
  available: boolean;
  questionCount: number;
  saved?: { correctCount: number; total: number };
  isAdmin: boolean;
  onCountChange?: () => void;
}) {
  const [inProgress, setInProgress] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`bluemind_progress_${mockId}_${section}_${module}`);
      setInProgress(!!raw);
    } catch {
      setInProgress(false);
    }
  }, [mockId, section, module]);

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
            <span className="text-xs font-semibold text-brand-green">In progress — saved</span>
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
            className="shrink-0 whitespace-nowrap rounded-full bg-[#1e3a6e] text-white text-xs font-semibold tracking-wide px-4 py-1.5 shadow-sm hover:bg-[#16305c] transition-colors"
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
              REVIEW
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
                ? "shrink-0 whitespace-nowrap rounded-full bg-[#1e3a6e] text-white text-xs font-semibold tracking-wide px-4 py-1.5 shadow-sm hover:bg-[#16305c] transition-colors"
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
