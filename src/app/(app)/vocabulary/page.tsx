"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Layers3, Pencil, Plus, Save, Search, Shuffle, X } from "lucide-react";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

type Filter = "all" | "due" | "needs_definition" | "defined";

interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  pronunciation: string;
  synonyms: string;
  wordForms: string;
  exampleSentence: string;
  questionId: string | null;
  sourcePath: string;
  questionNumber: number;
  sourceTitle: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  externalId: string | null;
  contextText: string;
  reviewLevel: number;
  reviewCount: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Payload {
  words: VocabularyWord[];
  summary: { total: number; defined: number; needsDefinition: number; due: number };
}

const VOCABULARY_CACHE_KEY = "bluemind-vocabulary-cache-v1";

function summarizeWords(words: VocabularyWord[]): Payload["summary"] {
  const now = Date.now();
  return {
    total: words.length,
    defined: words.filter((entry) => entry.definition.length > 0).length,
    needsDefinition: words.filter((entry) => entry.definition.length === 0).length,
    due: words.filter((entry) => entry.definition.length > 0 && Date.parse(entry.nextReviewAt) <= now).length,
  };
}

function HighlightedContext({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return <>{parts.map((part, index) => part.toLowerCase() === word.toLowerCase() ? <mark key={index} className="rounded bg-brand-amber-light px-0.5 text-brand-navy">{part}</mark> : part)}</>;
}

function AddWordModal({ onClose, onCreated }: { onClose: () => void; onCreated: (word: VocabularyWord) => void }) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [synonyms, setSynonyms] = useState("");
  const [wordForms, setWordForms] = useState("");
  const [exampleSentence, setExampleSentence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!word.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, definition, pronunciation, synonyms, wordForms, exampleSentence }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this word.");
      onCreated(data.word);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this word.");
    } finally {
      setSaving(false);
    }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="add-word-title" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/30 px-4">
    <div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="add-word-title" className="text-lg font-bold text-brand-navy">Add to My Vocabulary</h2><p className="mt-1 text-xs leading-5 text-brand-slate">Add any word now. A definition is optional and can be completed later.</p></div><button onClick={onClose} aria-label="Close add word window" className="rounded-md p-1 text-brand-slate hover:bg-slate-100"><X size={18}/></button></div>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Word or phrase</span><input autoFocus value={word} onChange={(event) => setWord(event.target.value)} maxLength={120} placeholder="Type a word or phrase" className="w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{word.length}/120</span></label>
      <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Definition <span className="font-normal text-brand-slate">(optional)</span></span><textarea value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={2000} rows={4} placeholder="Add the meaning now, or leave this blank and return later." className="w-full resize-y rounded-lg border border-brand-border px-3 py-2.5 text-sm leading-6"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{definition.length}/2000</span></label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Pronunciation</span><input value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} maxLength={200} placeholder="e.g. /ˈpræɡ.mə.tɪk/" className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Synonyms</span><input value={synonyms} onChange={(event) => setSynonyms(event.target.value)} maxLength={1000} placeholder="practical, realistic" className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Word forms</span><input value={wordForms} onChange={(event) => setWordForms(event.target.value)} maxLength={1000} placeholder="pragmatism, pragmatically" className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Example sentence</span><input value={exampleSentence} onChange={(event) => setExampleSentence(event.target.value)} maxLength={2000} placeholder="Use the word in a sentence" className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label></div>
      {error && <p role="alert" className="mt-3 text-xs text-brand-red">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={onClose} disabled={saving} className="btn-secondary text-xs">Cancel</button><button onClick={save} disabled={saving || !word.trim()} className="btn-primary text-xs"><Save size={14}/>{saving ? "Saving…" : definition.trim() ? "Save word" : "Save for later"}</button></div>
    </div>
  </div>;
}

function FlashcardStudy({ entries, initialId, onClose, onReviewed }: { entries: VocabularyWord[]; initialId?: string; onClose: () => void; onReviewed: (word: VocabularyWord) => void }) {
  const [deck, setDeck] = useState(entries);
  const [index, setIndex] = useState(() => Math.max(0, entries.findIndex((entry) => entry.id === initialId)));
  const [revealed, setRevealed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const touchStartX = useRef<number | null>(null);
  const touchSwiped = useRef(false);
  const current = deck[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      const interactive = (event.target as HTMLElement | null)?.closest("button, a, input, textarea, select");
      if (event.key === " " || event.key === "Enter") {
        if (interactive) return;
        event.preventDefault();
        setRevealed((value) => !value);
      }
      if (event.key === "ArrowRight") {
        setIndex((value) => (value + 1) % deck.length);
        setRevealed(false);
      }
      if (event.key === "ArrowLeft") {
        setIndex((value) => (value - 1 + deck.length) % deck.length);
        setRevealed(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deck.length, onClose]);

  function move(amount: number) {
    setIndex((value) => (value + amount + deck.length) % deck.length);
    setRevealed(false);
    setReviewMessage("");
  }

  async function rate(rating: "again" | "hard" | "got_it") {
    setReviewing(true);
    try {
      const response = await fetch("/api/vocabulary", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id, rating }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not schedule this card.");
      onReviewed(data.word);
      setReviewMessage(rating === "again" ? "Back in 10 minutes" : rating === "hard" ? "Scheduled sooner" : "Scheduled for later");
      setIndex((value) => (value + 1) % deck.length);
      setRevealed(false);
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : "Could not schedule this card.");
    } finally {
      setReviewing(false);
    }
  }

  function shuffleDeck() {
    setDeck((previous) => {
      const next = [...previous];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setIndex(0);
    setRevealed(false);
  }

  if (!current) return null;
  const questionHref = current.questionId
    ? `${current.sourcePath}?mode=practice&question=${encodeURIComponent(current.questionId)}`
    : null;

  return <div role="dialog" aria-modal="true" aria-labelledby="flashcard-title" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/50 px-4 py-6">
    <div className="w-full max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-white">
        <div><h2 id="flashcard-title" className="text-lg font-bold">Vocabulary flashcards</h2><p className="text-xs text-white/75">Card {index + 1} of {deck.length}</p></div>
        <div className="flex items-center gap-2"><button onClick={shuffleDeck} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10"><Shuffle size={15}/> Shuffle</button><button onClick={onClose} aria-label="Close flashcards" className="rounded-lg p-2 hover:bg-white/10"><X size={20}/></button></div>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${((index + 1) / deck.length) * 100}%` }}/></div>

      <button onClick={() => { if (touchSwiped.current) { touchSwiped.current = false; return; } setRevealed((value) => !value); }} onTouchStart={(event) => { touchSwiped.current = false; touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStartX.current == null) return; const distance = event.changedTouches[0].clientX - touchStartX.current; if (Math.abs(distance) > 60) { touchSwiped.current = true; move(distance < 0 ? 1 : -1); } touchStartX.current = null; }} aria-label={revealed ? "Show word" : "Show definition"} className={`card flex min-h-[360px] w-full touch-pan-y flex-col items-center justify-center p-8 text-center transition-colors sm:p-12 ${revealed ? "bg-brand-blue-light" : "bg-white"}`}>
        {revealed ? <div className="max-w-xl" aria-live="polite"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-blue">Definition</p><h3 className="mt-3 text-2xl font-bold text-brand-navy">{current.word}</h3>{current.pronunciation && <p className="mt-1 text-sm text-brand-slate">{current.pronunciation}</p>}<p className="mt-6 whitespace-pre-wrap text-base leading-7 text-brand-navy">{current.definition}</p>{current.synonyms && <p className="mt-4 text-sm text-brand-slate"><strong className="text-brand-navy">Synonyms:</strong> {current.synonyms}</p>}{current.exampleSentence && <p className="mt-3 text-sm italic leading-6 text-brand-slate">“{current.exampleSentence}”</p>}<p className="mt-5 text-xs text-brand-slate">{current.sourceTitle}{current.questionId ? ` · Question ${current.questionNumber}` : ""}</p>{current.contextText && <div className="mt-5 border-t border-brand-border pt-5"><p className="text-[10px] font-semibold uppercase tracking-wide text-brand-slate">Question context</p><p className="mt-2 line-clamp-3 text-sm italic leading-6 text-brand-slate"><HighlightedContext text={current.contextText} word={current.word}/></p></div>}</div> : <div aria-live="polite"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-slate">Word</p><h3 className="mt-5 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">{current.word}</h3><p className="mt-8 text-xs text-brand-slate">Click the card or press Space to reveal · swipe on mobile</p></div>}
      </button>

      {revealed && <div className="mt-3 grid grid-cols-3 gap-2"><button disabled={reviewing} onClick={() => rate("again")} className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 disabled:opacity-50">Again <span className="block text-[10px] font-normal">10 min</span></button><button disabled={reviewing} onClick={() => rate("hard")} className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700 disabled:opacity-50">Hard <span className="block text-[10px] font-normal">Sooner</span></button><button disabled={reviewing} onClick={() => rate("got_it")} className="rounded-lg bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-700 disabled:opacity-50">Got it <span className="block text-[10px] font-normal">Later</span></button></div>}

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button onClick={() => move(-1)} className="btn-secondary justify-self-start text-xs"><ChevronLeft size={16}/> Previous</button>
        <button onClick={() => setRevealed((value) => !value)} className="rounded-lg border border-white/60 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10">{revealed ? "Show word" : "Reveal answer"}</button>
        <button onClick={() => move(1)} className="btn-primary justify-self-end text-xs">Next <ChevronRight size={16}/></button>
      </div>
      <div className="mt-3 flex min-h-8 items-center justify-center">{reviewMessage ? <p role="status" className="text-xs font-semibold text-white">{reviewMessage}</p> : revealed && questionHref && <Link href={questionHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white"><ExternalLink size={13}/> Review this word in its question</Link>}</div>
    </div>
  </div>;
}

function VocabularyCard({ entry, onSaved, onStudy }: { entry: VocabularyWord; onSaved: (word: VocabularyWord) => void; onStudy: () => void }) {
  const [editing, setEditing] = useState(false);
  const [word, setWord] = useState(entry.word);
  const [definition, setDefinition] = useState(entry.definition);
  const [pronunciation, setPronunciation] = useState(entry.pronunciation ?? "");
  const [synonyms, setSynonyms] = useState(entry.synonyms ?? "");
  const [wordForms, setWordForms] = useState(entry.wordForms ?? "");
  const [exampleSentence, setExampleSentence] = useState(entry.exampleSentence ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = word.trim() !== entry.word || definition.trim() !== entry.definition || pronunciation.trim() !== entry.pronunciation || synonyms.trim() !== entry.synonyms || wordForms.trim() !== entry.wordForms || exampleSentence.trim() !== entry.exampleSentence;
  const questionHref = entry.questionId
    ? `${entry.sourcePath}?mode=practice&question=${encodeURIComponent(entry.questionId)}`
    : null;

  function cancel() {
    setWord(entry.word);
    setDefinition(entry.definition);
    setPronunciation(entry.pronunciation ?? ""); setSynonyms(entry.synonyms ?? ""); setWordForms(entry.wordForms ?? ""); setExampleSentence(entry.exampleSentence ?? "");
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
        body: JSON.stringify({ id: entry.id, word, definition, pronunciation, synonyms, wordForms, exampleSentence }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update this word.");
      onSaved(data.word);
      setWord(data.word.word);
      setDefinition(data.word.definition);
      setPronunciation(data.word.pronunciation); setSynonyms(data.word.synonyms); setWordForms(data.word.wordForms); setExampleSentence(data.word.exampleSentence);
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
          <p className="mt-2 text-xs text-brand-slate">{entry.sourceTitle}{entry.questionId ? ` · Question ${entry.questionNumber}` : ""}{entry.section ? ` · ${entry.section}` : ""}{entry.skill ? ` · ${entry.skill}` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {questionHref && <Link href={questionHref} className="btn-secondary text-xs"><ExternalLink size={14}/> View question</Link>}
          {entry.definition && !editing && <button onClick={onStudy} className="btn-secondary text-xs"><Layers3 size={14}/> Study card</button>}
          {!editing && <button onClick={() => setEditing(true)} className="btn-secondary text-xs"><Pencil size={14}/> Edit</button>}
        </div>
      </div>

      <div className="mt-5">
        {editing ? <label className="block"><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Definition <span className="font-normal text-brand-slate">(optional)</span></span><textarea value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={2000} rows={4} placeholder="Add the meaning in your own words, or leave this blank and return later." className="w-full resize-y rounded-lg border border-brand-border px-3 py-2 text-sm leading-6"/><span className="mt-1 block text-right text-[10px] text-brand-slate">{definition.length}/2000</span></label> : entry.definition ? <div><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Definition</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-brand-navy">{entry.definition}</p></div> : <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue"><Pencil size={14}/> Add a definition when you’re ready</button>}
      </div>

      {editing ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Pronunciation</span><input value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} maxLength={200} className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Synonyms</span><input value={synonyms} onChange={(event) => setSynonyms(event.target.value)} maxLength={1000} className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Word forms</span><input value={wordForms} onChange={(event) => setWordForms(event.target.value)} maxLength={1000} className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label><label><span className="mb-1.5 block text-xs font-semibold text-brand-navy">Example sentence</span><input value={exampleSentence} onChange={(event) => setExampleSentence(event.target.value)} maxLength={2000} className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"/></label></div> : (entry.pronunciation || entry.synonyms || entry.wordForms || entry.exampleSentence) && <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">{entry.pronunciation && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-slate">Pronunciation</dt><dd className="mt-1 text-brand-navy">{entry.pronunciation}</dd></div>}{entry.synonyms && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-slate">Synonyms</dt><dd className="mt-1 text-brand-navy">{entry.synonyms}</dd></div>}{entry.wordForms && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-slate">Word forms</dt><dd className="mt-1 text-brand-navy">{entry.wordForms}</dd></div>}{entry.exampleSentence && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-slate">Example</dt><dd className="mt-1 text-brand-navy">{entry.exampleSentence}</dd></div>}</dl>}

      {editing && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{error && <p role="alert" className="mr-auto text-xs text-brand-red">{error}</p>}<button onClick={cancel} disabled={saving} className="btn-secondary text-xs"><X size={14}/> Cancel</button><button onClick={save} disabled={saving || !changed || !word.trim()} className="btn-primary text-xs"><Save size={14}/>{saving ? "Saving…" : "Save changes"}</button></div>}
    </div>

    {entry.contextText && <div className="border-t border-brand-border bg-slate-50 px-5 py-4 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate">Question context</p><p className="mt-1.5 line-clamp-3 text-sm leading-6 text-brand-navy"><HighlightedContext text={entry.contextText} word={entry.word}/></p></div>}
  </article>;
}

export default function VocabularyPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [studyStartId, setStudyStartId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let hadCache = false;
    try {
      const cached = window.localStorage.getItem(VOCABULARY_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Payload;
        if (Array.isArray(parsed.words)) {
          setPayload({ words: parsed.words, summary: summarizeWords(parsed.words) });
          hadCache = true;
        }
      }
    } catch {
      window.localStorage.removeItem(VOCABULARY_CACHE_KEY);
    }
    fetch("/api/vocabulary", { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load your vocabulary."); return data; })
      .then((data: Payload) => { setPayload(data); window.localStorage.setItem(VOCABULARY_CACHE_KEY, JSON.stringify(data)); })
      .catch((cause) => { if (!controller.signal.aborted && !hadCache) setError(cause instanceof Error ? cause.message : "Could not load your vocabulary."); });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => (payload?.words ?? []).filter((entry) => {
    const due = entry.definition.length > 0 && Date.parse(entry.nextReviewAt) <= Date.now();
    const matchesFilter = filter === "all" || (filter === "defined" ? Boolean(entry.definition) : filter === "due" ? due : !entry.definition);
    const needle = query.trim().toLowerCase();
    return matchesFilter && (!needle || entry.word.toLowerCase().includes(needle) || entry.definition.toLowerCase().includes(needle) || entry.synonyms.toLowerCase().includes(needle) || entry.wordForms.toLowerCase().includes(needle) || entry.exampleSentence.toLowerCase().includes(needle) || entry.skill?.toLowerCase().includes(needle));
  }), [payload, filter, query]);
  const flashcardWords = useMemo(() => (payload?.words ?? []).filter((entry) => entry.definition.length > 0), [payload]);
  const dueWords = useMemo(() => flashcardWords.filter((entry) => Date.parse(entry.nextReviewAt) <= Date.now()), [flashcardWords]);
  const studyDeck = studyStartId ? flashcardWords : (dueWords.length ? dueWords : flashcardWords);

  function updateWord(word: VocabularyWord) {
    setPayload((current) => {
      if (!current) return current;
      const words = current.words.map((entry) => entry.id === word.id ? word : entry);
      const next = { words, summary: summarizeWords(words) };
      window.localStorage.setItem(VOCABULARY_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function addWord(word: VocabularyWord) {
    setPayload((current) => {
      const words = current ? [word, ...current.words.filter((entry) => entry.id !== word.id)] : [word];
      const next = { words, summary: summarizeWords(words) };
      window.localStorage.setItem(VOCABULARY_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return <div className="max-w-5xl space-y-6">
    <PageHeader eyebrow="Build vocabulary from real context" title="My Vocabulary" description="Save words at any time, keep their question context, and review them on a personalized schedule." action={<div className="flex flex-wrap gap-2"><button onClick={() => setStudyStartId("")} disabled={flashcardWords.length === 0} title={flashcardWords.length === 0 ? "Add a definition to start studying" : undefined} className="btn-secondary"><Layers3 size={16}/> {dueWords.length ? `Review due (${dueWords.length})` : "Study flashcards"}</button><button onClick={() => setAdding(true)} className="btn-primary"><Plus size={16}/> Add word</button></div>} />
    {error && <p role="alert" className="card p-4 text-sm text-brand-red">{error}</p>}
    {!payload && !error && <div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}</div>}
    {payload && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Saved words" value={payload.summary.total} detail="Practice and personal entries"/><StatCard label="Due now" value={payload.summary.due} detail="Spaced review queue"/><StatCard label="Defined" value={payload.summary.defined} detail="Ready to review"/><StatCard label="To define" value={payload.summary.needsDefinition} detail="Save now, finish later"/></div>
      {payload.words.length === 0 ? <EmptyState title="Your vocabulary notebook is ready" description="Add a word here at any time, or use the New word button during practice to save it with its question context."><button onClick={() => setAdding(true)} className="btn-primary"><Plus size={16}/> Add your first word</button></EmptyState> : <>
        <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search vocabulary</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-slate"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search words or definitions" className="w-full rounded-lg border border-brand-border py-2 pl-9 pr-3 text-sm"/></label>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-50 p-1">{([['all','All'],['due','Due'],['needs_definition','To define'],['defined','Defined']] as [Filter,string][]).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-white text-brand-blue shadow-sm" : "text-brand-slate"}`}>{label}</button>)}</div>
        </section>
        <div className="space-y-4">{visible.map((entry) => <VocabularyCard key={entry.id} entry={entry} onSaved={updateWord} onStudy={() => setStudyStartId(entry.id)}/>)}</div>
        {visible.length === 0 && <p className="card p-10 text-center text-sm text-brand-slate">No saved words match these filters.</p>}
      </>}
    </>}
    {adding && <AddWordModal onClose={() => setAdding(false)} onCreated={addWord}/>}
    {studyStartId !== null && studyDeck.length > 0 && <FlashcardStudy entries={studyDeck} initialId={studyStartId || undefined} onClose={() => setStudyStartId(null)} onReviewed={updateWord}/>}
  </div>;
}
