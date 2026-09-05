"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { BrandLockup, BrainWatermark } from "./BrainLogo";
import { TextWatermarkOverlay } from "./TextWatermarkOverlay";
import { SAT_STRUCTURE } from "@/lib/sat-constants";

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

// Sidebar nav — Mocks is always the active/current page here. Guests see
// the same distinct icon as everyone else, just muted, with a small lock
// badge, and get sent to /login when they tap it; signed-in users go
// straight through to the real routes. Icons/labels match the signed-in
// Sidebar component exactly so navigating between signed-out and signed-in
// never looks like two different apps — that mismatch (this file quietly
// keeping its own older nav markup after Sidebar.tsx was redesigned) was
// the actual "old design flashes before new design" bug: two separate
// components that drifted apart, not a caching issue.
const NAV_LINKS = [
  { href: "/mocks", label: "Mocks", title: "SAT mock tests", icon: NavDocIcon },
  { href: "/practice", label: "Question Bank", title: "Official SAT Question Bank practice", icon: NavLayersIcon },
  { href: "/coach", label: "Coach", title: "AI-powered SAT coach", icon: NavCoachIcon },
  { href: "/progress", label: "Your Data", title: "Your BlueMind score history", icon: NavChartIcon },
];

const THEME_STORAGE_KEY = "bluemind_homepage_theme";
const SIDEBAR_STORAGE_KEY = "bluemind_homepage_sidebar_collapsed";

export function PublicLanding({ signedIn, userName }: { signedIn: boolean; userName: string | null }) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState("All");
  const [activeTab, setActiveTab] = useState<SectionTab>("Math");
  // Tab switch crossfade — short and snappy rather than an abrupt swap.
  const [displayedTab, setDisplayedTab] = useState<SectionTab>("Math");
  const [tabFading, setTabFading] = useState(false);

  // Dark mode — homepage-only preference, persisted in the browser. Defaults
  // to light; flips a `dark` class on the page root that every element below
  // reads off of via conditional Tailwind classes.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      setDark(window.localStorage.getItem(THEME_STORAGE_KEY) === "dark");
    } catch {
      // localStorage unavailable — stay on the light default
    }
  }, []);
  function toggleDark() {
    setDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  }

  // Sidebar collapse — same icon-only collapsed mode as the signed-in
  // Sidebar component, now available to guests too (it previously only
  // existed post-login, which is exactly the "two different apps" gap
  // being fixed here).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable — stay expanded
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  }

  function handleTabChange(tab: SectionTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabFading(true);
    setTimeout(() => {
      setDisplayedTab(tab);
      setTabFading(false);
    }, 150);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  // Signed-in users' saved module scores, keyed "mockId|section|module" —
  // powers the switch from "Start Practice" to a score/Review state on each
  // module row. Guests never fetch this (nothing is saved for them anyway).
  const [savedResults, setSavedResults] = useState<Record<string, { correctCount: number; total: number }>>({});

  useEffect(() => {
    const controller = new AbortController();
    // A hung request (e.g. a slow/stuck database connection on the server)
    // previously left this stuck on the loading skeleton forever with zero
    // feedback — no error, no retry, nothing. 12s is generous for a cold
    // start but still gives the person something actionable instead of an
    // indefinite dead spinner.
    const timeout = setTimeout(() => controller.abort(), 12000);

    fetch("/api/public/mocks", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Clears any stale error from an earlier aborted attempt — in dev,
        // React StrictMode intentionally mounts this effect twice, so the
        // FIRST run's fetch gets aborted by its own cleanup and sets the
        // "taking too long" error, while the SECOND run's fetch succeeds
        // normally right after. Without this, both states stayed set at
        // once: the error banner and the real data showing together.
        setError(null);
        setGroups(data.groups);
      })
      .catch((err) => {
        setError(
          err?.name === "AbortError"
            ? "This is taking too long to load — the server may be starting up or having trouble. Try refreshing in a moment."
            : "Couldn't load the mock library right now. Please refresh."
        );
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    function loadScores() {
      fetch("/api/module-results")
        .then((res) => res.json())
        .then((data) => {
          const map: Record<string, { correctCount: number; total: number }> = {};
          for (const r of data.results ?? []) {
            map[`${r.mockId}|${r.section}|${r.module}`] = { correctCount: r.correctCount, total: r.total };
          }
          setSavedResults(map);
        })
        .catch(() => {
          // best-effort — rows just show "Start Practice" if this fails
        });
    }
    loadScores();

    // See the identical comment in (app)/mocks/page.tsx — bfcache restores
    // on back/forward navigation can otherwise show a stale pre-attempt state.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) loadScores();
    }
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", loadScores);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", loadScores);
    };
  }, [signedIn]);

  const allMocks = useMemo(() => (groups ?? []).flatMap((g) => g.mocks.map((m) => ({ ...m, group: g.key }))), [groups]);

  const visibleMocks = useMemo(() => {
    if (activeGroup === "All") return allMocks;
    return allMocks.filter((m) => m.group === activeGroup);
  }, [allMocks, activeGroup]);

  // Same stable A/B/C… badge-per-title logic as the signed-in /mocks page
  // — replaces a static "Free" pill that had no actual logic behind it.
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

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen flex bg-slate-50 dark:bg-[#0b1220] transition-colors relative">
        <TextWatermarkOverlay dark={dark} />
        {/* ---------------- Sidebar (desktop) ---------------- */}
        <aside
          className={`relative z-10 hidden md:flex md:flex-col shrink-0 border-r border-brand-border dark:border-white/10 bg-white dark:bg-[#0f1a2e] py-5 transition-[width] duration-150 ${
            collapsed ? "md:w-[76px] px-2.5" : "md:w-64 px-4"
          }`}
        >
          <Link href="/" className="mb-6 px-1 flex items-center justify-center">
            <BrandLockup size={24} collapsed={collapsed} />
          </Link>

          <nav className="flex-1 space-y-2">
            {NAV_LINKS.map((item) => {
              const Icon = item.icon;
              if (item.href === "/mocks") {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center rounded-2xl text-base font-semibold bg-brand-blue-light text-brand-blue dark:bg-brand-blue/20 ${
                      collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3"
                    }`}
                  >
                    <Icon />
                    {!collapsed && item.label}
                  </Link>
                );
              }
              return signedIn ? (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : item.title}
                  className={`group flex items-center rounded-2xl text-base font-semibold text-brand-slate dark:text-slate-300 hover:text-brand-navy dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-200 ${
                    collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3"
                  }`}
                >
                  <span className="shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:text-amber-500">
                    <Icon />
                  </span>
                  {!collapsed && item.label}
                </Link>
              ) : (
                <Link
                  key={item.href}
                  href="/login"
                  title={collapsed ? item.label : `${item.title} — sign in to unlock`}
                  className={`flex items-center rounded-2xl text-base font-semibold text-brand-slate/70 dark:text-slate-500 hover:text-brand-navy dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-200 ${
                    collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3"
                  }`}
                >
                  <span className="relative shrink-0">
                    <Icon />
                    <Lock size={10} className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-[#0f1a2e] rounded-full p-[1px]" />
                  </span>
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-brand-border dark:border-white/10 space-y-2">
            {signedIn ? (
              <>
                {!collapsed && (
                  <Link
                    href="/account"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <span className="w-8 h-8 rounded-full bg-brand-blue text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {(userName?.[0] ?? "S").toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium text-brand-navy dark:text-white">
                      {userName ?? "Profile"}
                    </span>
                  </Link>
                )}
                {!collapsed && (
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-brand-red hover:bg-brand-red-light dark:hover:bg-white/5"
                  >
                    Log out
                  </button>
                )}
              </>
            ) : (
              !collapsed && (
                <Link
                  href="/login"
                  className="block text-center rounded-full bg-brand-navy text-white text-sm font-semibold px-4 py-2.5 hover:bg-brand-navy/90 transition-colors"
                >
                  Sign In
                </Link>
              )
            )}
            <button
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : undefined}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-brand-slate dark:text-slate-400 border border-brand-border dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5`}
            >
              <ChevronCollapseIcon collapsed={collapsed} />
              {!collapsed && "Collapse"}
            </button>
          </div>
        </aside>

        <div className="relative z-10 flex-1 min-w-0">
          {/* ---------------- Mobile header ---------------- */}
          <header className="md:hidden sticky top-0 z-40 bg-white/95 dark:bg-[#0f1a2e]/95 backdrop-blur border-b border-brand-border dark:border-white/10">
            <div className="pl-3 pr-4 h-16 flex items-center justify-between gap-3">
              <Link href="/" className="shrink-0">
                <BrandLockup size={24} />
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleDark}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-brand-border dark:border-white/15 text-brand-navy dark:text-white"
                  aria-label="Toggle dark mode"
                >
                  {dark ? <SunIcon /> : <MoonIcon />}
                </button>
                {signedIn ? (
                  <Link href="/mocks" className="shrink-0 whitespace-nowrap rounded-full bg-brand-blue text-white text-xs font-semibold px-3.5 py-2 hover:bg-brand-blue-dark transition-colors">
                    My Mocks
                  </Link>
                ) : (
                  <Link href="/login" className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full bg-brand-navy text-white text-xs font-semibold hover:bg-brand-navy/90 transition-colors">
                    Sign In
                  </Link>
                )}
              </div>
            </div>
            <nav className="flex items-center gap-1 pl-3 pr-4 pb-3 overflow-x-auto">
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap bg-brand-blue-light text-brand-blue dark:bg-brand-blue/20">
                Mocks
              </span>
              {NAV_LINKS.map((item) =>
                signedIn ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap text-brand-navy/70 dark:text-slate-300"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <Link
                    key={item.href}
                    href="/login"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap text-brand-slate dark:text-slate-400"
                  >
                    <Lock size={12} />
                    {item.label}
                  </Link>
                )
              )}
            </nav>
          </header>

          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            {/* Telegram community banner — bordered card, matches the style
                seen on other SAT-prep sites (bordered box, brand name +
                tagline, a clear join button) but pointing at BlueMind's own
                channel. */}
            <a
              href="https://t.me/bluemind_uz"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-brand-border dark:border-white/15 px-5 py-4 mb-6 hover:border-brand-blue/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 w-10 h-10 rounded-full bg-[#229ED9] text-white flex items-center justify-center">
                  <TelegramIcon />
                </span>
                <div>
                  <p className="text-sm font-semibold text-brand-navy dark:text-white">Join our Telegram community</p>
                  <p className="text-xs text-brand-slate dark:text-slate-400">@bluemind_uz — updates, new mocks, and support</p>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-brand-blue text-brand-blue text-xs font-semibold px-4 py-2 group-hover:bg-brand-blue-light dark:group-hover:bg-brand-blue/20 transition-colors">
                Join Telegram
              </span>
            </a>

            <div className="mb-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-navy dark:text-white">SAT Mock Tests</h1>
              <p className="text-sm text-brand-slate dark:text-slate-400 mt-1">
                Practice realistic full-length SAT tests and learn from every mistake.
              </p>
            </div>

            {/* Section switcher — centered on its own row, dark-mode toggle
                pinned to the right edge of that same row. */}
            <div className="relative flex items-center justify-center mb-6">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-full p-1">
                {(Object.keys(SECTION_META) as SectionTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                      activeTab === tab
                        ? "bg-white dark:bg-[#1a2942] text-brand-navy dark:text-white shadow-sm"
                        : "text-brand-slate dark:text-slate-400 hover:text-brand-navy dark:hover:text-white"
                    }`}
                  >
                    {SECTION_META[tab].label}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleDark}
                aria-label="Toggle dark mode"
                className="absolute right-0 w-10 h-10 flex items-center justify-center rounded-full border border-brand-border dark:border-white/15 text-brand-navy dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>

            {error && <div className="card p-6 text-brand-red text-sm mb-6">{error}</div>}

            {!groups && !error ? (
              <div className="h-64 bg-slate-200 dark:bg-white/5 rounded-xl animate-pulse" />
            ) : !groups ? null : (
              <>
                {/* Year filter — horizontal pill row, matching the signed-in
                    /mocks page exactly instead of a separate vertical
                    sidebar list, so the two don't look like different apps. */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-6">
                  <button
                    onClick={() => setActiveGroup("All")}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:scale-105 ${
                      activeGroup === "All"
                        ? "bg-brand-blue text-white shadow-sm"
                        : "bg-white dark:bg-[#101c33] border border-brand-border dark:border-white/10 text-brand-navy dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-brand-blue/40"
                    }`}
                  >
                    All years
                  </button>
                  {groups!.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setActiveGroup(g.key)}
                      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:scale-105 ${
                        activeGroup === g.key
                          ? "bg-brand-blue text-white shadow-sm"
                          : "bg-white dark:bg-[#101c33] border border-brand-border dark:border-white/10 text-brand-navy dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-brand-blue/40"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Mock grid — short crossfade when the Math/Reading & Writing
                    tab changes, instead of an abrupt swap or a sluggish one. */}
                <div
                  className={`grid sm:grid-cols-2 lg:grid-cols-3 items-start gap-4 transition-all duration-200 ${
                    tabFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
                  }`}
                >
                  {visibleMocks.map((mock) => {
                    const modules = displayedTab === "Math" ? mock.math : mock.readingWriting;
                    return (
                      <div
                        key={mock.id}
                        className="rounded-2xl p-4 flex flex-col relative overflow-hidden transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 bg-white dark:bg-[#101c33] border border-brand-border dark:border-white/10 shadow-[0_1px_2px_0_rgba(23,37,84,0.04),0_1px_3px_0_rgba(23,37,84,0.06)] dark:shadow-none"
                      >
                        <BrainWatermark className="absolute -top-6 -right-6" size={160} opacity={dark ? 0.16 : 0.09} dark={dark} />
                        <div className="flex items-start gap-2.5 mb-3.5 relative z-10">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-bold text-brand-navy dark:text-white leading-tight tracking-tight">
                              {mock.title}
                            </h3>
                            {mock.subtitle && (
                              <p className="text-xs text-brand-slate dark:text-slate-400 mt-0.5">{mock.subtitle}</p>
                            )}
                          </div>
                          <span className="shrink-0 w-7 h-7 rounded-lg border-2 border-brand-blue text-brand-blue text-sm font-bold flex items-center justify-center">
                            {badgeLetters[mock.id]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 text-xs text-brand-navy dark:text-slate-300 border border-brand-border dark:border-white/10 rounded-lg px-3 py-2 mb-3 relative z-10">
                          <span className="flex items-center gap-1.5">
                            <ClockIcon />
                            {SECTION_META[displayedTab].minutes} min
                          </span>
                          <span className="w-px h-3.5 bg-brand-border dark:bg-white/15" />
                          <span className="flex items-center gap-1.5">
                            <DocIcon />
                            {SECTION_META[displayedTab].questions} questions
                          </span>
                        </div>

                        <div className="mt-3.5 space-y-2 relative z-10">
                          {modules.map((m) => (
                            <ModuleRow
                              key={m.module}
                              mockId={mock.id}
                              section={displayedTab}
                              module={m.module}
                              available={m.questionCount > 0}
                              saved={savedResults[`${mock.id}|${displayedTab}|${m.module}`]}
                              dark={dark}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {visibleMocks.length === 0 && (
                    <p className="text-sm text-brand-slate dark:text-slate-400 col-span-full text-center py-12">
                      No mocks uploaded yet{activeGroup !== "All" ? ` for ${activeGroup}` : ""} — check back soon.
                    </p>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
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

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6V3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
function ChevronCollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={collapsed ? "rotate-180" : ""}
    >
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ModuleRow({
  mockId,
  section,
  module,
  available,
  saved,
  dark,
}: {
  mockId: string;
  section: SectionTab;
  module: 1 | 2;
  available: boolean;
  saved?: { correctCount: number; total: number };
  dark: boolean;
}) {
  // See the identical comment in (app)/mocks/page.tsx's ModuleRow —
  // "Save & exit" progress lives only in localStorage, so it has to be
  // checked client-side here too (guests use this landing page's mock
  // list, not just the signed-in one).
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
    <div className="border border-brand-border dark:border-white/10 rounded-lg px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-bold text-brand-navy dark:text-white block">Module {module}</span>
          {available && saved && !inProgress && (
            <span className="text-xs text-brand-slate dark:text-slate-400 tabular-nums">
              Score: {saved.correctCount}/{saved.total}
            </span>
          )}
          {available && inProgress && (
            <span className="text-xs font-semibold text-brand-green">In progress — saved</span>
          )}
        </div>

        {!available && <span className="text-xs text-brand-slate dark:text-slate-500 shrink-0">Coming soon</span>}

        {available && inProgress && (
          <Link
            href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
            className="shrink-0 whitespace-nowrap rounded-full bg-brand-green text-white text-xs font-bold px-4 py-1.5 shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Continue
          </Link>
        )}

        {available && !inProgress && !saved && (
          <Link
            href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
            className={`shrink-0 whitespace-nowrap rounded-full text-white text-xs font-bold px-4 py-1.5 shadow-sm transition-colors ${
              dark ? "bg-brand-blue hover:bg-blue-600" : "bg-[#1e3a6e] hover:bg-[#16305c]"
            }`}
          >
            Start Practice
          </Link>
        )}

        {available && !inProgress && saved && (
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}?review=1`}
              className="whitespace-nowrap text-xs font-bold tracking-wide text-brand-blue rounded-full border-2 border-brand-blue px-4 py-1.5 hover:bg-brand-blue-light dark:hover:bg-brand-blue/20 transition-colors"
            >
              REVIEW
            </Link>
            <Link
              href={`/practice/${mockId}/${encodeURIComponent(section)}/${module}`}
              title="Retake this module — replaces your saved score"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-brand-border dark:border-white/15 text-brand-slate dark:text-slate-400 hover:text-brand-blue hover:border-brand-blue transition-colors"
            >
              <RetakeIcon />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function RetakeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Same icon set as Sidebar.tsx's NAV_ITEMS, under the "Nav" prefix here to
// avoid colliding with this file's own unrelated DocIcon/ClockIcon (used
// on the mock cards, not the nav). Keeping these visually identical is
// the whole point — see the comment on NAV_LINKS above.
function NavDocIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M6 3h9l3 3v15H6V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function NavLayersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5M3 8l9 5 9-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function NavCoachIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 20.5c0-3.6 2.2-6.3 5-6.3s5 2.7 5 6.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="14" y="2" width="9" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16.2 8.5l-1.3 2.6v-2.6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="16.2" cy="5.25" r="0.9" fill="currentColor" />
      <circle cx="18.5" cy="5.25" r="0.9" fill="currentColor" />
      <circle cx="20.8" cy="5.25" r="0.9" fill="currentColor" />
    </svg>
  );
}
function NavChartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
