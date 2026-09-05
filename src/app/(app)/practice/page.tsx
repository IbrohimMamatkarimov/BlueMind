"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MathText } from "@/components/MathText";
import { DesmosCalculator } from "@/components/DesmosCalculator";
import { Celebration } from "@/components/Celebration";
import { CoachSlideshow } from "@/components/CoachSlideshow";

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
interface Choice {
  id: string;
  text: string;
}
interface PracticeQuestion {
  id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  passageText: string | null;
  questionText: string;
  choices: Choice[];
  questionType: "multiple_choice" | "spr";
}
interface GradeResult {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string;
  rationale: string;
  explanation: string;
}
interface MistakeRecord {
  question: PracticeQuestion;
  selectedAnswer: string | null;
  result: GradeResult;
}

type CoachMode = "hint" | "explain" | "teach" | "diagnose";

const SECTIONS = ["Reading and Writing", "Math"] as const;
type SectionName = (typeof SECTIONS)[number];

/* ---------------------------------------------------------------------- */
/* Small icons                                                            */
/* ---------------------------------------------------------------------- */

function CalculatorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7.5" y="5.5" width="9" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.2" cy="13" r="0.9" fill="currentColor" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" />
      <circle cx="15.8" cy="13" r="0.9" fill="currentColor" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
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
function FlagIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path d="M6 3v18M6 4h11l-3 4 3 4H6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function EliminatorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
        ABC
      </text>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function ResumeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4l13 8-13 8V4z" />
    </svg>
  );
}
function NavGridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </svg>
  );
}
function XCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function BookIllustration() {
  // Uploaded image (public/images/rwsqb.png), sized large and prominent
  // instead of the old cramped small-icon-in-the-corner look.
  return <img src="/images/rwsqb.png" alt="" className="w-[220px] h-[200px] object-contain" aria-hidden="true" />;
}
function MathIllustration() {
  // Uploaded image (public/images/mathsqb.png), sized large and prominent
  // instead of the old cramped small-icon-in-the-corner look.
  return <img src="/images/mathsqb.png" alt="" className="w-[220px] h-[200px] object-contain" aria-hidden="true" />;
}

/* ---------------------------------------------------------------------- */
/* Page                                                                    */
/* ---------------------------------------------------------------------- */

type Stage = "hub" | "section" | "drilling" | "summary";

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

  // Drill state — per-question maps (not single "current" state) so
  // Previous/Next/jump-to-any-question from the navigator all work and
  // restore exactly what was there before, matching the real Bluebook
  // question-bank navigation model instead of a forward-only flow.
  const [skillLabel, setSkillLabel] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [crossedOut, setCrossedOut] = useState<Record<string, string[]>>({});
  const [eliminatorMode, setEliminatorMode] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [groupAnswered, setGroupAnswered] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [grading, setGrading] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [celebrateTrigger, setCelebrateTrigger] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Per-question stopwatch — counts up from 0, resets the instant the
  // question index changes. Pausable, and pausing does NOT lock the rest of
  // the UI — you can keep answering while paused, only the clock stops.
  useEffect(() => {
    if (stage !== "drilling") return;
    setElapsedSeconds(0);
  }, [stage, index]);
  useEffect(() => {
    if (stage !== "drilling" || timerPaused) return;
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stage, timerPaused, index]);

  // Derived from the results map rather than tracked as separate running
  // state, since results can now change at any index (Previous/Next/jump).
  const correctCount = useMemo(() => Object.values(results).filter((r) => r.isCorrect).length, [results]);
  const mistakes: MistakeRecord[] = useMemo(() => {
    return questions
      .filter((q) => results[q.id] && !results[q.id].isCorrect)
      .map((q) => ({ question: q, selectedAnswer: answers[q.id] ?? null, result: results[q.id] }));
  }, [questions, results, answers]);

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
  const [lastFilters, setLastFilters] = useState<{
    skills: string[];
    difficulties: string[];
    shuffle: boolean;
    excludeSeen: boolean;
  } | null>(null);

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

  async function startDrill(
    filters: { skills: string[]; difficulties: string[]; shuffle: boolean; excludeSeen: boolean }
  ) {
    setLoadingDrill(true);
    setDrillError(null);
    setIndex(0);
    setAnswers({});
    setResults({});
    setMarked({});
    setCrossedOut({});
    setEliminatorMode(false);
    try {
      const p = new URLSearchParams();
      p.set("skills", filters.skills.join(","));
      p.set("difficulties", filters.difficulties.join(","));
      p.set("limit", "20");
      if (filters.shuffle) p.set("shuffle", "1");
      if (filters.excludeSeen) p.set("excludeSeen", "1");

      const res = await fetch(`/api/practice/questions?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No questions available");
      setQuestions(data.questions);
      setSkillLabel(filters.skills.length === 1 ? filters.skills[0] : `${filters.skills.length} topics selected`);
      setLastFilters(filters);
      setStage("drilling");
    } catch (err) {
      setDrillError(err instanceof Error ? err.message : "Couldn't load this drill.");
    } finally {
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

  const current = questions[index];
  const isMath = current?.section === "Math";
  const currentResult = current ? results[current.id] ?? null : null;
  const answerValue = current ? answers[current.id] ?? null : null;

  function isCrossedOut(questionId: string, choiceId: string) {
    return (crossedOut[questionId] ?? []).includes(choiceId);
  }
  function toggleCrossOut(questionId: string, choiceId: string) {
    setCrossedOut((prev) => {
      const list = prev[questionId] ?? [];
      return {
        ...prev,
        [questionId]: list.includes(choiceId) ? list.filter((c) => c !== choiceId) : [...list, choiceId],
      };
    });
  }
  function toggleMark(questionId: string) {
    setMarked((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }
  function selectAnswer(questionId: string, value: string) {
    if (results[questionId]) return; // locked once graded, matching one-submit-per-question scoring
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }
  function goToQuestion(i: number) {
    if (i < 0 || i >= questions.length) return;
    setIndex(i);
    setNavigatorOpen(false);
  }

  async function submitAnswer() {
    if (!current || grading || currentResult) return;
    setGrading(true);
    try {
      const res = await fetch("/api/practice/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, selectedAnswer: answerValue ?? null }),
      });
      const data: GradeResult = await res.json();
      if (!res.ok) throw new Error();
      setResults((prev) => ({ ...prev, [current.id]: data }));
    } catch {
      setDrillError("Couldn't grade that answer — try again.");
    } finally {
      setGrading(false);
    }
  }

  function nextQuestion() {
    if (index + 1 >= questions.length) {
      setStage("summary");
      if (correctCount >= Math.ceil(questions.length * 0.8)) {
        setCelebrateTrigger((t) => t + 1);
      }
      // Refresh counts so the hub/section progress bars reflect this session.
      fetch("/api/practice/counts")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setCounts(data.counts))
        .catch(() => {});
      loadOverview();
      loadTopics(activeSection, firstTryOnly);
      return;
    }
    setIndex((i) => i + 1);
  }
  function previousQuestion() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function backToSection() {
    setStage("section");
    setSkillLabel(null);
    setQuestions([]);
  }

  // -------------------- Coach drawer (inline, per-question) --------------------
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachData, setCoachData] = useState<{ mode: CoachMode; text: string } | null>(null);
  const [coachConversationId, setCoachConversationId] = useState<string | undefined>(undefined);

  async function askCoach(mode: CoachMode, question: PracticeQuestion, studentSelected: string | null) {
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachData(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          questionId: question.id,
          conversationId: coachConversationId,
          questionText: question.questionText,
          choices: question.choices,
          skill: question.skill,
          difficulty: question.difficulty,
          studentAnswer: question.choices.find((c) => c.id === studentSelected)?.text ?? studentSelected ?? undefined,
          examMode: !currentResult,
        }),
      });
      const data = await res.json();
      setCoachConversationId(data.conversationId);
      const text =
        mode === "hint"
          ? data.hint
          : mode === "diagnose"
            ? `${data.diagnosis}\n\n${data.next_step}`
            : mode === "teach"
              ? `${data.concept}\n\n${data.explanation}`
              : data.explanation;
      setCoachData({ mode, text });
    } catch {
      setCoachData({ mode, text: "Coach is unavailable right now — nothing was lost, try again shortly." });
    } finally {
      setCoachLoading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render: Hub — "Question Bank" landing                             */
  /* ---------------------------------------------------------------- */

  if (stage === "hub") {
    const rwOverview = sectionOverview?.find((s) => s.section === "Reading and Writing");
    const mathOverview = sectionOverview?.find((s) => s.section === "Math");
    const rw = { attempted: rwOverview?.solved ?? 0, total: rwOverview?.total ?? sectionSummary["Reading and Writing"].total };
    const math = { attempted: mathOverview?.solved ?? 0, total: mathOverview?.total ?? sectionSummary.Math.total };
    const rwPct = rwOverview?.pct ?? (rw.total > 0 ? Math.round((rw.attempted / rw.total) * 100) : 0);
    const mathPct = mathOverview?.pct ?? (math.total > 0 ? Math.round((math.attempted / math.total) * 100) : 0);

    return (
      <div className="space-y-8 max-w-6xl">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center text-brand-slate">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold text-brand-navy">Question Bank</h1>
        </div>

        {countsError && <p className="text-sm text-brand-red">{countsError}</p>}

        <div className="grid md:grid-cols-2 gap-5">
          <button
            onClick={() => openSection("Reading and Writing")}
            className="relative rounded-2xl overflow-hidden text-left hover:opacity-90 transition-opacity"
          >
            <img src="/images/rwsqb.png" alt="Reading & Writing" className="w-full h-auto block" />
          </button>

          <button
            onClick={() => openSection("Math")}
            className="relative rounded-2xl overflow-hidden text-left hover:opacity-90 transition-opacity"
          >
            <img src="/images/mathsqb.png" alt="Math" className="w-full h-auto block" />
          </button>
        </div>

        <Link
          href="/practice/browse"
          className="card p-5 flex items-center justify-between gap-4 flex-wrap hover:shadow-card-hover transition-shadow"
        >
          <div>
            <p className="text-sm font-semibold text-brand-navy">Browse every question</p>
            <p className="text-xs text-brand-slate mt-0.5">
              Filter the whole bank by domain, skill and difficulty, see which ones you've solved, and practice any set
              in the real exam screen.
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

        <div className="sticky bottom-4 flex items-center gap-3 pt-2">
          <button onClick={handleFindQuestions} disabled={loadingDrill} className="btn-primary text-sm px-6 shadow-card-hover">
            {loadingDrill ? "Loading…" : "Find Questions"}
          </button>
          <span className="text-xs text-brand-slate bg-white px-2">
            {selectedSkills.size === 0 ? "No topics selected" : `${selectedSkills.size} selected`}
          </span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render: Summary                                                   */
  /* ---------------------------------------------------------------- */

  if (stage === "summary") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Celebration trigger={celebrateTrigger} />
        <div className="card p-6 text-center">
          <p className="text-xs text-brand-slate uppercase tracking-wide mb-1">{skillLabel}</p>
          <div className="text-4xl font-extrabold text-brand-blue">
            {correctCount}/{questions.length}
          </div>
          <div className="flex items-center justify-center gap-3 mt-5">
            <button onClick={backToSection} className="btn-secondary text-sm">
              Pick another topic
            </button>
            <button onClick={() => lastFilters && startDrill(lastFilters)} className="btn-primary text-sm">
              Drill again
            </button>
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-brand-navy">Review your mistakes</h2>
            {mistakes.map((m, i) => (
              <div key={m.question.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-xs font-semibold text-brand-slate">Mistake {i + 1}</span>
                  <button
                    onClick={() => askCoach("diagnose", m.question, m.selectedAnswer)}
                    className="btn-secondary text-xs px-3 py-1.5 shrink-0"
                  >
                    Ask Coach why
                  </button>
                </div>
                <p className="text-sm text-brand-navy mb-3">
                  <MathText text={m.question.questionText} />
                </p>
                <div className="space-y-1.5 mb-3">
                  {m.question.choices.map((c) => {
                    const isCorrectChoice = c.id === m.result.correctAnswer;
                    const isSelected = c.id === m.selectedAnswer;
                    return (
                      <div
                        key={c.id}
                        className={`text-sm px-3 py-2 rounded-lg border ${
                          isCorrectChoice
                            ? "border-brand-green bg-brand-green-light text-brand-navy"
                            : isSelected
                              ? "border-brand-red bg-brand-red-light text-brand-navy"
                              : "border-brand-border text-brand-slate"
                        }`}
                      >
                        {c.id}) <MathText text={c.text} mathOnly />
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-brand-slate">
                  <strong className="text-brand-navy">Explanation: </strong>
                  {m.result.explanation}
                </p>
              </div>
            ))}
          </div>
        )}

        <CoachDrawer open={coachOpen} loading={coachLoading} data={coachData} onClose={() => setCoachOpen(false)} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render: Drilling                                                   */
  /* ---------------------------------------------------------------- */

  if (loadingDrill || !current) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-pulse text-brand-slate text-sm">Loading drill…</div>
      </div>
    );
  }

  const timeStr = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top chrome — Go back / Directions, Timer + Pause, ABC handled per-
          question below, Calculator (Math), More */}
      <div className="flex items-center justify-between px-1 pb-3 border-b border-brand-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={backToSection} className="text-sm text-brand-slate hover:text-brand-navy shrink-0">
            ‹ Go back
          </button>
          <button
            onClick={() => setDirectionsOpen(true)}
            className="flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy shrink-0"
          >
            Directions <ChevronIcon collapsed={false} />
          </button>
          <span className="text-xs font-semibold text-brand-blue uppercase tracking-wide truncate">
            {skillLabel} · {current.difficulty}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold text-brand-navy tabular-nums">{timeStr}</span>
          <button
            onClick={() => setTimerPaused((v) => !v)}
            title={timerPaused ? "Resume timer" : "Pause timer — you can keep answering while paused"}
            className={`flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border ${
              timerPaused ? "border-brand-blue bg-brand-blue text-white" : "border-brand-border text-brand-navy hover:bg-slate-50"
            }`}
          >
            {timerPaused ? <ResumeIcon /> : <PauseIcon />}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isMath && (
            <button
              onClick={() => setCalcOpen((v) => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium border rounded-full px-3 py-1.5 ${
                calcOpen ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-navy hover:bg-slate-50"
              }`}
            >
              <CalculatorIcon />
              Calculator
            </button>
          )}
        </div>
      </div>

      {/* Question header — number, Mark for Review, ABC eliminator toggle */}
      <div className="flex items-center justify-between px-1 py-2.5 bg-slate-50 border-b border-brand-border shrink-0 mt-3 rounded-t-lg">
        <span className="w-7 h-7 ml-2 rounded bg-brand-navy text-white text-sm font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <button
          onClick={() => toggleMark(current.id)}
          className={`flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded ${
            marked[current.id] ? "text-brand-amber" : "text-brand-slate hover:text-brand-navy"
          }`}
        >
          <FlagIcon filled={!!marked[current.id]} />
          Mark for Review
        </button>
        <button
          onClick={() => setEliminatorMode((v) => !v)}
          title={eliminatorMode ? "Turn off Answer Eliminator" : "Turn on Answer Eliminator"}
          className={`mr-2 rounded-[6px] w-10 h-7 flex items-center justify-center border transition-colors ${
            eliminatorMode ? "bg-brand-navy border-brand-navy text-white" : "bg-white border-brand-border text-brand-navy hover:bg-slate-50"
          }`}
        >
          <EliminatorIcon />
        </button>
      </div>

      {current.passageText ? (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden rounded-b-lg border border-t-0 border-brand-border">
          <div className="md:w-[46%] overflow-y-auto px-5 py-5 border-b md:border-b-0 md:border-r border-brand-border bg-white">
            <div className="text-[15px] text-brand-navy leading-relaxed">
              <MathText text={current.passageText} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 bg-white">
            <QuestionBody
              current={current}
              result={currentResult}
              selected={answerValue}
              onSelect={(id) => selectAnswer(current.id, id)}
              sprValue={answerValue ?? ""}
              onSprChange={(v) => selectAnswer(current.id, v)}
              eliminatorMode={eliminatorMode}
              isCrossedOut={(choiceId) => isCrossedOut(current.id, choiceId)}
              onToggleCrossOut={(choiceId) => toggleCrossOut(current.id, choiceId)}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-b-lg border border-t-0 border-brand-border">
          <div className="max-w-2xl mx-auto bg-white p-6">
            <QuestionBody
              current={current}
              result={currentResult}
              selected={answerValue}
              onSelect={(id) => selectAnswer(current.id, id)}
              sprValue={answerValue ?? ""}
              onSprChange={(v) => selectAnswer(current.id, v)}
              eliminatorMode={eliminatorMode}
              isCrossedOut={(choiceId) => isCrossedOut(current.id, choiceId)}
              onToggleCrossOut={(choiceId) => toggleCrossOut(current.id, choiceId)}
            />
          </div>
        </div>
      )}

      <div className="border-t border-dashed border-brand-border pt-3 mt-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => askCoach("hint", current, answerValue)} className="btn-secondary text-xs px-3 py-1.5">
            Hint
          </button>
          <button
            onClick={() => askCoach(currentResult ? "explain" : "teach", current, answerValue)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {currentResult ? "Explain more" : "Teach me"}
          </button>
        </div>

        <button
          onClick={() => setNavigatorOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-4 py-1.5 hover:bg-slate-50"
        >
          <NavGridIcon />
          Question {index + 1} of {questions.length}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={previousQuestion}
            disabled={index === 0}
            className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {currentResult ? (
            <button onClick={nextQuestion} className="btn-primary text-sm">
              {index + 1 >= questions.length ? "Finish" : "Next"}
            </button>
          ) : (
            <button
              onClick={submitAnswer}
              disabled={grading || !answerValue}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {grading ? "Checking…" : "Submit"}
            </button>
          )}
        </div>
      </div>

      <CoachDrawer open={coachOpen} loading={coachLoading} data={coachData} onClose={() => setCoachOpen(false)} />

      {isMath && <DesmosCalculator open={calcOpen} onOpenChange={setCalcOpen} />}

      {/* Directions modal */}
      {directionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30" onClick={() => setDirectionsOpen(false)}>
          <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-brand-navy mb-2">Directions</h3>
            <p className="text-sm text-brand-slate leading-relaxed">
              This is untimed practice from BlueMind's Question Bank — answer at your own pace, check
              your work immediately after each question, and use Hint or Teach me any time. Mark
              questions for review to revisit them from the question navigator below.
            </p>
            <button onClick={() => setDirectionsOpen(false)} className="btn-primary text-sm w-full mt-4">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Question Bank navigator */}
      {navigatorOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setNavigatorOpen(false)}>
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-24 w-full max-w-xl px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card w-full p-5 shadow-card-hover">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-brand-navy">Question Bank</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGroupAnswered((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border ${
                      groupAnswered ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:bg-slate-50"
                    }`}
                  >
                    <NavGridIcon /> Group Answered
                  </button>
                  <button onClick={() => setNavigatorOpen(false)} className="text-brand-slate hover:text-brand-navy">
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4 text-xs text-brand-slate">
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-brand-green-light text-brand-green flex items-center justify-center">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  Correct
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-brand-red-light text-brand-red flex items-center justify-center">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </span>
                  Incorrect
                </span>
                <span className="flex items-center gap-1">
                  <FlagIcon filled /> For Review
                </span>
              </div>

              <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 max-h-64 overflow-y-auto">
                {questions
                  .map((q, i) => ({ q, i }))
                  .sort((a, b) => {
                    if (!groupAnswered) return a.i - b.i;
                    const aAnswered = !!results[a.q.id];
                    const bAnswered = !!results[b.q.id];
                    if (aAnswered === bAnswered) return a.i - b.i;
                    return aAnswered ? -1 : 1;
                  })
                  .map(({ q, i }) => {
                    const r = results[q.id];
                    const isFlagged = !!marked[q.id];
                    const isCurrent = i === index;
                    let colorClass = "border-brand-border text-brand-navy hover:bg-slate-50";
                    if (r) colorClass = r.isCorrect ? "border-brand-green bg-brand-green-light text-brand-green" : "border-brand-red bg-brand-red-light text-brand-red";
                    return (
                      <button
                        key={q.id}
                        onClick={() => goToQuestion(i)}
                        className={`relative w-9 h-9 rounded-lg border text-xs font-semibold flex items-center justify-center ${colorClass} ${
                          isCurrent ? "ring-2 ring-brand-navy ring-offset-1" : ""
                        }`}
                      >
                        {i + 1}
                        {isFlagged && (
                          <span className="absolute -top-1 -right-1 text-brand-amber">
                            <FlagIcon filled />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Question body                                                          */
/* ---------------------------------------------------------------------- */

function QuestionBody({
  current,
  result,
  selected,
  onSelect,
  sprValue,
  onSprChange,
  eliminatorMode,
  isCrossedOut,
  onToggleCrossOut,
}: {
  current: PracticeQuestion;
  result: GradeResult | null;
  selected: string | null;
  onSelect: (id: string) => void;
  sprValue: string;
  onSprChange: (v: string) => void;
  eliminatorMode: boolean;
  isCrossedOut: (choiceId: string) => boolean;
  onToggleCrossOut: (choiceId: string) => void;
}) {
  return (
    <>
      <p className="text-[15px] text-brand-navy leading-relaxed mb-5">
        <MathText text={current.questionText} />
      </p>

      {current.questionType === "spr" ? (
        <div className="max-w-xs mb-2">
          <label className="block text-xs font-semibold text-brand-slate mb-1.5">Answer</label>
          <input
            type="text"
            value={sprValue}
            onChange={(e) => onSprChange(e.target.value)}
            disabled={!!result}
            placeholder="Enter your answer"
            className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm disabled:bg-slate-50"
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {current.choices.map((c) => {
            const isSelected = selected === c.id;
            const showFeedback = !!result;
            const isCorrectChoice = showFeedback && c.id === result.correctAnswer;
            const isWrongSelected = showFeedback && isSelected && !result.isCorrect;
            const crossedOut = !showFeedback && isCrossedOut(c.id);
            return (
              <div key={c.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => !result && !crossedOut && onSelect(c.id)}
                  disabled={!!result || crossedOut}
                  className={`relative flex-1 flex items-center gap-3 text-left px-4 py-3 rounded-lg border transition-colors overflow-hidden ${
                    isCorrectChoice
                      ? "border-brand-green bg-brand-green-light"
                      : isWrongSelected
                        ? "border-brand-red bg-brand-red-light"
                        : isSelected
                          ? "border-brand-blue bg-brand-blue-light"
                          : crossedOut
                            ? "border-brand-border bg-slate-100 cursor-not-allowed"
                            : "border-brand-border hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold ${
                      isSelected || isCorrectChoice ? "bg-brand-blue border-brand-blue text-white" : "border-brand-navy text-brand-navy bg-white"
                    } ${isCorrectChoice ? "!bg-brand-green !border-brand-green" : ""} ${isWrongSelected ? "!bg-brand-red !border-brand-red" : ""} ${
                      crossedOut ? "!bg-white !border-brand-slate/50 !text-brand-slate" : ""
                    }`}
                  >
                    {c.id}
                  </span>
                  <span className={`text-sm leading-snug ${crossedOut ? "text-brand-slate" : "text-brand-navy"}`}>
                    <MathText text={c.text} mathOnly />
                  </span>
                  {crossedOut && (
                    <span className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-px bg-brand-slate/70 pointer-events-none" />
                  )}
                </button>
                {eliminatorMode &&
                  !result &&
                  (crossedOut ? (
                    <button
                      type="button"
                      onClick={() => onToggleCrossOut(c.id)}
                      title="Restore choice"
                      className="shrink-0 w-7 h-7 rounded-full border border-brand-blue text-brand-blue hover:bg-brand-blue-light flex items-center justify-center text-[13px] font-bold"
                    >
                      ↺
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleCrossOut(c.id)}
                      title="Cross out choice"
                      className="shrink-0 w-7 h-7 rounded-full border border-brand-border text-brand-slate hover:bg-slate-50 flex items-center justify-center text-[11px] font-semibold"
                    >
                      {c.id}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {result && (
        <div
          className={`mt-5 p-4 rounded-lg border ${
            result.isCorrect ? "border-brand-green bg-brand-green-light" : "border-brand-red bg-brand-red-light"
          }`}
        >
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-brand-navy">
            <CheckCircleIcon />
            {result.isCorrect ? "Correct!" : `Not quite — correct answer is ${result.correctAnswer}`}
          </div>
          <p className="text-sm text-brand-navy">{result.explanation}</p>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Coach drawer                                                           */
/* ---------------------------------------------------------------------- */

function CoachDrawer({
  open,
  loading,
  data,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  data: { mode: CoachMode; text: string } | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-brand-navy/20" onClick={onClose} />
      <div className="w-full max-w-sm h-full bg-white border-l border-brand-border shadow-card-hover flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-brand-border shrink-0">
          <span className="text-sm font-semibold text-brand-navy">BlueMind Coach</span>
          <button onClick={onClose} className="text-brand-slate hover:text-brand-navy">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="text-sm text-brand-slate">BlueMind Coach is thinking…</div>
          ) : data ? (
            <div className="bg-brand-blue-light rounded-lg p-3">
              <CoachSlideshow text={data.text} />
            </div>
          ) : (
            <p className="text-sm text-brand-slate">Ask for a hint, an explanation, or a full teach-through.</p>
          )}
        </div>
        <div className="px-4 pb-4">
          <Link href="/coach" className="text-xs text-brand-blue hover:underline">
            Open full Coach chat →
          </Link>
        </div>
      </div>
    </div>
  );
}
