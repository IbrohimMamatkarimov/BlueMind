"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fullExamKey } from "@/lib/test-session";

export function FullExamCardAction({ mockId, available }: { mockId: string; available: boolean }) {
  const [status, setStatus] = useState<"new" | "saved" | "complete">("new");
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(fullExamKey(mockId));
        const saved = raw ? JSON.parse(raw) : null;
        setStatus(saved ? saved.step === 5 ? "complete" : "saved" : "new");
      } catch { setStatus("new"); }
    }
    read();
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);
    return () => { window.removeEventListener("focus", read); window.removeEventListener("pageshow", read); };
  }, [mockId]);
  return <div className="border border-brand-border dark:border-white/10 rounded-xl p-3.5 space-y-3">
    <p className="text-sm font-bold text-brand-navy dark:text-white">All four modules</p>
    <p className="text-xs text-brand-slate dark:text-slate-400 leading-relaxed">Reading &amp; Writing 1 &amp; 2 → 10-minute break → Math 1 &amp; 2</p>
    {available ? <Link href={`/practice/${encodeURIComponent(mockId)}/full`} className={`block text-center rounded-full text-white text-sm font-semibold px-4 py-2 ${status === "saved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#1e3a6e] hover:bg-[#16305c]"}`}>
      {status === "saved" ? "Continue full exam" : status === "complete" ? "Review full exam" : "Start full exam"}
    </Link> : <p className="text-xs text-brand-slate dark:text-slate-400">Coming soon · Waiting for all four complete modules</p>}
  </div>;
}
