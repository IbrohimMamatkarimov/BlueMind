"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Eye, RotateCcw } from "lucide-react";
import { MathText } from "@/components/MathText";

export interface ReaderNote {
  questionId: string;
  domain: string;
  skill: string;
  difficulty: string;
  questionText: string;
  source: string;
  note: string;
  updatedAt: string;
}

interface QuestionDetails {
  passageText: string | null;
  questionText: string;
  imageData: string | null;
  questionType: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  explanation: string;
}

type GroupBy = "topic" | "date";

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function anchorId(label: string) {
  return "notebook-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** The Notebook's "Read" mode: every note laid out like pages of a paper
 * notebook, grouped by topic or by day, with the question one click away. */
export function NotebookReader({ notes, starting, onPractice }: { notes: ReaderNote[]; starting: boolean; onPractice: (questionId: string) => void }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("topic");

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; detail: string; notes: ReaderNote[] }>();
    const ordered = groupBy === "topic"
      ? [...notes].sort((a, b) => a.domain.localeCompare(b.domain) || a.skill.localeCompare(b.skill) || b.updatedAt.localeCompare(a.updatedAt))
      : [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const note of ordered) {
      const label = groupBy === "topic" ? note.skill : dayLabel(note.updatedAt);
      const group = map.get(label) ?? { label, detail: groupBy === "topic" ? note.domain : "", notes: [] };
      group.notes.push(note);
      map.set(label, group);
    }
    return Array.from(map.values());
  }, [notes, groupBy]);

  let number = 0;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 p-1 bg-slate-50 rounded-lg" role="group" aria-label="Arrange notes">
        {([["topic", "By topic"], ["date", "By date"]] as [GroupBy, string][]).map(([value, label]) =>
          <button key={value} onClick={() => setGroupBy(value)} aria-pressed={groupBy === value} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${groupBy === value ? "bg-white text-brand-blue shadow-sm" : "text-brand-slate"}`}>{label}</button>)}
      </div>
      {groups.length > 1 && <nav aria-label="Jump to" className="flex flex-wrap gap-1.5">
        {groups.map((group) => <a key={group.label} href={`#${anchorId(group.label)}`} className="filter-chip !py-1 !text-[11px]">{group.label}<span className="text-brand-slate tabular-nums">{group.notes.length}</span></a>)}
      </nav>}
    </div>

    <div className="notebook-paper">
      {groups.map((group) => <div key={group.label} id={anchorId(group.label)} className="scroll-mt-6">
        <header className="notebook-entry pr-5 sm:pr-8 pt-7 pb-1">
          <h3 className="text-lg font-bold text-brand-navy">{group.label}</h3>
          {group.detail && <p className="text-xs text-brand-slate">{group.detail}</p>}
        </header>
        {group.notes.map((note) => {
          number += 1;
          return <NotebookEntry key={note.questionId} note={note} number={number} showSkill={groupBy === "date"} starting={starting} onPractice={() => onPractice(note.questionId)} />;
        })}
      </div>)}
      <div className="h-8" />
    </div>
  </section>;
}

function NotebookEntry({ note, number, showSkill, starting, onPractice }: { note: ReaderNote; number: number; showSkill: boolean; starting: boolean; onPractice: () => void }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<QuestionDetails | null>(null);
  const [error, setError] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || details) return;
    setError("");
    fetch(`/api/question-notes?questionId=${encodeURIComponent(note.questionId)}&details=1`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load this question."); return data.question as QuestionDetails; })
      .then(setDetails)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load this question."));
  }

  const date = new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return <article className="notebook-entry pr-5 sm:pr-8 pt-5">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">
      <span className="tabular-nums">{number}.</span> {showSkill ? `${note.skill} · ` : ""}{note.difficulty} · {note.source} · {date}
    </p>
    <div className="notebook-lines mt-1">{note.note}</div>

    <div className="mt-1 flex flex-wrap items-center gap-4">
      <button onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue">
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />{open ? "Hide question" : "Show question"}
      </button>
      <button onClick={onPractice} disabled={starting} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-slate hover:text-brand-blue disabled:opacity-50"><RotateCcw size={13} /> Solve again</button>
    </div>

    {open && <div className="mt-3 rounded-xl border border-brand-border bg-white p-4 text-sm leading-6 text-brand-navy space-y-3">
      {!details && !error && <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />}
      {error && <p role="alert" className="text-xs text-brand-red">{error}</p>}
      {details && <>
        {details.passageText && <div className="border-l-2 border-brand-border pl-3 text-brand-navy/80"><MathText text={details.passageText} /></div>}
        {details.imageData && <img src={details.imageData} alt="Question figure" className="max-w-full max-h-72 object-contain" />}
        <div className="font-medium"><MathText text={details.questionText} /></div>
        {details.choices.length > 0 && <ul className="space-y-1">
          {details.choices.map((choice) => <li key={choice.id} className={`flex gap-2 rounded-lg px-2 py-1 ${showAnswer && choice.id === details.correctAnswer ? "bg-brand-green-light" : ""}`}>
            <span className="font-semibold shrink-0">{choice.id}.</span><MathText text={choice.text} />
          </li>)}
        </ul>}
        {showAnswer ? <div className="rounded-lg bg-slate-50 p-3 space-y-2">
          <p className="font-semibold text-brand-green">Correct answer: {details.correctAnswer}</p>
          {details.explanation && <div className="text-brand-navy/80"><MathText text={details.explanation} /></div>}
        </div> : <button onClick={() => setShowAnswer(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue"><Eye size={13} /> Show answer &amp; explanation</button>}
      </>}
    </div>}
  </article>;
}
