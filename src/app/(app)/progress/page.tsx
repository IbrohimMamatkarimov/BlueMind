"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  userName: string;
  latestScore: { total: number | null; math: number | null; readingWriting: number | null; mockTitle: string; completedAt: string } | null;
  pointsGained: number | null;
  nextPractice: { skill: string; domain: string; questionCount: number } | null;
  continueAttempt: { attemptId: string; mockId: string; mockTitle: string; section: string; module: number } | null;
  todaysPractice: { items: { label: string; count: number }[]; estimatedMinutes: number };
  blueMindProfile: {
    strong: { skill: string; accuracyPct: number }[];
    improving: { skill: string; accuracyPct: number }[];
    needsPractice: { skill: string; accuracyPct: number }[];
  };
}

/**
 * "Your Data" — this route didn't exist at all before (an empty directory,
 * so the nav link 404'd). Built against the real /api/dashboard response
 * shape rather than guessed fields. Deliberately an honest MVP: a real
 * empty state before any attempt exists, real score/profile data once one
 * does. Doesn't yet include the reference design's time-range filters
 * (1W/1M/3M/.../All) or separate Verbal/Math tabs — /api/dashboard doesn't
 * currently return data broken out that way, and building that out is a
 * real backend addition of its own rather than something to guess at here.
 */
export default function ProgressPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(setData)
      .catch(() => setError("Couldn't load your data right now. Please refresh."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy flex items-center gap-2.5">
          <ChartBarIcon />
          Your Data
        </h1>
        <p className="text-brand-slate mt-1 text-sm">Your score history, accuracy by domain, and what to practice next.</p>
      </div>

      {error && <div className="card p-6 text-brand-red text-sm">{error}</div>}

      {!data && !error && <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />}

      {data && !data.latestScore && (
        <div className="card p-14 flex flex-col items-center text-center">
          <span className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-brand-slate mb-5">
            <ChartBarIcon size={22} />
          </span>
          <h2 className="text-xl font-bold text-brand-navy mb-2">Take your first test — your data opens up here</h2>
          <p className="text-sm text-brand-slate max-w-md mb-6">
            Sit one full Digital SAT and this page fills with your score over time, your accuracy in every domain,
            and the skills worth working on next.
          </p>
          <Link
            href="/mocks"
            className="flex items-center gap-2 text-sm font-semibold text-white bg-brand-navy px-6 py-3 rounded-full hover:bg-brand-navy/90 transition-colors"
          >
            Browse the exams
            <ArrowRightIcon />
          </Link>
        </div>
      )}

      {data && data.latestScore && (
        <>
          {data.continueAttempt && (
            <Link
              href={`/practice/${data.continueAttempt.mockId}/${encodeURIComponent(data.continueAttempt.section)}/${data.continueAttempt.module}`}
              className="block card p-4 flex items-center justify-between gap-4 hover:border-brand-blue/40 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-brand-navy">Continue where you left off</p>
                <p className="text-xs text-brand-slate mt-0.5">
                  {data.continueAttempt.mockTitle} — {data.continueAttempt.section} Module {data.continueAttempt.module}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-white bg-brand-navy px-4 py-2 rounded-full">Resume</span>
            </Link>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-1.5">Latest score</p>
              <p className="text-3xl font-extrabold text-brand-navy">{data.latestScore.total ?? "—"}</p>
              <p className="text-xs text-brand-slate mt-1 truncate">{data.latestScore.mockTitle}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-1.5">Since your first test</p>
              <p className={`text-3xl font-extrabold ${data.pointsGained !== null && data.pointsGained >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                {data.pointsGained === null ? "—" : data.pointsGained >= 0 ? `+${data.pointsGained}` : data.pointsGained}
              </p>
              <p className="text-xs text-brand-slate mt-1">points</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-brand-slate mb-1.5">Math</p>
              <p className="text-3xl font-extrabold text-brand-navy">{data.latestScore.math ?? "—"}</p>
            </div>
          </div>

          {data.nextPractice && (
            <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-brand-blue mb-1">Recommended next</p>
                <p className="text-sm text-brand-navy">
                  Your weakest skill right now is <span className="font-semibold">{data.nextPractice.skill}</span> (
                  {data.nextPractice.domain})
                </p>
              </div>
              <Link
                href="/practice"
                className="shrink-0 text-sm font-semibold text-white bg-brand-navy px-5 py-2.5 rounded-full hover:bg-brand-navy/90 transition-colors"
              >
                Practice this skill
              </Link>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <ProfileColumn title="Strong" color="green" items={data.blueMindProfile.strong} />
            <ProfileColumn title="Improving" color="amber" items={data.blueMindProfile.improving} />
            <ProfileColumn title="Needs practice" color="red" items={data.blueMindProfile.needsPractice} />
          </div>
        </>
      )}
    </div>
  );
}

function ProfileColumn({
  title,
  color,
  items,
}: {
  title: string;
  color: "green" | "amber" | "red";
  items: { skill: string; accuracyPct: number }[];
}) {
  const dot = color === "green" ? "bg-brand-green" : color === "amber" ? "bg-brand-amber" : "bg-brand-red";
  return (
    <div className="card p-5">
      <p className="text-sm font-bold text-brand-navy mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-brand-slate">Not enough data yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.skill} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <span className="truncate text-brand-navy">{item.skill}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand-slate tabular-nums">{item.accuracyPct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChartBarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
