"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { MathText } from "@/components/MathText";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

type Section = "Reading and Writing" | "Math";
type Status = "all" | "needs_review" | "improved";
interface Mistake { questionId: string; externalId: string | null; section: Section; domain: string; skill: string; difficulty: string; questionText: string; mistakeCount: number; attemptCount: number; latestCorrect: boolean; lastAttemptAt: string; selectedAnswer: string | null; correctAnswer: string; source: string }
interface Skill { skill: string; domain: string; attempted: number; correct: number; mistakes: number; accuracyPct: number }
interface Payload { mistakes: Mistake[]; skills: Skill[]; summary: { total: number; needsReview: number; improved: number; repeated: number } }

function difficultyClass(value: string) { return value === "Easy" ? "bg-brand-green-light text-brand-green" : value === "Medium" ? "bg-brand-amber-light text-brand-amber" : "bg-brand-red-light text-brand-red"; }

export default function MistakesNotebookPage() {
  const [section, setSection] = useState<Section>("Reading and Writing");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState<Status>("needs_review");
  const [skill, setSkill] = useState("All skills");
  const [difficulty, setDifficulty] = useState("All difficulties");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPayload(null); setError(""); setSelected(new Set()); setSkill("All skills");
    fetch(`/api/mistakes?section=${encodeURIComponent(section)}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load your notebook."); return data; })
      .then(setPayload)
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your notebook."); });
    return () => controller.abort();
  }, [section]);

  const skills = useMemo(() => Array.from(new Set((payload?.mistakes ?? []).map((item) => item.skill))).sort(), [payload]);
  const visible = useMemo(() => (payload?.mistakes ?? []).filter((item) =>
    (status === "all" || (status === "improved" ? item.latestCorrect : !item.latestCorrect)) &&
    (skill === "All skills" || item.skill === skill) && (difficulty === "All difficulties" || item.difficulty === difficulty)
  ), [payload, status, skill, difficulty]);

  function toggle(id: string) { setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  async function practice(ids: string[]) {
    if (!ids.length) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/mistakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, questionIds: ids }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not start this review.");
      window.location.href = data.href;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start this review."); setStarting(false); }
  }

  return <div className="space-y-6 max-w-6xl">
    <PageHeader eyebrow="Turn misses into mastery" title="Mistakes Notebook" description="Every question you miss stays here, so you can understand the pattern, try it again, and see your improvement." />
    <div className="flex gap-1 p-1 bg-white border border-brand-border rounded-xl w-fit">{(["Reading and Writing", "Math"] as Section[]).map((item) => <button key={item} onClick={() => setSection(item)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${section === item ? "bg-brand-navy text-white" : "text-brand-slate"}`}>{item === "Reading and Writing" ? "Reading & Writing" : item}</button>)}</div>
    {error && <p role="alert" className="card p-4 text-sm text-brand-red">{error}</p>}
    {!payload && !error && <div className="grid sm:grid-cols-4 gap-4">{[1,2,3,4].map((key) => <div key={key} className="h-28 bg-slate-200 rounded-2xl animate-pulse" />)}</div>}
    {payload && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Notebook questions" value={payload.summary.total} detail="Questions missed at least once" /><StatCard label="Needs review" value={payload.summary.needsReview} detail="Latest attempt was incorrect" /><StatCard label="Improved" value={payload.summary.improved} detail="Correct on the latest attempt" /><StatCard label="Repeated mistakes" value={payload.summary.repeated} detail="Missed more than once" /></div>
      {payload.skills.length > 0 && <section className="card p-5 sm:p-6"><h2 className="font-bold text-brand-navy">Weakest areas</h2><p className="text-xs text-brand-slate mt-1 mb-5">Accuracy across mock tests and Question Bank practice.</p><div className="grid md:grid-cols-2 gap-x-8 gap-y-5">{payload.skills.slice(0, 8).map((item) => <button key={item.domain + item.skill} onClick={() => setSkill(item.skill)} className="text-left group"><div className="flex justify-between gap-3 mb-2"><span className="text-sm font-medium text-brand-navy group-hover:text-brand-blue">{item.skill}</span><span className="text-xs text-brand-slate">{item.accuracyPct}% · {item.mistakes} mistakes</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.accuracyPct < 50 ? "bg-brand-red" : item.accuracyPct < 70 ? "bg-brand-amber" : "bg-brand-green"}`} style={{ width: `${item.accuracyPct}%` }} /></div></button>)}</div></section>}
      {payload.mistakes.length === 0 ? <EmptyState title="No mistakes here yet" description="When you miss a question in a mock or the Question Bank, it will appear here automatically."><BookOpenCheck size={28} /></EmptyState> : <section className="card overflow-hidden">
        <div className="p-5 border-b border-brand-border flex flex-wrap items-center gap-3"><div className="flex gap-1 p-1 bg-slate-50 rounded-lg">{([['needs_review','Needs review'],['improved','Improved'],['all','All']] as [Status,string][]).map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${status === value ? "bg-white text-brand-blue shadow-sm" : "text-brand-slate"}`}>{label}</button>)}</div><select value={skill} onChange={(event) => setSkill(event.target.value)} className="border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-navy"><option>All skills</option>{skills.map((item) => <option key={item}>{item}</option>)}</select><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-navy">{["All difficulties","Easy","Medium","Hard"].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => practice(visible.filter((item) => !item.latestCorrect).map((item) => item.questionId))} disabled={starting || visible.every((item) => item.latestCorrect)} className="btn-primary text-sm ml-auto disabled:opacity-50"><RotateCcw size={15} /> Review visible mistakes</button></div>
        <div className="divide-y divide-brand-border">{visible.map((item) => <div key={item.questionId} className="p-5 flex gap-4"><input type="checkbox" aria-label="Select question" checked={selected.has(item.questionId)} onChange={() => toggle(item.questionId)} className="mt-1 w-4 h-4 accent-brand-blue" /><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2 mb-2"><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${item.latestCorrect ? "bg-brand-green-light text-brand-green" : "bg-brand-red-light text-brand-red"}`}>{item.latestCorrect ? <span className="flex items-center gap-1"><CheckCircle2 size={12}/> Improved</span> : <span className="flex items-center gap-1"><TriangleAlert size={12}/> Needs review</span>}</span><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${difficultyClass(item.difficulty)}`}>{item.difficulty}</span><span className="text-xs text-brand-slate">{item.domain} · {item.skill} · {item.source}</span></div><div className="text-sm text-brand-navy line-clamp-2"><MathText text={item.questionText} /></div><p className="text-xs text-brand-slate mt-2">Missed {item.mistakeCount} time{item.mistakeCount === 1 ? "" : "s"} · {item.attemptCount} total attempt{item.attemptCount === 1 ? "" : "s"} · Last tried {new Date(item.lastAttemptAt).toLocaleDateString()}</p></div><button onClick={() => practice([item.questionId])} disabled={starting} className="btn-secondary text-xs self-center shrink-0">Solve again</button></div>)}</div>
        {visible.length === 0 && <p className="p-10 text-center text-sm text-brand-slate">No questions match these filters.</p>}
      </section>}
    </>}
    {selected.size > 0 && <div className="action-bar"><p className="font-semibold text-brand-navy">{selected.size} selected</p><div className="flex gap-2"><button onClick={() => setSelected(new Set())} className="btn-secondary">Clear</button><button onClick={() => practice(Array.from(selected))} disabled={starting} className="btn-primary">Practice selected</button></div></div>}
  </div>;
}
