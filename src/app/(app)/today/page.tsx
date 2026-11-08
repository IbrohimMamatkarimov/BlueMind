"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, Check, Layers3, RotateCcw, Save, Target, X, Clock, ArrowUpRight } from "lucide-react";
import { SatCountdown } from "@/components/SatCountdown";
import { RobotMascot } from "@/components/RobotMascot";
interface TodayPayload {
  today: { questions: number; correct: number; accuracy: number | null; sessions: number; vocabularyReviews: number; reflections: number };
  plan: { mistakesDue: number; vocabularyDue: number; wordsToDefine: number; weakSkill: { section: string; skill: string; attempted: number; accuracy: number } | null };
  streak: { current: number; best: number; activeToday: boolean };
  weekly: { questions: number; accuracy: number | null; sessions: number; vocabularyAdded: number; vocabularyReviews: number; reflections: number; reflectedMistakes: number };
}

interface Goals { questions: number; mistakes: number; vocabulary: number }
const DEFAULT_GOALS: Goals = { questions: 10, mistakes: 3, vocabulary: 5 };
const GOALS_KEY = "bluemind-daily-goals-v1";


function TaskRow({ icon, title, detail, value, goal, href, tone }: { icon: React.ReactNode; title:string; detail:string; value:number; goal:number; href:string; tone:string }) {
  const complete=value>=goal;
  const percentage=Math.min(100,Math.round(value/goal*100));
  return <Link href={href} className="study-task" data-tone={tone}>
    <span className="study-task__icon">{complete?<Check size={20}/>:icon}</span>
    <span className="study-task__body"><strong>{title}</strong><span>{detail}</span><span className="study-task__track"><span style={{width:percentage+"%"}}/></span></span>
    <span className="study-task__count"><b>{Math.min(value,goal)}<small>/{goal}</small></b><span>{complete?"Complete":"Continue"} <ArrowRight size={12}/></span></span>
  </Link>;
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
        const safe = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(1, value) : fallback;
        const next = { questions: safe(parsed.questions,10), mistakes: safe(parsed.mistakes,3), vocabulary: safe(parsed.vocabulary,5) };
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


  const overall = data ? Math.round((Math.min(data.today.questions/goals.questions,1)+Math.min(data.today.reflections/goals.mistakes,1)+Math.min(data.today.vocabularyReviews/goals.vocabulary,1))/3*100) : 0;
  return <div className="study-home">
    <header className="study-page-title"><div><p>YOUR STUDY DESK</p><h1>Your next step.</h1><span>Practice. Review. Improve.</span></div><button type="button" onClick={()=>{setDraftGoals(goals);setEditingGoals(true);}} className="study-outline"><Target size={15}/> Daily targets</button></header>
    {error && <div role="alert" className="card p-5 text-sm text-brand-red">{error}<button type="button" className="btn-secondary ml-3" onClick={()=>setReload(value=>value+1)}>Try again</button></div>}
    {!data&&!error&&<div className="study-loading" role="status">Preparing your study desk…<div/><div/></div>}
    {data&&<>
      <div className="study-top-grid">
        <section className="study-focus">

          <h2>{completedGoals===3?"Today’s targets, complete.":data.plan.weakSkill?"Turn a weak spot into progress.":"Ready for your next win?"}</h2>
          <p>{data.plan.weakSkill?`Focus on ${data.plan.weakSkill.skill}. Your recorded accuracy is ${data.plan.weakSkill.accuracy}%.`:"Pick a skill. Give it your focus."}</p>
          <div className="study-focus__actions"><Link href={practiceHref} className="study-primary">Start practice <ArrowRight size={16}/></Link><Link href="/mocks" className="study-focus__secondary">Mock tests <ArrowUpRight size={15}/></Link></div>
          <SatCountdown/>
        </section>
        <section className="study-targets"><div className="study-section-label"><span>TODAY’S MOMENTUM</span><span>{completedGoals}/3 targets</span></div>
          <div className="study-targets__center"><div className="study-progress-ring" style={{background:`conic-gradient(#96758c ${overall}%, var(--study-track) 0)`}}><span><strong>{overall}<small>%</small></strong><small>daily progress</small></span></div><RobotMascot className="study-desk-robot" mood={completedGoals===3?"happy":"idle"}/></div>
          <p>{completedGoals===3?"All targets complete. Keep the habit going.":`${3-completedGoals} targets left. Every small step counts.`}</p>
          <button type="button" onClick={()=>{setDraftGoals(goals);setEditingGoals(true);}}>Adjust your targets <ArrowRight size={12}/></button>
        </section>
      </div>
      <div className="study-work-grid">
        <section className="study-panel"><header className="study-panel__heading"><div><p>YOUR ROUTINE</p><h2>Your daily plan</h2></div><span className="study-count-pill">{completedGoals} done</span></header>
          <TaskRow icon={<BookOpenCheck size={20}/>} title="Practice questions" detail={data.plan.weakSkill?`Recommended: ${data.plan.weakSkill.skill}`:"Build accuracy with a focused question set."} value={data.today.questions} goal={goals.questions} href={practiceHref} tone="blue"/>
          <TaskRow icon={<RotateCcw size={20}/>} title="Review your mistakes" detail={data.plan.mistakesDue?`${data.plan.mistakesDue} questions need another look.`:"Turn missed questions into lessons you remember."} value={data.today.reflections} goal={goals.mistakes} href="/notebook" tone="mint"/>
          <TaskRow icon={<Layers3 size={20}/>} title="Keep words in memory" detail={data.plan.vocabularyDue?`${data.plan.vocabularyDue} vocabulary cards due.`:data.plan.wordsToDefine?`${data.plan.wordsToDefine} saved words need definitions.`:"Capture useful words and revisit them regularly."} value={data.today.vocabularyReviews} goal={goals.vocabulary} href="/vocabulary" tone="violet"/>
        </section>
        <aside className="study-panel study-week"><header className="study-panel__heading"><div><p>LAST SEVEN DAYS</p><h2>This week</h2></div><Link href="/progress" aria-label="Open progress report"><ArrowUpRight size={18}/></Link></header>
          <div className="study-week__main"><strong>{data.weekly.questions}</strong><span>questions practiced</span><div><span>{data.weekly.accuracy==null?"No accuracy data yet":data.weekly.accuracy+"% accuracy"}</span><span>{data.weekly.sessions} sessions</span></div></div>
          <div className="study-week__rows"><span>Words added <b>{data.weekly.vocabularyAdded}</b></span><span>Vocabulary reviews <b>{data.weekly.vocabularyReviews}</b></span><span>Mistake reflections <b>{data.weekly.reflections}</b></span><span>Personal best streak <b>{data.streak.best} days</b></span></div>
          <Link href="/progress" className="study-report-link">Explore your progress <ArrowRight size={14}/></Link>
        </aside>
      </div>
      <nav className="study-shortcuts" aria-label="Study shortcuts"><Link href="/mocks"><BookOpenCheck size={17}/><span><strong>Mock library</strong><small>Practice in an exam setting</small></span><ArrowUpRight size={15}/></Link><Link href="/practice"><Target size={17}/><span><strong>Question bank</strong><small>Find the skill you want to improve</small></span><ArrowUpRight size={15}/></Link><Link href="/notebook"><RotateCcw size={17}/><span><strong>Your notebook</strong><small>Make every mistake useful</small></span><ArrowUpRight size={15}/></Link></nav>
    </>}
    {editingGoals && <div role="dialog" aria-modal="true" aria-labelledby="goals-title" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/30 px-4"><div className="card w-full max-w-md p-6"><div className="flex items-start justify-between"><div><h2 id="goals-title" className="text-lg font-bold text-brand-navy">Daily goals</h2><p className="mt-1 text-xs text-brand-slate">Choose a realistic pace you can repeat.</p></div><button onClick={() => setEditingGoals(false)} aria-label="Close daily goals" className="rounded-lg p-1 text-brand-slate"><X size={18}/></button></div><div className="mt-5 space-y-4">{([['questions','Practice questions'],['mistakes','Mistake reflections'],['vocabulary','Vocabulary reviews']] as [keyof Goals,string][]).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-4"><span className="text-sm font-semibold text-brand-navy">{label}</span><input type="number" min={1} max={key === "mistakes" ? 25 : 100} value={draftGoals[key]} onChange={(event) => setDraftGoals((current) => ({ ...current, [key]: Number(event.target.value) || 1 }))} className="w-24 rounded-lg border border-brand-border px-3 py-2 text-sm"/></label>)}</div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setEditingGoals(false)} className="btn-secondary text-xs">Cancel</button><button onClick={saveGoals} className="btn-primary text-xs"><Save size={14}/> Save goals</button></div></div></div>}

  </div>;
}
