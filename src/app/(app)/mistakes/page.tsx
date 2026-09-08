"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Clock3, Pencil, RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { MathText } from "@/components/MathText";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

type Section = "Reading and Writing" | "Math";
type Status = "all" | "needs_review" | "improved";
type MistakeCategory = "unclassified" | "concept_gap" | "careless_error" | "misread_question" | "timing_issue" | "strategy_issue";
interface JournalEntry { reason: string; warning: string; category: MistakeCategory; updatedAt: string }
interface Mistake { questionId: string; externalId: string | null; section: Section; domain: string; skill: string; difficulty: string; questionText: string; mistakeCount: number; attemptCount: number; latestCorrect: boolean; lastAttemptAt: string; selectedAnswer: string | null; correctAnswer: string; source: string; lastTimeSpentSeconds: number | null; journal: JournalEntry | null }
interface Skill { skill: string; domain: string; attempted: number; correct: number; mistakes: number; accuracyPct: number }
interface DifficultyStat { difficulty: "Easy" | "Medium" | "Hard"; attempted: number; correct: number; accuracyPct: number | null; averageTimeSeconds: number | null; timedAttempts: number }
interface PacingStat { skill: string; averageTimeSeconds: number; timedAttempts: number }
interface Payload { mistakes: Mistake[]; skills: Skill[]; difficultyStats: DifficultyStat[]; pacingBySkill: PacingStat[]; summary: { total: number; needsReview: number; improved: number; repeated: number; averageTimeSeconds: number | null; timedAttempts: number } }

function difficultyClass(value: string) { return value === "Easy" ? "bg-brand-green-light text-brand-green" : value === "Medium" ? "bg-brand-amber-light text-brand-amber" : "bg-brand-red-light text-brand-red"; }
const CATEGORY_LABELS: Record<MistakeCategory, string> = { unclassified: "Not classified", concept_gap: "Concept gap", careless_error: "Careless error", misread_question: "Misread question", timing_issue: "Timing issue", strategy_issue: "Strategy issue" };
function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`; }

function DifficultyAnalytics({ payload, section }: { payload: Payload; section: Section }) {
  const maxTime = Math.max(1, ...payload.difficultyStats.map((item) => item.averageTimeSeconds ?? 0));
  const pacing = payload.pacingBySkill.slice(0, 6);
  const maxSkillTime = Math.max(1, ...pacing.map((item) => item.averageTimeSeconds));
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-brand-navy">Performance by difficulty</h2><p className="mt-1 text-xs text-brand-slate">Accuracy and average active time for {section === "Reading and Writing" ? "Reading & Writing" : section}.</p></div><span className="rounded-lg bg-brand-blue-light p-2 text-brand-blue"><Clock3 size={18}/></span></div>
      <div className="mt-6 space-y-6">{payload.difficultyStats.map((item) => <div key={item.difficulty}>
        <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-brand-navy">{item.difficulty}</span><span className="text-xs text-brand-slate">{item.attempted ? `${item.accuracyPct}% · ${item.correct}/${item.attempted} correct` : "No attempts yet"}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.difficulty === "Easy" ? "bg-brand-green" : item.difficulty === "Medium" ? "bg-brand-amber" : "bg-brand-red"}`} style={{ width: `${item.accuracyPct ?? 0}%` }}/></div>
        <div className="mt-2 flex items-center gap-3"><span className="w-24 shrink-0 text-[11px] text-brand-slate">Avg. time</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-blue" style={{ width: `${item.averageTimeSeconds == null ? 0 : Math.max(5, item.averageTimeSeconds / maxTime * 100)}%` }}/></div><span className="w-14 text-right text-xs font-medium tabular-nums text-brand-navy">{item.averageTimeSeconds == null ? "—" : formatDuration(item.averageTimeSeconds)}</span></div>
      </div>)}</div>
    </section>
    <section className="card p-5 sm:p-6">
      <h2 className="font-bold text-brand-navy">Time by question type</h2><p className="mt-1 text-xs text-brand-slate">Average active time for each skill. Pauses and time away from the tab are excluded.</p>
      {pacing.length ? <div className="mt-6 space-y-5">{pacing.map((item) => <div key={item.skill}><div className="mb-2 flex justify-between gap-3"><span className="truncate text-sm font-medium text-brand-navy">{item.skill}</span><span className="shrink-0 text-xs tabular-nums text-brand-slate">{formatDuration(item.averageTimeSeconds)} · {item.timedAttempts} question{item.timedAttempts === 1 ? "" : "s"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(5, item.averageTimeSeconds / maxSkillTime * 100)}%` }}/></div></div>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-brand-border px-5 py-8 text-center"><p className="text-sm font-semibold text-brand-navy">No timing data yet</p><p className="mt-1 text-xs text-brand-slate">Your next completed practice session will start this chart.</p></div>}
    </section>
  </div>;
}

function MistakeItem({ item, checked, starting, onToggle, onPractice, onJournalSaved }: {
  item: Mistake;
  checked: boolean;
  starting: boolean;
  onToggle: () => void;
  onPractice: () => void;
  onJournalSaved: (journal: JournalEntry | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(item.journal?.reason ?? "");
  const [warning, setWarning] = useState(item.journal?.warning ?? "");
  const [category, setCategory] = useState<MistakeCategory>(item.journal?.category ?? "unclassified");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hasJournal = Boolean(item.journal?.reason || item.journal?.warning || (item.journal?.category && item.journal.category !== "unclassified"));
  const changed = reason.trim() !== (item.journal?.reason ?? "") || warning.trim() !== (item.journal?.warning ?? "") || category !== (item.journal?.category ?? "unclassified");

  function cancelEditing() {
    setReason(item.journal?.reason ?? "");
    setWarning(item.journal?.warning ?? "");
    setCategory(item.journal?.category ?? "unclassified");
    setSaveError("");
    setEditing(false);
  }

  async function saveJournal() {
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/mistakes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: item.section, questionId: item.questionId, reason, warning, category }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save your reflection.");
      onJournalSaved(data.journal);
      setReason(data.journal?.reason ?? "");
      setWarning(data.journal?.warning ?? "");
      setCategory(data.journal?.category ?? "unclassified");
      setEditing(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save your reflection.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="p-5">
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex min-w-0 flex-1 gap-4">
        <input type="checkbox" aria-label="Select question" checked={checked} onChange={onToggle} className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${item.latestCorrect ? "bg-brand-green-light text-brand-green" : "bg-brand-red-light text-brand-red"}`}>{item.latestCorrect ? <span className="flex items-center gap-1"><CheckCircle2 size={12}/> Improved</span> : <span className="flex items-center gap-1"><TriangleAlert size={12}/> Needs review</span>}</span>
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${difficultyClass(item.difficulty)}`}>{item.difficulty}</span>
            {item.journal?.category && item.journal.category !== "unclassified" && <span className="rounded-full bg-brand-blue-light px-2 py-0.5 text-[11px] font-semibold text-brand-blue">{CATEGORY_LABELS[item.journal.category]}</span>}
            <span className="text-xs text-brand-slate">{item.domain} · {item.skill} · {item.source}</span>
          </div>
          <div className="text-sm text-brand-navy line-clamp-2"><MathText text={item.questionText} /></div>
          <p className="text-xs text-brand-slate mt-2">Missed {item.mistakeCount} time{item.mistakeCount === 1 ? "" : "s"} · {item.attemptCount} total attempt{item.attemptCount === 1 ? "" : "s"} · Last tried {new Date(item.lastAttemptAt).toLocaleDateString()}{item.lastTimeSpentSeconds != null ? ` · ${formatDuration(item.lastTimeSpentSeconds)} spent` : ""}</p>
        </div>
      </div>
      <button onClick={onPractice} disabled={starting} className="btn-secondary text-xs self-start shrink-0 sm:self-center">Solve again</button>
    </div>

    <div className="ml-0 mt-4 sm:ml-8">
      {editing ? <div className="rounded-xl border border-brand-border bg-slate-50 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-brand-navy">My mistake reflection</h3><p className="mt-1 text-xs text-brand-slate">Capture the cause and the rule you want to remember.</p></div>
          <button onClick={cancelEditing} aria-label="Close reflection editor" className="rounded-md p-1 text-brand-slate hover:bg-slate-100"><X size={17}/></button>
        </div>
        <label className="mb-4 block max-w-xs"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Mistake type</span><select value={category} onChange={(event) => setCategory(event.target.value as MistakeCategory)} className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Why I missed it</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} placeholder="Example: I rushed and confused a comma splice with a valid compound sentence." className="w-full resize-y rounded-lg border border-brand-border px-3 py-2 text-sm leading-6"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{reason.length}/1000</span></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Remember next time</span><textarea value={warning} onChange={(event) => setWarning(event.target.value)} maxLength={1000} rows={4} placeholder="Example: Stop and check whether both sides can stand alone before choosing punctuation." className="w-full resize-y rounded-lg border border-brand-border px-3 py-2 text-sm leading-6"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{warning.length}/1000</span></label>
        </div>
        {saveError && <p role="alert" className="mt-3 text-xs text-brand-red">{saveError}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2"><button onClick={cancelEditing} disabled={saving} className="btn-secondary text-xs">Cancel</button><button onClick={saveJournal} disabled={saving || !changed} className="btn-primary text-xs"><Save size={14}/>{saving ? "Saving…" : "Save reflection"}</button></div>
      </div> : hasJournal ? <div className="rounded-xl border border-brand-border bg-slate-50 p-4">
        {item.journal?.category && item.journal.category !== "unclassified" && <p className="mb-3 text-xs font-semibold text-brand-blue">{CATEGORY_LABELS[item.journal.category]}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Why I missed it</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-brand-navy">{item.journal?.reason || "Not added yet"}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Remember next time</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-brand-navy">{item.journal?.warning || "Not added yet"}</p></div>
        </div>
        <button onClick={() => setEditing(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue"><Pencil size={13}/> Edit reflection</button>
      </div> : <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-border px-3 py-2 text-xs font-semibold text-brand-blue hover:bg-slate-50"><Pencil size={14}/> Add mistake reflection</button>}
    </div>
  </article>;
}

export default function MistakesNotebookPage() {
  const [section, setSection] = useState<Section>("Reading and Writing");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState<Status>("needs_review");
  const [skill, setSkill] = useState("All skills");
  const [difficulty, setDifficulty] = useState("All difficulties");
  const [category, setCategory] = useState<"All mistake types" | MistakeCategory>("All mistake types");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPayload(null); setError(""); setSelected(new Set()); setSkill("All skills"); setCategory("All mistake types");
    fetch(`/api/mistakes?section=${encodeURIComponent(section)}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load your notebook."); return data; })
      .then(setPayload)
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your notebook."); });
    return () => controller.abort();
  }, [section]);

  const skills = useMemo(() => Array.from(new Set((payload?.mistakes ?? []).map((item) => item.skill))).sort(), [payload]);
  const visible = useMemo(() => (payload?.mistakes ?? []).filter((item) =>
    (status === "all" || (status === "improved" ? item.latestCorrect : !item.latestCorrect)) &&
    (skill === "All skills" || item.skill === skill) && (difficulty === "All difficulties" || item.difficulty === difficulty) &&
    (category === "All mistake types" || item.journal?.category === category)
  ), [payload, status, skill, difficulty, category]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function practice(ids: string[]) {
    if (!ids.length) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/mistakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, questionIds: ids }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not start this review.");
      window.location.href = data.href;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start this review."); setStarting(false); }
  }

  function updateJournal(questionId: string, journal: JournalEntry | null) {
    setPayload((current) => current ? {
      ...current,
      mistakes: current.mistakes.map((item) => item.questionId === questionId ? { ...item, journal } : item),
    } : current);
  }

  return <div className="space-y-6 max-w-6xl">
    <PageHeader eyebrow="Turn misses into mastery" title="Mistakes Notebook" description="Every question you miss stays here, so you can understand the pattern, try it again, and see your improvement." />
    <div className="flex gap-1 p-1 bg-white border border-brand-border rounded-xl w-fit">{(["Reading and Writing", "Math"] as Section[]).map((item) => <button key={item} onClick={() => setSection(item)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${section === item ? "bg-brand-navy text-white" : "text-brand-slate"}`}>{item === "Reading and Writing" ? "Reading & Writing" : item}</button>)}</div>
    {error && <p role="alert" className="card p-4 text-sm text-brand-red">{error}</p>}
    {!payload && !error && <div className="grid sm:grid-cols-4 gap-4">{[1,2,3,4].map((key) => <div key={key} className="h-28 bg-slate-200 rounded-2xl animate-pulse" />)}</div>}
    {payload && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Notebook questions" value={payload.summary.total} detail="Questions missed at least once" /><StatCard label="Needs review" value={payload.summary.needsReview} detail="Latest attempt was incorrect" /><StatCard label="Improved" value={payload.summary.improved} detail="Correct on the latest attempt" /><StatCard label="Repeated mistakes" value={payload.summary.repeated} detail="Missed more than once" /></div>
      {payload.skills.length > 0 && <section className="card p-5 sm:p-6"><h2 className="font-bold text-brand-navy">Weakest areas</h2><p className="text-xs text-brand-slate mt-1 mb-5">Accuracy across mock tests and Question Bank practice.</p><div className="grid md:grid-cols-2 gap-x-8 gap-y-5">{payload.skills.slice(0, 8).map((item) => <button key={item.domain + item.skill} onClick={() => setSkill(item.skill)} className="text-left group"><div className="flex justify-between gap-3 mb-2"><span className="text-sm font-medium text-brand-navy group-hover:text-brand-blue">{item.skill}</span><span className="text-xs text-brand-slate">{item.accuracyPct}% · {item.mistakes} mistakes</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.accuracyPct < 50 ? "bg-brand-red" : item.accuracyPct < 70 ? "bg-brand-amber" : "bg-brand-green"}`} style={{ width: `${item.accuracyPct}%` }} /></div></button>)}</div></section>}
      <DifficultyAnalytics payload={payload} section={section}/>
      {payload.mistakes.length === 0 ? <EmptyState title="No mistakes here yet" description="When you miss a question in a mock or the Question Bank, it will appear here automatically."><BookOpenCheck size={28} /></EmptyState> : <section className="card overflow-hidden">
        <div className="p-5 border-b border-brand-border flex flex-wrap items-center gap-3"><div className="flex gap-1 p-1 bg-slate-50 rounded-lg">{([['needs_review','Needs review'],['improved','Improved'],['all','All']] as [Status,string][]).map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${status === value ? "bg-white text-brand-blue shadow-sm" : "text-brand-slate"}`}>{label}</button>)}</div><select value={skill} onChange={(event) => setSkill(event.target.value)} className="border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-navy"><option>All skills</option>{skills.map((item) => <option key={item}>{item}</option>)}</select><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-navy">{["All difficulties","Easy","Medium","Hard"].map((item) => <option key={item}>{item}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="rounded-lg border border-brand-border px-3 py-2 text-xs text-brand-navy"><option>All mistake types</option>{Object.entries(CATEGORY_LABELS).filter(([value]) => value !== "unclassified").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => practice(visible.filter((item) => !item.latestCorrect).map((item) => item.questionId))} disabled={starting || visible.every((item) => item.latestCorrect)} className="btn-primary text-sm ml-auto disabled:opacity-50"><RotateCcw size={15} /> Review visible mistakes</button></div>
        <div className="divide-y divide-brand-border">{visible.map((item) => <MistakeItem key={item.questionId} item={item} checked={selected.has(item.questionId)} starting={starting} onToggle={() => toggle(item.questionId)} onPractice={() => practice([item.questionId])} onJournalSaved={(journal) => updateJournal(item.questionId, journal)} />)}</div>
        {visible.length === 0 && <p className="p-10 text-center text-sm text-brand-slate">No questions match these filters.</p>}
      </section>}
    </>}
    {selected.size > 0 && <div className="action-bar"><p className="font-semibold text-brand-navy">{selected.size} selected</p><div className="flex gap-2"><button onClick={() => setSelected(new Set())} className="btn-secondary">Clear</button><button onClick={() => practice(Array.from(selected))} disabled={starting} className="btn-primary">Practice selected</button></div></div>}
  </div>;
}
