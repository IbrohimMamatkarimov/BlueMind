"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, Check, Flame, Layers3, RotateCcw, Save, Target, X } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";

interface TodayPayload {
  today: { questions: number; correct: number; accuracy: number | null; sessions: number; vocabularyReviews: number; reflections: number };
  plan: { mistakesDue: number; vocabularyDue: number; wordsToDefine: number; weakSkill: { section: string; skill: string; attempted: number; accuracy: number } | null };
  streak: { current: number; best: number; activeToday: boolean };
  weekly: { questions: number; accuracy: number | null; sessions: number; vocabularyAdded: number; vocabularyReviews: number; reflections: number; reflectedMistakes: number };
}

interface Goals { questions: number; mistakes: number; vocabulary: number }
const DEFAULT_GOALS: Goals = { questions: 10, mistakes: 3, vocabulary: 5 };
const GOALS_KEY = "bluemind-daily-goals-v1";

function PlanItem({ icon, title, detail, progress, goal, href, action }: { icon: React.ReactNode; title: string; detail: string; progress: number; goal: number; href: string; action: string }) {
  const complete = progress >= goal;
  const percent = Math.min(100, goal ? Math.round(progress / goal * 100) : 100);
  return <article className="card p-5 sm:p-6">
    <div className="flex items-start gap-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${complete ? "bg-brand-green-light text-brand-green" : "bg-brand-blue-light text-brand-blue"}`}>{complete ? <Check size={19}/> : icon}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-brand-navy">{title}</h2><p className="mt-1 text-xs leading-5 text-brand-slate">{detail}</p></div><span className="shrink-0 text-xs font-semibold tabular-nums text-brand-slate">{Math.min(progress, goal)}/{goal}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${complete ? "bg-brand-green" : "bg-brand-blue"}`} style={{ width: `${percent}%` }}/></div><Link href={href} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue">{complete ? "Keep going" : action}<ArrowRight size={13}/></Link></div></div>
  </article>;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [draftGoals, setDraftGoals] = useState<Goals>(DEFAULT_GOALS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(GOALS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Goals;
        const next = { questions: Math.max(1, parsed.questions), mistakes: Math.max(1, parsed.mistakes), vocabulary: Math.max(1, parsed.vocabulary) };
        setGoals(next); setDraftGoals(next);
      }
    } catch { window.localStorage.removeItem(GOALS_KEY); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/today", { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load your plan.");
      setData(body);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load your plan."); });
    return () => controller.abort();
  }, [reload]);

  const completedGoals = useMemo(() => data ? [data.today.questions >= goals.questions, data.today.reflections >= goals.mistakes, data.today.vocabularyReviews >= goals.vocabulary].filter(Boolean).length : 0, [data, goals]);
  function saveGoals() {
    const next = { questions: Math.max(1, Math.min(100, draftGoals.questions)), mistakes: Math.max(1, Math.min(25, draftGoals.mistakes)), vocabulary: Math.max(1, Math.min(100, draftGoals.vocabulary)) };
    setGoals(next); setDraftGoals(next); window.localStorage.setItem(GOALS_KEY, JSON.stringify(next)); setEditingGoals(false);
  }
  const practiceHref = data?.plan.weakSkill ? `/practice/browse?section=${encodeURIComponent(data.plan.weakSkill.section)}&skill=${encodeURIComponent(data.plan.weakSkill.skill)}` : "/practice";

  return <div className="max-w-6xl space-y-6">
    <PageHeader eyebrow="Your personalized study plan" title="Today" description="A focused plan built from your recent practice, due reviews, and unfinished learning." action={<button onClick={() => { setDraftGoals(goals); setEditingGoals(true); }} className="btn-secondary"><Target size={16}/> Edit daily goals</button>}/>
    {error && <div role="alert" className="card flex items-center justify-between gap-4 p-5 text-sm text-brand-red"><p>{error}</p><button onClick={() => setReload((value) => value + 1)} className="btn-secondary">Try again</button></div>}
    {!data && !error && <div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-200"/>)}</div>}
    {data && <>
      <section className="card overflow-hidden bg-brand-navy p-6 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Daily momentum</p><h2 className="mt-2 text-2xl font-bold">{completedGoals === 3 ? "Today’s plan is complete" : `${3 - completedGoals} goal${3 - completedGoals === 1 ? "" : "s"} left today`}</h2><p className="mt-2 text-sm text-white/70">{data.streak.activeToday ? "You kept your learning streak alive today." : "One focused activity will keep your streak moving."}</p></div><div className="flex items-center gap-3 rounded-2xl bg-white/10 px-5 py-4"><Flame size={27} className="text-amber-300"/><div><p className="text-2xl font-bold tabular-nums">{data.streak.current}</p><p className="text-xs text-white/70">day streak · best {data.streak.best}</p></div></div></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlanItem icon={<BookOpenCheck size={19}/>} title={data.plan.weakSkill ? `Practice ${data.plan.weakSkill.skill}` : "Practice questions"} detail={data.plan.weakSkill ? `Your current focus area is at ${data.plan.weakSkill.accuracy}% accuracy.` : "Build enough history for a personalized skill recommendation."} progress={data.today.questions} goal={goals.questions} href={practiceHref} action="Start focused practice"/>
        <PlanItem icon={<RotateCcw size={19}/>} title="Reflect on mistakes" detail={data.plan.mistakesDue ? `${data.plan.mistakesDue} questions still need another look.` : "Your latest missed questions have been resolved."} progress={data.today.reflections} goal={goals.mistakes} href="/mistakes" action="Open Mistakes Notebook"/>
        <PlanItem icon={<Layers3 size={19}/>} title="Review vocabulary" detail={data.plan.vocabularyDue ? `${data.plan.vocabularyDue} flashcards are due now.` : data.plan.wordsToDefine ? `${data.plan.wordsToDefine} saved words still need definitions.` : "Your vocabulary queue is caught up."} progress={data.today.vocabularyReviews} goal={goals.vocabulary} href="/vocabulary" action="Review due cards"/>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Questions today" value={data.today.questions} detail={data.today.accuracy == null ? "Complete a practice set to begin" : `${data.today.accuracy}% accuracy`}/><StatCard label="Sessions today" value={data.today.sessions} detail="Completed practice sessions"/><StatCard label="Mistake reflections" value={data.today.reflections} detail={`${data.plan.mistakesDue} unresolved questions`}/><StatCard label="Vocabulary reviews" value={data.today.vocabularyReviews} detail={`${data.plan.vocabularyDue} cards currently due`}/></div>

      <section className="card p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="eyebrow">Last 7 days</p><h2 className="text-xl font-bold text-brand-navy">Your weekly snapshot</h2><p className="mt-2 text-sm text-brand-slate">A compact view of practice and active review.</p></div><Link href="/progress" className="btn-secondary text-xs">Full progress report <ArrowRight size={14}/></Link></div><div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5"><div><p className="text-2xl font-bold text-brand-navy">{data.weekly.questions}</p><p className="text-xs text-brand-slate">questions</p></div><div><p className="text-2xl font-bold text-brand-navy">{data.weekly.accuracy == null ? "—" : `${data.weekly.accuracy}%`}</p><p className="text-xs text-brand-slate">accuracy</p></div><div><p className="text-2xl font-bold text-brand-navy">{data.weekly.sessions}</p><p className="text-xs text-brand-slate">sessions</p></div><div><p className="text-2xl font-bold text-brand-navy">{data.weekly.vocabularyAdded}</p><p className="text-xs text-brand-slate">words added</p></div><div><p className="text-2xl font-bold text-brand-navy">{data.weekly.reflections}</p><p className="text-xs text-brand-slate">reflections</p></div></div></section>
    </>}

    {editingGoals && <div role="dialog" aria-modal="true" aria-labelledby="goals-title" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/30 px-4"><div className="card w-full max-w-md p-6"><div className="flex items-start justify-between"><div><h2 id="goals-title" className="text-lg font-bold text-brand-navy">Daily goals</h2><p className="mt-1 text-xs text-brand-slate">Choose a realistic pace you can repeat.</p></div><button onClick={() => setEditingGoals(false)} aria-label="Close daily goals" className="rounded-lg p-1 text-brand-slate"><X size={18}/></button></div><div className="mt-5 space-y-4">{([['questions','Practice questions'],['mistakes','Mistake reflections'],['vocabulary','Vocabulary reviews']] as [keyof Goals,string][]).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-4"><span className="text-sm font-semibold text-brand-navy">{label}</span><input type="number" min={1} max={key === "mistakes" ? 25 : 100} value={draftGoals[key]} onChange={(event) => setDraftGoals((current) => ({ ...current, [key]: Number(event.target.value) || 1 }))} className="w-24 rounded-lg border border-brand-border px-3 py-2 text-sm"/></label>)}</div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setEditingGoals(false)} className="btn-secondary text-xs">Cancel</button><button onClick={saveGoals} className="btn-primary text-xs"><Save size={14}/> Save goals</button></div></div></div>}
  </div>;
}
