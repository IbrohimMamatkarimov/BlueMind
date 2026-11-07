"use client";

import { useState } from "react";

type Props = {
  title: string;
  context: string;
  disabled?: boolean;
};

export function StudentHelp({ title, context, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (disabled) return null;

  async function ask() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/student-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Student help is unavailable.");
      setAnswer(data.answer || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Student help is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-40 rounded-full bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-blue-dark sm:bottom-24 sm:right-6">
      Ask for help
    </button>
    {open && <div className="fixed inset-0 z-[70] grid place-items-end bg-black/30 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Student help">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-brand-navy">Study help</h2><p className="mt-1 text-sm text-brand-slate">Ask about this practice question. You will get an explanation, not a shortcut.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-brand-slate hover:bg-slate-100" aria-label="Close">×</button></div>
        <p className="mt-4 text-xs font-semibold text-brand-blue">{title}</p>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} placeholder="Where are you stuck?" className="mt-2 min-h-28 w-full rounded-xl border border-brand-border p-3 text-sm text-brand-navy outline-none focus:border-brand-blue" />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        {answer && <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-brand-navy">{answer}</div>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-slate hover:bg-slate-100">Close</button><button type="button" disabled={!question.trim() || loading} onClick={ask} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Thinking…" : "Ask"}</button></div>
      </div>
    </div>}
  </>;
}

