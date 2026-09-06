"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, SubjectCard } from "@/components/ui";
import { countMatchingQuestions } from "@/lib/qbank-selection";

/* ---------------------------------------------------------------------- */
/* Types                                                                   */
/* ---------------------------------------------------------------------- */

interface SkillCount {
  domain: string;
  skill: string;
  section: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  attempted: number;
  correct: number;
}


const SECTIONS = ["Reading and Writing", "Math"] as const;
type SectionName = (typeof SECTIONS)[number];

/* ---------------------------------------------------------------------- */
/* Small icons                                                            */
/* ---------------------------------------------------------------------- */

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`text-brand-slate transition-transform ${collapsed ? "-rotate-90" : ""}`}
    >
      <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BarChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CheckBadgeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12l2.3 2.3L15.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5h16l-6 7.5V18l-4 2v-7.5L4 5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function ZapIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Page                                                                    */
/* ---------------------------------------------------------------------- */

type Stage = "hub" | "section";

export default function PracticePage() {
  const [stage, setStage] = useState<Stage>("hub");
  const [activeSection, setActiveSection] = useState<SectionName>("Reading and Writing");

  // Picker state
  const [counts, setCounts] = useState<SkillCount[] | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);

  // Real per-question progress (distinct questions solved, not just a
  // running attempted-counter that double-counts retries) — backs the hub
  // cards, the analytics row, and the section topic table.
  const [sectionOverview, setSectionOverview] = useState<{ section: string; total: number; solved: number; pct: number }[] | null>(
    null
  );
  const [globalStats, setGlobalStats] = useState<{
    questionsAttempted: number;
    currentAccuracyPct: number | null;
    skillsMastered: number;
    studyStreakDays: number;
  } | null>(null);
  const [topicRows, setTopicRows] = useState<
    { domain: string; skill: string; total: number; solved: number; accuracyPct: number | null; isWeak: boolean }[] | null
  >(null);
  const [firstTryOnly, setFirstTryOnly] = useState(false);

  function loadOverview() {
    fetch("/api/practice/overview")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setSectionOverview(data.sections);
        setGlobalStats(data.stats);
      })
      .catch(() => {
        // hub still works off `counts` as a fallback if this fails
      });
  }

  function loadTopics(section: SectionName, firstTry: boolean) {
    setTopicRows(null);
    fetch(`/api/practice/topics?section=${encodeURIComponent(section)}&firstTryOnly=${firstTry ? "1" : "0"}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setTopicRows(data.topics))
      .catch(() => {
        // section table falls back to `counts`-derived numbers if this fails
      });
  }

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    fetch("/api/practice/counts")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setCounts(data.counts))
      .catch(() => setCountsError("Couldn't load practice categories. Try refreshing."));
  }, []);

  const groupedBySection = useMemo(() => {
    const map = new Map<SectionName, Map<string, SkillCount[]>>();
    for (const section of SECTIONS) map.set(section, new Map());
    for (const c of counts ?? []) {
      const domains = map.get(c.section as SectionName);
      if (!domains) continue;
      if (!domains.has(c.domain)) domains.set(c.domain, []);
      domains.get(c.domain)!.push(c);
    }
    return map;
  }, [counts]);

  // Per-section rollups for the hub cards + analytics.
  const sectionSummary = useMemo(() => {
    const out: Record<SectionName, { total: number; attempted: number; correct: number }> = {
      "Reading and Writing": { total: 0, attempted: 0, correct: 0 },
      Math: { total: 0, attempted: 0, correct: 0 },
    };
    for (const c of counts ?? []) {
      const s = out[c.section as SectionName];
      if (!s) continue;
      s.total += c.total;
      s.attempted += c.attempted;
      s.correct += c.correct;
    }
    return out;
  }, [counts]);

  const overallStats = useMemo(() => {
    const attempted = sectionSummary["Reading and Writing"].attempted + sectionSummary.Math.attempted;
    const correct = sectionSummary["Reading and Writing"].correct + sectionSummary.Math.correct;
    return { attempted, accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : null };
  }, [sectionSummary]);

  // Launching a set: the topic picker shows a spinner / error while the
  // Question Bank set is created and the exam page takes over.
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // Per-section topic picker: checkboxes per skill, difficulty + a couple
  // of filter toggles, a "select all" banner, and a Math-only "weakest
  // topics" recommended drill.
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(
    new Set(["Easy", "Medium", "Hard"])
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [excludeActive, setExcludeActive] = useState(false);
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [difficultyOpen, setDifficultyOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<"all" | "completed" | "not_started">("all");
  const [moreOpen, setMoreOpen] = useState(false);

  function toggleSkill(skillName: string) {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) next.delete(skillName);
      else next.add(skillName);
      return next;
    });
  }
  function toggleDomain(skills: SkillCount[]) {
    const names = skills.map((s) => s.skill);
    const allSelected = names.every((n) => selectedSkills.has(n));
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      names.forEach((n) => (allSelected ? next.delete(n) : next.add(n)));
      return next;
    });
  }
  function toggleDifficulty(d: string) {
    setSelectedDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }
  function toggleCollapsed(domain: string) {
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  // A category drill contains every question matching the learner's filters.
  // The backend may return fewer only when "exclude answered" removes items.
  async function startDrill(filters: { skills: string[]; difficulties: string[]; shuffle: boolean; excludeSeen: boolean }) {
    setLoadingDrill(true);
    setDrillError(null);
    try {
      const res = await fetch("/api/qbank/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: activeSection,
          skills: filters.skills,
          difficulties: filters.difficulties,
          status: filters.excludeSeen ? "unattempted" : "all",
          count: countMatchingQuestions(counts ?? [], activeSection, filters.skills, filters.difficulties),
          shuffle: filters.shuffle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No questions available for those filters.");
      window.location.href = data.href ?? `/practice/qbank/${encodeURIComponent(activeSection)}/${data.setId}`;
    } catch (err) {
      setDrillError(err instanceof Error ? err.message : "Couldn't start this practice set.");
      setLoadingDrill(false);
    }
  }

  function openSection(section: SectionName) {
    setActiveSection(section);
    setSelectedSkills(new Set());
    setDrillError(null);
    setStage("section");
    loadTopics(section, firstTryOnly);
  }

  function handleFindQuestions() {
    if (selectedSkills.size === 0) {
      setDrillError("Pick at least one topic to practice.");
      return;
    }
    startDrill({
      skills: Array.from(selectedSkills),
      difficulties: Array.from(selectedDifficulties),
      shuffle: shuffleQuestions,
      excludeSeen: excludeActive,
    });
  }

  function practiceAllTopics() {
    const skills = (counts ?? []).filter((c) => c.section === activeSection && c.total > 0).map((c) => c.skill);
    if (skills.length === 0) return;
    startDrill({ skills, difficulties: Array.from(selectedDifficulties), shuffle: shuffleQuestions, excludeSeen: excludeActive });
  }

  const weakestTopics = useMemo(() => {
    return (counts ?? [])
      .filter((c) => c.section === activeSection && c.attempted >= 3 && c.total > 0)
      .map((c) => ({ ...c, accuracy: c.correct / c.attempted }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 2);
  }, [counts, activeSection]);

  function startWeakDrill() {
    const skills = weakestTopics.map((t) => t.skill);
    if (skills.length === 0) return;
    startDrill({ skills, difficulties: ["Easy", "Medium", "Hard"], shuffle: true, excludeSeen: false });
  }

  /* ---------------------------------------------------------------- */
  /* Render: Hub — "Question Bank" landing                             */
  /* ---------------------------------------------------------------- */

  if (stage === "hub") {
    const rwOverview = sectionOverview?.find((s) => s.section === "Reading and Writing");
    const mathOverview = sectionOverview?.find((s) => s.section === "Math");
    const rw = { attempted: rwOverview?.solved ?? 0, total: rwOverview?.total ?? sectionSummary["Reading and Writing"].total };
    const math = { attempted: mathOverview?.solved ?? 0, total: mathOverview?.total ?? sectionSummary.Math.total };

    return (
      <div className="space-y-8 max-w-6xl">
        <PageHeader eyebrow="A little practice, every day" title="Question Bank" description="Pick a subject, focus on a skill, and build your own practice session." />

        {countsError && <p className="text-sm text-brand-red">{countsError}</p>}

        <div className="grid md:grid-cols-2 gap-5">
          <SubjectCard section="Reading and Writing" solved={rw.attempted} total={rw.total} onClick={() => openSection("Reading and Writing")} />
          <SubjectCard section="Math" solved={math.attempted} total={math.total} onClick={() => openSection("Math")} />
        </div>

        <Link
          href="/practice/browse"
          className="card p-5 flex items-center justify-between gap-4 flex-wrap hover:shadow-card-hover transition-shadow"
        >
          <div>
            <p className="text-sm font-semibold text-brand-navy">Browse every question</p>
            <p className="text-xs text-brand-slate mt-0.5">
              Filter the whole bank by domain, skill and difficulty, see which ones you've solved, and study the exact
              questions you choose.
            </p>
          </div>
          <span className="btn-primary text-sm px-4 py-2 shrink-0">Open the bank →</span>
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center text-brand-slate">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <h2 className="text-xl font-bold text-brand-navy">Question Analytics</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-2">Questions Attempted</p>
              <p className="text-2xl font-bold text-brand-navy">{globalStats ? globalStats.questionsAttempted : "—"}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-2">Current Accuracy</p>
              <p className="text-2xl font-bold text-brand-navy">
                {globalStats ? (globalStats.currentAccuracyPct === null ? "—" : `${globalStats.currentAccuracyPct}%`) : "—"}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-2">Skills Mastered</p>
              <p className="text-2xl font-bold text-brand-navy">{globalStats ? globalStats.skillsMastered : "—"}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-2">Study Streak</p>
              <p className="text-2xl font-bold text-brand-navy">
                {globalStats ? `${globalStats.studyStreakDays} day${globalStats.studyStreakDays === 1 ? "" : "s"}` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render: Section topic list                                        */
  /* ---------------------------------------------------------------- */

  if (stage === "section") {
    const domains = Array.from(groupedBySection.get(activeSection)?.entries() ?? []).map(
      ([domain, skills]) =>
        [
          domain,
          skills.filter((s) => {
            if (completedFilter === "all") return true;
            if (completedFilter === "completed") return s.attempted > 0;
            return s.attempted === 0;
          }),
        ] as [string, SkillCount[]]
    ).filter(([, skills]) => skills.length > 0);
    const totalSkillCount = counts ? counts.filter((c) => c.section === activeSection).length : 0;
    const weakDrillMinutes = Math.max(1, Math.round(20 * 0.7));

    return (
      <div className="space-y-5 max-w-5xl">
        <button onClick={() => setStage("hub")} className="text-sm text-brand-slate hover:text-brand-navy">
          ‹ Back to Question Bank
        </button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-navy">{activeSection === "Math" ? "Math" : "Reading and Writing"}</h1>
          <div className="flex items-center gap-2">
          <Link
            href={`/practice/browse?section=${encodeURIComponent(activeSection)}`}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-blue border border-brand-blue/40 rounded-full px-3 py-1.5 hover:bg-brand-blue-light"
          >
            Browse all questions
          </Link>
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-3 py-1.5 hover:bg-slate-50"
            >
              <DotsIcon /> More options
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 z-20 card p-1.5 w-56">
                <button
                  onClick={() => {
                    const skills = (counts ?? []).filter((c) => c.section === activeSection && c.total > 0).map((c) => c.skill);
                    setSelectedSkills(new Set(skills));
                    setMoreOpen(false);
                  }}
                  className="w-full text-left text-sm text-brand-navy px-2.5 py-2 rounded-md hover:bg-slate-50"
                >
                  Select all topics
                </button>
                <button
                  onClick={() => {
                    setSelectedSkills(new Set());
                    setMoreOpen(false);
                  }}
                  className="w-full text-left text-sm text-brand-navy px-2.5 py-2 rounded-md hover:bg-slate-50"
                >
                  Clear selection
                </button>
                <button
                  onClick={() => {
                    setSelectedDifficulties(new Set(["Easy", "Medium", "Hard"]));
                    setCompletedFilter("all");
                    setShuffleQuestions(true);
                    setExcludeActive(false);
                    setMoreOpen(false);
                  }}
                  className="w-full text-left text-sm text-brand-navy px-2.5 py-2 rounded-md hover:bg-slate-50"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
          </div>
        </div>

        {countsError && <p className="text-sm text-brand-red">{countsError}</p>}
        {drillError && <p className="text-sm text-brand-red">{drillError}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setDifficultyOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-3 py-1.5 hover:bg-slate-50"
            >
              <BarChartIcon /> Difficulty <ChevronIcon collapsed={!difficultyOpen} />
            </button>
            {difficultyOpen && (
              <div className="absolute left-0 top-10 z-20 card p-3 w-44">
                {(["Easy", "Medium", "Hard"] as const).map((d) => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={selectedDifficulties.has(d)}
                      onChange={() => toggleDifficulty(d)}
                      className="w-4 h-4 accent-brand-blue"
                    />
                    <span className="text-sm text-brand-navy">{d}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setCompletedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-3 py-1.5 hover:bg-slate-50"
            >
              <CheckBadgeIcon /> Completed <ChevronIcon collapsed={!completedOpen} />
            </button>
            {completedOpen && (
              <div className="absolute left-0 top-10 z-20 card p-1.5 w-48">
                {(
                  [
                    ["all", "All topics"],
                    ["completed", "Started / completed"],
                    ["not_started", "Not started"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setCompletedFilter(value);
                      setCompletedOpen(false);
                    }}
                    className={`w-full text-left text-sm px-2.5 py-2 rounded-md hover:bg-slate-50 ${
                      completedFilter === value ? "text-brand-blue font-medium" : "text-brand-navy"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-3 py-1.5 hover:bg-slate-50"
            >
              <FunnelIcon /> Filters <ChevronIcon collapsed={!filtersOpen} />
            </button>
            {filtersOpen && (
              <div className="absolute left-0 top-10 z-20 card p-3 w-64 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={() => setShuffleQuestions((v) => !v)}
                    className="w-4 h-4 accent-brand-blue"
                  />
                  <span className="text-sm text-brand-navy">Shuffle questions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeActive}
                    onChange={() => setExcludeActive((v) => !v)}
                    className="w-4 h-4 accent-brand-blue"
                  />
                  <span className="text-sm text-brand-navy">Exclude questions I've already answered</span>
                </label>
                <div className="border-t border-brand-border pt-2 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={firstTryOnly}
                      onChange={() => {
                        const next = !firstTryOnly;
                        setFirstTryOnly(next);
                        loadTopics(activeSection, next);
                      }}
                      className="w-4 h-4 accent-brand-blue"
                    />
                    <span className="text-sm text-brand-navy">First-try accuracy</span>
                  </label>
                  <p className="text-[11px] text-brand-slate mt-1 pl-6">
                    Count only each question's first attempt, not retries.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeSection === "Math" && weakestTopics.length > 0 && (
          <div className="card p-4 flex items-center justify-between gap-4 flex-wrap border-brand-blue/30">
            <div>
              <p className="text-xs font-semibold text-brand-blue mb-1">✦ Recommended</p>
              <p className="text-sm text-brand-navy">
                Practice 20 questions from your{" "}
                <button onClick={startWeakDrill} className="text-brand-red font-medium underline underline-offset-2 hover:no-underline">
                  {weakestTopics.length} weakest topic{weakestTopics.length > 1 ? "s" : ""}
                </button>
              </p>
            </div>
            <button onClick={startWeakDrill} className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5 shrink-0">
              <PlayIcon /> Start drill <span className="font-normal opacity-80">({weakDrillMinutes} min)</span>
            </button>
          </div>
        )}

        <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-brand-navy">Practice all topics</p>
            <p className="text-xs text-brand-slate mt-0.5">
              Start practicing all {totalSkillCount} skills in {activeSection === "Math" ? "Math" : "Reading & Writing"}.
            </p>
          </div>
          <button onClick={practiceAllTopics} disabled={loadingDrill} className="btn-secondary text-sm px-4 shrink-0">
            {loadingDrill ? "Loading…" : "Start practice"}
          </button>
        </div>

        <div className="border border-brand-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_150px_90px] gap-4 px-4 py-2.5 text-xs font-semibold text-brand-slate bg-slate-50 border-b border-brand-border">
            <span>Topic</span>
            <span>Progress</span>
            <span className="text-right">Accuracy</span>
          </div>
          {domains.map(([domain, skills]) => (
            <div key={domain}>
              <div className="px-4 pt-4 pb-1">
                <h3 className="text-sm font-bold text-brand-navy">{domain}</h3>
              </div>
              {skills.map((s) => {
                const t = topicRows?.find((r) => r.skill === s.skill);
                const solved = t ? t.solved : s.attempted;
                const accuracy = t ? t.accuracyPct : s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : null;
                const isWeak = t ? t.isWeak : s.attempted >= 3 && accuracy !== null && accuracy < 60;
                const pct = s.total > 0 ? Math.min(100, Math.round((solved / s.total) * 100)) : 0;
                return (
                  <label
                    key={s.skill}
                    className={`grid grid-cols-[1fr_150px_90px] gap-4 items-center px-4 py-3 border-b border-brand-border last:border-0 ${
                      s.total === 0 ? "opacity-40" : "cursor-pointer hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-brand-navy min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(s.skill)}
                        disabled={s.total === 0}
                        onChange={() => toggleSkill(s.skill)}
                        className="w-4 h-4 accent-brand-blue shrink-0"
                      />
                      <span className="truncate">{s.skill}</span>
                      {isWeak && (
                        <span className="flex items-center gap-0.5 shrink-0 text-[10px] font-semibold text-brand-red bg-brand-red-light px-1.5 py-0.5 rounded">
                          <ZapIcon /> Weak
                        </span>
                      )}
                      {s.total > 0 && (
                        <Link
                          href={`/practice/browse?section=${encodeURIComponent(activeSection)}&skill=${encodeURIComponent(s.skill)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Browse every ${s.skill} question`}
                          className="ml-auto shrink-0 text-[11px] font-medium text-brand-blue hover:underline"
                        >
                          Browse
                        </Link>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-brand-slate tabular-nums w-14 text-right shrink-0">
                        {solved}/{s.total}
                      </span>
                    </div>
                    <span className="text-right shrink-0 flex items-center justify-end gap-1.5 text-xs">
                      {accuracy === null ? (
                        <span className="text-brand-slate">–</span>
                      ) : (
                        <>
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              accuracy >= 80 ? "bg-brand-green" : accuracy >= 60 ? "bg-brand-amber" : "bg-brand-red"
                            }`}
                          />
                          <span className="text-brand-navy">{accuracy}%</span>
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div className="action-bar">
          <button onClick={handleFindQuestions} disabled={loadingDrill || selectedSkills.size === 0 || selectedDifficulties.size === 0} className="btn-primary text-sm px-6">
            {loadingDrill ? "Loading…" : "Start practice"}
          </button>
          <span className="text-xs text-brand-slate bg-white px-2">
            {selectedSkills.size === 0 ? "No topics selected" : `${selectedSkills.size} selected`}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
