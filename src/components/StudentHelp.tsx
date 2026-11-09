"use client";
import { useEffect, useRef, useState } from "react";
import { Send, X, BookOpen } from "lucide-react";

export function StudentHelp({ title = "BlueMind Assistant", context = "Help this learner build SAT math, reading, and writing skills.", disabled = false }: { title?: string; context?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  async function ask() {
    if (!question.trim() || loading) return;
    setLoading(true); setError(""); setAnswer("");
    const current = new AbortController(); controller.current = current;
    const timeout = window.setTimeout(() => current.abort(), 25000);
    try {
      const response = await fetch("/api/student-help", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), context }), signal: current.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again shortly.");
      setAnswer(data.answer || "Please rephrase your question.");
    } catch (cause) { setError(current.signal.aborted ? "That took too long. Try again." : cause instanceof Error ? cause.message : "Please try again."); }
    finally { window.clearTimeout(timeout); setLoading(false); }
  }
  if (disabled) return null;
  return <>
    <button ref={launcher} type="button" aria-expanded={open} aria-controls="bluemind-companion" onClick={() => setOpen((value) => !value)} className="companion-launch companion-launch--robot">
      <span className="mira-avatar" aria-hidden="true"><i className="mira-avatar__orb"/><b className="mira-avatar__pencil"/><em className="mira-avatar__spark">✦</em></span>
      <span className="text-left"><strong className="block text-sm">Mira</strong><span className="block text-[10px] text-blue-100">Your study guide</span></span>
    </button>
    {open && <section id="bluemind-companion" role="dialog" aria-label="BlueMind Assistant" className="companion-panel">
      <header className="companion-heading"><span className="mira-avatar mira-avatar--panel" aria-hidden="true"><i className="mira-avatar__orb"/><b className="mira-avatar__pencil"/><em className="mira-avatar__spark">✦</em></span><div className="flex-1"><h2 className="text-sm font-bold">{title}</h2><p className="text-xs text-blue-100">Mira helps you find the next clear step.</p></div><button type="button" onClick={() => {setOpen(false);launcher.current?.focus();}} aria-label="Close assistant" className="rounded-lg p-2 hover:bg-white/10"><X size={18}/></button></header>
      <div className="companion-body"><p className="text-sm leading-6">Hey, I’m Mira, your study guide. Tell me where you are stuck. I can break down a concept, explain a method, or help you plan your next session.</p>
        <div className="companion-suggestions">{["Explain a math concept","Help with transitions","Plan a study session"].map((text) => <button type="button" key={text} onClick={() => {setQuestion(text); input.current?.focus();}}>{text}</button>)}</div>
        <div aria-live="polite" aria-busy={loading}>{loading && <p className="mt-4 text-sm">Thinking through your question…</p>}{answer && <div className="companion-answer">{answer}</div>}</div>
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        <p className="mt-3 text-[10px] leading-4 text-slate-500">AI can make mistakes. Check the reasoning. Your message and this page’s study context are sent to Google Gemini.</p>
      </div>
      <form className="companion-form" onSubmit={(event) => {event.preventDefault();void ask();}}><textarea ref={input} aria-label="Your study question" placeholder="Ask your question…" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000}/><button type="submit" disabled={loading || !question.trim()} aria-label="Send question"><Send size={17}/></button></form>
    </section>}
  </>;
}
