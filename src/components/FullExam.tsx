"use client";

import { useEffect, useRef, useState } from "react";
import PracticeExam, { ExamResult } from "./PracticeExam";
import { PauseScreen, TestSetup, useExamGuard } from "./TestSessionControls";
import { FULL_EXAM_STEPS, formatTime, fullExamKey, isTestMode, remainingSeconds, TestMode } from "@/lib/test-session";
import { MathText } from "./MathText";
import { TextWatermarkOverlay } from "./TextWatermarkOverlay";
import { useAppTheme } from "@/lib/theme";

interface FullSession {
  version: 1;
  sessionId?: string;
  mode: TestMode;
  step: number;
  breakSeconds: number;
  results: Record<string, ExamResult>;
}

export default function FullExam({ mockId }: { mockId: string }) {
  const { dark } = useAppTheme();
  const [title, setTitle] = useState("");
  const [session, setSession] = useState<FullSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("Take as much time as you need.");
  const [breakLeft, setBreakLeft] = useState(600);
  const deadline = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const key = fullExamKey(mockId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/public/full-exam?mockId=${encodeURIComponent(mockId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "This full exam is unavailable.");
        if (cancelled) return;
        setTitle(data.mockTitle);
        const raw = localStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw) as FullSession;
          if (saved.version !== 1 || !isTestMode(saved.mode) || !Number.isInteger(saved.step) || saved.step < 0 || saved.step > 5 || !saved.results || !Number.isFinite(saved.breakSeconds)) {
            throw new Error("This saved exam could not be restored. Your stored progress has been kept.");
          }
          saved.sessionId ??= crypto.randomUUID();
          setSession(saved);
          setBreakLeft(Math.max(0, Math.min(600, saved.breakSeconds)));
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this exam."); }
      finally { if (!cancelled) setLoaded(true); }
    }
    load();
    return () => { cancelled = true; };
  }, [mockId, key]);

  function persist(next: FullSession) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      sessionRef.current = next;
      setSession(next);
      setSaveError("");
    } catch {
      throw new Error("Your browser could not save the exam. Free up browser storage and try again. Keep this page open to preserve your work.");
    }
  }

  function start(mode: TestMode) {
    const next: FullSession = session ?? { version: 1, sessionId: crypto.randomUUID(), mode, step: 0, breakSeconds: 600, results: {} };
    persist(next);
    setStarted(true);
  }

  function completeModule(result: ExamResult) {
    const current = sessionRef.current;
    if (!current) return;
    persist({ ...current, step: current.step + 1, results: { ...current.results, [current.step]: result } });
  }

  function saveBreak() {
    const current = sessionRef.current;
    if (!current || current.step !== 2) return;
    persist({ ...current, breakSeconds: deadline.current === null ? breakLeft : remainingSeconds(deadline.current) });
  }
  const saveBreakRef = useRef(saveBreak);
  saveBreakRef.current = saveBreak;
  const isBreak = started && session?.step === 2;
  useEffect(() => {
    if (!isBreak || paused || saveError) return;
    deadline.current = Date.now() + breakLeft * 1000;
    const tick = () => {
      if (pausedRef.current || deadline.current === null) return;
      setBreakLeft(remainingSeconds(deadline.current));
      try { saveBreakRef.current(); } catch (err) {
        setSaveError((err as Error).message);
        setPaused(true);
      }
    };
    const timer = setInterval(tick, 1000);
    const save = () => { try { saveBreakRef.current(); } catch {} };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      clearInterval(timer);
      deadline.current = null;
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
    // Snapshot remaining time when entering or resuming the break.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBreak, paused, saveError]);

  function pauseBreak(reason = "Your break is paused.") {
    if (pausedRef.current) return;
    pausedRef.current = true;
    try { saveBreak(); } catch (err) { setSaveError((err as Error).message); }
    if (deadline.current !== null) setBreakLeft(remainingSeconds(deadline.current));
    deadline.current = null;
    setPauseReason(reason);
    setPaused(true);
  }
  useExamGuard(!!isBreak && session?.mode === "exam" && !paused, pauseBreak);

  function exitBreak() {
    pauseBreak();
    try { saveBreak(); window.location.href = "/"; }
    catch (err) { setSaveError((err as Error).message); }
  }

  useEffect(() => {
    if (session?.step === 5 && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [session?.step]);

  if (!loaded) return <div className="min-h-screen grid place-items-center text-slate-600">Loading full exam…</div>;
  if (error) return <div className="min-h-screen flex flex-col justify-center items-center gap-4 p-6"><p role="alert">{error}</p><a href="/" className="text-blue-600">Back to mocks</a></div>;

  if (session?.step === 5) {
    const results = Object.values(session.results);
    const correct = results.reduce((sum, result) => sum + result.correctCount, 0);
    const total = results.reduce((sum, result) => sum + result.total, 0);
    return <main className={["min-h-screen bg-brand-bg text-brand-navy px-4 py-10", dark ? "app-dark" : ""].join(" ")}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-8">
          <p className="text-blue-600 font-semibold">Full exam complete</p>
          <h1 className="text-2xl font-bold mt-2">{title}</h1>
          <p className="text-4xl font-bold mt-6">{correct}<span className="text-lg text-slate-500"> / {total} correct</span></p>
          <p className="text-sm text-slate-600 mt-2">Review each module below. This is your question accuracy, not an official SAT scaled score.</p>
        </div>
        {FULL_EXAM_STEPS.map((step, index) => {
          const result = session.results[index];
          if (!result) return null;
          return <details key={index} className="bg-white rounded-xl border border-slate-200 p-5">
            <summary className="cursor-pointer font-semibold">{step.section} · Module {step.module}<span className="float-right">{result.correctCount}/{result.total}</span></summary>
            <div className="mt-5 space-y-5">{result.results.map((question, number) => <div key={question.questionId} className="border-t border-brand-border p-4 space-y-2 text-sm relative overflow-hidden">
              <TextWatermarkOverlay dark={dark} mode="absolute" />
              <p className={question.isCorrect ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>Question {number + 1} · {question.isCorrect ? "Correct" : "Incorrect"}</p>
              <MathText text={question.questionText} />
              {question.imageData && <img src={question.imageData} alt="Question diagram" className="max-w-full max-h-80 object-contain" />}
              {question.choices.map((choice) => <div key={choice.id}><strong>{choice.id}. </strong><MathText text={choice.text} /></div>)}
              <p>Your answer: {question.selectedAnswer || "Unanswered"} · Correct answer: {question.correctAnswer}</p>
              <MathText text={question.explanation || question.rationale} />
            </div>)}</div>
          </details>;
        })}
        <div className="flex gap-4 items-center"><a href="/" className="text-blue-600 font-semibold">Back to mocks</a>
          <button className="rounded-full border border-slate-300 px-5 py-2" onClick={() => {
            try {
              for (const index of [0, 1, 3, 4]) localStorage.removeItem(`${key}_module_${index}`);
              localStorage.removeItem(key);
              setSession(null); setStarted(false); setBreakLeft(600);
            } catch { setSaveError("Could not start a new attempt. Please try again."); }
          }}>Take again</button></div>
        {saveError && <p role="alert" className="text-red-700">{saveError}</p>}
      </div>
    </main>;
  }

  if (!started || !session) return <TestSetup title={title + " · Full Exam"}
    detail="98 questions · 134 minutes of testing + a 10-minute break" savedMode={session?.mode} onStart={start}>
    <ol className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
      {FULL_EXAM_STEPS.map((step, index) => <li key={index} className={`rounded-lg border px-3 py-2 ${session?.step === index ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
        {step.section === "Break" ? "10-minute break" : `${step.section === "Math" ? "Math" : "R&W"} · Module ${step.module} · ${step.minutes} min`}
      </li>)}
    </ol>
    {session && <p className="text-sm text-blue-700 mt-3">Resume at {FULL_EXAM_STEPS[session.step].section}{session.step !== 2 && ` · Module ${FULL_EXAM_STEPS[session.step].module}`}.</p>}
    <p className="text-xs text-slate-500 mt-3">Uses this paper’s four fixed modules. Module 2 does not adapt to your answers.</p>
  </TestSetup>;

  if (session.step === 2) return <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-slate-900">
    {paused && <PauseScreen reason={pauseReason} error={saveError} mode={session.mode} onResume={() => { pausedRef.current = false; setSaveError(""); setPaused(false); }} onExit={exitBreak} />}
    <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <p className="text-blue-600 font-semibold">Reading &amp; Writing complete</p><h1 className="text-2xl font-bold mt-3">Take a break</h1>
      <p className="text-6xl font-semibold tabular-nums my-8" aria-label="Break time remaining">{formatTime(breakLeft)}</p>
      <p className="text-sm text-slate-600">Next: Math, Module 1 · 35 minutes. {breakLeft > 0 ? "Your 10-minute break is in progress." : "Your break is over. Start Math when you’re ready."}</p>
      <div className="flex justify-center flex-wrap gap-3 mt-6">
        <button onClick={() => pauseBreak()} className="border border-slate-300 rounded-full px-5 py-2.5 font-semibold">Pause break</button>
        <button onClick={exitBreak} className="border border-slate-300 rounded-full px-5 py-2.5 font-semibold">Save &amp; exit</button>
        <button disabled={breakLeft > 0 && session.mode === "exam"} className="bg-blue-600 text-white rounded-full px-5 py-2.5 font-semibold disabled:opacity-40" onClick={() => {
          try { persist({ ...session, step: 3, breakSeconds: 0 }); }
          catch (err) { setSaveError((err as Error).message); pauseBreak(); }
        }}>{breakLeft > 0 ? "Skip break & start Math" : "Start Math"}</button>
      </div>
    </div>
  </main>;

  const step = FULL_EXAM_STEPS[session.step];
  return <PracticeExam key={session.step} params={{ mockId, section: step.section, module: String(step.module) }}
    fullExam={{ mode: session.mode, sessionId: session.sessionId, storageKey: `${key}_module_${session.step}`, onComplete: completeModule, onDelete: () => {
      localStorage.removeItem(key);
      for (const index of [0, 1, 3, 4]) localStorage.removeItem(`${key}_module_${index}`);
    } }} />;
}
