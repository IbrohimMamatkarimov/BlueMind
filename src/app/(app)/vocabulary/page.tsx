"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, ExternalLink, Pencil, Save, Search, X } from "lucide-react";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

type Filter = "all" | "needs_definition" | "defined";

interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  questionId: string | null;
  sourcePath: string;
  questionNumber: number;
  sourceTitle: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  externalId: string | null;
  contextText: string;
  createdAt: string;
  updatedAt: string;
}

interface Payload {
  words: VocabularyWord[];
  summary: { total: number; defined: number; needsDefinition: number };
}

function VocabularyCard({ entry, onSaved }: { entry: VocabularyWord; onSaved: (word: VocabularyWord) => void }) {
  const [editing, setEditing] = useState(false);
  const [word, setWord] = useState(entry.word);
  const [definition, setDefinition] = useState(entry.definition);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = word.trim() !== entry.word || definition.trim() !== entry.definition;
  const questionHref = entry.questionId
    ? `${entry.sourcePath}?mode=practice&question=${encodeURIComponent(entry.questionId)}`
    : null;

  function cancel() {
    setWord(entry.word);
    setDefinition(entry.definition);
    setError("");
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, word, definition }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update this word.");
      onSaved(data.word);
      setWord(data.word.word);
      setDefinition(data.word.definition);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this word.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="card overflow-hidden">
    <div className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? <label className="block max-w-md"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Word or phrase</span><input value={word} onChange={(event) => setWord(event.target.value)} maxLength={120} className="w-full rounded-lg border border-brand-border px-3 py-2 text-base font-semibold" /></label> : <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-brand-navy">{entry.word}</h2>{!entry.definition && <span className="rounded-full bg-brand-amber-light px-2 py-1 text-[10px] font-semibold text-brand-amber">Needs definition</span>}</div>}
          <p className="mt-2 text-xs text-brand-slate">{entry.sourceTitle} · Question {entry.questionNumber}{entry.section ? ` · ${entry.section}` : ""}{entry.skill ? ` · ${entry.skill}` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {questionHref && <Link href={questionHref} className="btn-secondary text-xs"><ExternalLink size={14}/> View question</Link>}
          {!editing && <button onClick={() => setEditing(true)} className="btn-secondary text-xs"><Pencil size={14}/> Edit</button>}
        </div>
      </div>

      <div className="mt-5">
        {editing ? <label className="block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Definition <span className="font-normal text-brand-slate">(optional)</span></span><textarea value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={2000} rows={4} placeholder="Add the meaning in your own words, or leave this blank and return later." className="w-full resize-y rounded-lg border border-brand-border px-3 py-2 text-sm leading-6"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{definition.length}/2000</span></label> : entry.definition ? <div><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Definition</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-brand-navy">{entry.definition}</p></div> : <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue"><Pencil size={14}/> Add a definition when you’re ready</button>}
      </div>

      {editing && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{error && <p role="alert" className="mr-auto text-xs text-brand-red">{error}</p>}<button onClick={cancel} disabled={saving} className="btn-secondary text-xs"><X size={14}/> Cancel</button><button onClick={save} disabled={saving || !changed || !word.trim()} className="btn-primary text-xs"><Save size={14}/>{saving ? "Saving…" : "Save changes"}</button></div>}
    </div>

    {entry.contextText && <div className="border-t border-brand-border bg-slate-50 px-5 py-4 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Question context</p><p className="mt-1.5 line-clamp-3 text-sm leading-6 text-brand-navy">{entry.contextText}</p></div>}
  </article>;
}

export default function VocabularyPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/vocabulary", { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load your vocabulary."); return data; })
      .then(setPayload)
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load your vocabulary."); });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => (payload?.words ?? []).filter((entry) => {
    const matchesFilter = filter === "all" || (filter === "defined" ? Boolean(entry.definition) : !entry.definition);
    const needle = query.trim().toLowerCase();
    return matchesFilter && (!needle || entry.word.toLowerCase().includes(needle) || entry.definition.toLowerCase().includes(needle) || entry.skill?.toLowerCase().includes(needle));
  }), [payload, filter, query]);

  function updateWord(word: VocabularyWord) {
    setPayload((current) => current ? {
      words: current.words.map((entry) => entry.id === word.id ? word : entry),
      summary: {
        total: current.words.length,
        defined: current.words.filter((entry) => (entry.id === word.id ? word : entry).definition.length > 0).length,
        needsDefinition: current.words.filter((entry) => (entry.id === word.id ? word : entry).definition.length === 0).length,
      },
    } : current);
  }

  return <div className="max-w-5xl space-y-6">
    <PageHeader eyebrow="Build vocabulary from real context" title="My Vocabulary" description="Words you save while practicing stay connected to the question where you found them. Add definitions now or come back when you have time." />
    {error && <p role="alert" className="card p-4 text-sm text-brand-red">{error}</p>}
    {!payload && !error && <div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}</div>}
    {payload && <>
      <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Saved words" value={payload.summary.total} detail="Collected from practice"/><StatCard label="Defined" value={payload.summary.defined} detail="Ready to review"/><StatCard label="To define" value={payload.summary.needsDefinition} detail="Save now, finish later"/></div>
      {payload.words.length === 0 ? <EmptyState title="Your vocabulary notebook is ready" description="During a practice test, use the New word button to save an unfamiliar word and its question context."><BookOpenCheck size={28}/></EmptyState> : <>
        <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search vocabulary</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-slate"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search words or definitions" className="w-full rounded-lg border border-brand-border py-2 pl-9 pr-3 text-sm"/></label>
          <div className="flex gap-1 rounded-lg bg-slate-50 p-1">{([['all','All'],['needs_definition','To define'],['defined','Defined']] as [Filter,string][]).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-white text-brand-blue shadow-sm" : "text-brand-slate"}`}>{label}</button>)}</div>
        </section>
        <div className="space-y-4">{visible.map((entry) => <VocabularyCard key={entry.id} entry={entry} onSaved={updateWord}/>)}</div>
        {visible.length === 0 && <p className="card p-10 text-center text-sm text-brand-slate">No saved words match these filters.</p>}
      </>}
    </>}
  </div>;
}
