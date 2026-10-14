"use client";

import Link from "next/link";
import { FULL_EXAM_STEPS } from "@/lib/test-session";
import { savedAgo, type ProgressSummary } from "@/lib/progress-keys";

// `progress` is the catalog's merged server + local copy of this mock's
// full-exam session (step 5 = finished).
export function FullExamCardAction({ mockId, available, progress }: { mockId: string; available: boolean; progress?: ProgressSummary }) {
  const status = !progress ? "new" : progress.step === 5 ? "complete" : "saved";
  const step = status === "saved" && typeof progress?.step === "number" ? FULL_EXAM_STEPS[progress.step] : null;
  return <div className="border border-brand-border dark:border-white/10 rounded-xl p-3.5 space-y-3">
    <p className="text-sm font-bold text-brand-navy dark:text-white">All four modules</p>
    <p className="text-xs text-brand-slate dark:text-slate-400 leading-relaxed">Reading &amp; Writing 1 &amp; 2 → 10-minute break → Math 1 &amp; 2</p>
    {step && <p className="text-xs text-brand-slate dark:text-slate-400">
      <span className="font-semibold text-brand-green">In progress</span> · {step.section === "Break" ? "on the break" : `${step.section === "Math" ? "Math" : "R&W"} Module ${step.module}`}
      {!!progress?.savedAt && ` · ${savedAgo(progress.savedAt)}`}
    </p>}
    {available ? <Link href={`/practice/${encodeURIComponent(mockId)}/full`} className={`block text-center rounded-full text-white text-sm font-semibold px-4 py-2 ${status === "saved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-blue hover:bg-brand-blue-dark"}`}>
      {status === "saved" ? "Continue full exam" : status === "complete" ? "Review full exam" : "Start full exam"}
    </Link> : <p className="text-xs text-brand-slate dark:text-slate-400">Coming soon · Waiting for all four complete modules</p>}
  </div>;
}
