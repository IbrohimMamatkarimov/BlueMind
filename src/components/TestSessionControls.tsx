"use client";

import { useEffect, useRef, useState } from "react";
import { availableTestModes, TestMode } from "@/lib/test-session";

export async function enterExamFullscreen() {
  if (!document.fullscreenElement) {
    if (!document.documentElement.requestFullscreen) throw new Error("Fullscreen is unavailable in this browser. Use a supported desktop browser for exam mode.");
    await document.documentElement.requestFullscreen();
  }
}

export function useExamGuard(enabled: boolean, onPause: (reason: string) => void) {
  const callback = useRef(onPause);
  callback.current = onPause;
  useEffect(() => {
    if (!enabled) return;
    const warn = () => callback.current("You left the exam window. Your test is paused. Return to fullscreen to continue.");
    const visibility = () => { if (document.hidden) warn(); };
    const fullscreen = () => { if (!document.fullscreenElement) warn(); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" || event.key === "Meta") warn(); };
    window.addEventListener("blur", warn);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("keydown", keydown);
    // Also covers focus/fullscreen loss while a module was loading.
    if (document.hidden || !document.fullscreenElement || !document.hasFocus()) warn();
    return () => {
      window.removeEventListener("blur", warn);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("keydown", keydown);
    };
  }, [enabled]);
}

export function TestSetup({ title, detail, savedMode, onStart, children, allowedModes, practiceOnly = false, backHref }: {
  title: string; detail: string; savedMode?: TestMode;
  onStart: (mode: TestMode) => void; children?: React.ReactNode;
  allowedModes?: TestMode[]; practiceOnly?: boolean; backHref?: string;
}) {
  const options = availableTestModes(allowedModes, savedMode);
  const [mode, setMode] = useState<TestMode>(savedMode ?? options[0]?.value ?? "untimed");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  async function start() {
    setStarting(true);
    setError("");
    try {
      if (mode === "exam") await enterExamFullscreen();
      onStart(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fullscreen could not start. Please try again.");
    } finally { setStarting(false); }
  }
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-slate-900">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <p className="text-sm font-semibold text-blue-600 mb-2">{savedMode ? "Your saved test" : "Before you begin"}</p>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-slate-600 mt-2">{detail}</p>
        {children}
        <fieldset className="space-y-3 mt-6">
          <legend className="font-semibold mb-3">{savedMode ? "Continue in your saved mode" : "How would you like to practice?"}</legend>
          {options.map((option) => (
            <label key={option.value} className={`flex items-start gap-3 border rounded-xl p-4 cursor-pointer ${mode === option.value ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
              <input type="radio" name="test-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-1 accent-blue-600" />
              <span><span className="block font-semibold">{option.label}</span><span className="block text-sm text-slate-600 mt-1">{option.description}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-slate-600 mt-5">{practiceOnly ? "Check each answer to see the correct response and explanation. You can save and resume at any time." : "You can pause, save, and resume in every mode. Progress is saved in this browser on this device."}</p>
        {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
        <div className="mt-6 flex items-center justify-between gap-4">
          <a href={backHref ?? "/"} className="text-sm font-semibold text-slate-600">{practiceOnly ? "Back to Question Bank" : "Back to mocks"}</a>
          <button onClick={start} disabled={starting} className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50">{starting ? "Starting…" : savedMode ? (practiceOnly ? "Resume practice" : "Resume test") : (practiceOnly ? "Start practice" : "Start test")}</button>
        </div>
      </div>
    </main>
  );
}

export function PauseScreen({ reason, error, mode, onResume, onExit }: {
  reason: string; error?: string | null; mode: TestMode; onResume: () => void; onExit: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [resumeError, setResumeError] = useState("");
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const siblings = Array.from(dialog.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog.current);
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    button.current?.focus();
    return () => {
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      previousFocus?.focus();
    };
  }, []);
  async function resume() {
    try {
      if (mode === "exam") await enterExamFullscreen();
      onResume();
    } catch { setResumeError("Please allow fullscreen to resume exam mode."); }
  }
  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pause-title" className="fixed inset-0 z-[100] bg-slate-100 flex items-center justify-center p-4 text-slate-900" onKeyDown={(event) => {
      if (event.key === "Tab") {
        const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 id="pause-title" className="text-2xl font-bold">Test paused</h2>
        <p className="text-slate-600 text-sm mt-3">{reason}</p>
        <p className="text-slate-600 text-sm mt-3">Your timer is stopped. Continue here or save and come back later on this device.</p>
        {(error || resumeError) && <p role="alert" className="text-sm text-red-700 mt-4">{error || resumeError}</p>}
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <button ref={button} onClick={resume} className="rounded-full bg-blue-600 text-white font-semibold px-5 py-2.5">{mode === "exam" ? "Return to fullscreen & resume" : "Resume test"}</button>
          <button onClick={onExit} className="rounded-full border border-slate-300 px-5 py-2.5 font-semibold">Save &amp; exit</button>
        </div>
      </div>
    </div>
  );
}
