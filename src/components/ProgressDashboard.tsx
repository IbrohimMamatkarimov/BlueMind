"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, PageHeader, StatCard } from "./ui";
import { summarizeProgress, StudyEntry } from "@/lib/progress-summary";

const RANGES = [{ label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "90 days", days: 90 }, { label: "All time", days: 0 }];
function reviewHref(entry: StudyEntry) {
  const path = entry.source === "mock" ? `/practice/${encodeURIComponent(entry.sourceId)}/${encodeURIComponent(entry.section)}/${entry.module}` : `/practice/qbank/${encodeURIComponent(entry.section)}/${encodeURIComponent(entry.sourceId)}`;
  return `${path}?review=1&history=${encodeURIComponent(entry.id)}`;
}

export function ProgressDashboard() {
  const [entries, setEntries] = useState<StudyEntry[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [days, setDays] = useState(0);
  const [section, setSection] = useState("All subjects");
  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/progress", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load your progress.");
      setEntries(data.entries);
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [reload]);
  const filtered = useMemo(() => (entries ?? []).filter((entry) => (section === "All subjects" || entry.section === section) && (!days || Date.parse(entry.completedAt) >= Date.now() - days * 86400000)), [entries, days, section]);
  const summary = useMemo(() => summarizeProgress(filtered), [filtered]);
  const trend = useMemo(() => {
    const dates = new Map<string, { correct: number; total: number }>();
    for (const entry of [...filtered].reverse()) {
      const date = entry.completedAt.slice(0, 10);
      const current = dates.get(date) ?? { correct: 0, total: 0 };
      current.correct += entry.correctCount; current.total += entry.total; dates.set(date, current);
    }
    return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, accuracy: Math.round(count.correct / count.total * 100) }));
  }, [filtered]);
  const next = summary.nextPractice;
  return <div className="space-y-6">
    <PageHeader eyebrow="See how far you have come" title="Your Progress" description="Your practice history, the skills you are building, and where to focus next." action={<Link href="/practice" className="btn-primary">Keep practicing <ArrowRight size={16} /></Link>} />
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex gap-1 p-1 bg-white border border-brand-border rounded-xl" aria-label="Date range">{RANGES.map((range) => <button key={range.days} aria-pressed={days === range.days} onClick={() => { setDays(range.days); setVisibleCount(10); }} className={`px-3 py-2 text-xs font-semibold rounded-lg ${days === range.days ? "bg-brand-blue-light text-brand-blue" : "text-brand-slate"}`}>{range.label}</button>)}</div>
      <label className="text-xs text-brand-slate flex items-center gap-2">Subject<select value={section} onChange={(event) => { setSection(event.target.value); setVisibleCount(10); }} className="border border-brand-border rounded-lg px-3 py-2.5 text-sm">{["All subjects", "Math", "Reading and Writing"].map((item) => <option key={item}>{item}</option>)}</select></label>
    </div>
    {error && <div role="alert" className="card p-5 flex items-center justify-between gap-4 text-sm text-brand-red"><p>{error}</p><button onClick={() => setReload((value) => value + 1)} className="btn-secondary">Try again</button></div>}
    {!entries && !error && <div role="status" aria-label="Loading progress" className="grid sm:grid-cols-3 gap-4">{[1, 2, 3].map((key) => <div key={key} className="h-36 rounded-2xl bg-slate-200 animate-pulse" />)}</div>}
    {entries && filtered.length === 0 && <EmptyState title={entries.length ? "No sessions in this view" : "Your next chapter starts with one session"} description={entries.length ? "Choose another subject or date range to see your practice." : "Complete a mock module or a Question Bank set. Your accuracy, history, and skill insights will appear here."}>{entries.length ? <button className="btn-secondary" onClick={() => { setSection("All subjects"); setDays(0); }}>Show all practice</button> : <Link href="/mocks" className="btn-primary">Explore mock tests <ArrowRight size={16} /></Link>}</EmptyState>}
    {filtered.length > 0 && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Question accuracy" value={`${summary.accuracy}%`} detail={`${summary.questions.toLocaleString()} questions across ${summary.sessions} sessions`} />
        {summary.sections.map((item) => <StatCard key={item.section} label={item.section === "Math" ? "Math accuracy" : "Reading & Writing accuracy"} value={item.accuracy === null ? "—" : `${item.accuracy}%`} detail={item.total ? `${item.total} questions practiced` : "Complete a session to get started"} />)}
        <StatCard label="Full exams completed" value={summary.fullExams} detail="All four modules in one sitting" />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-5">
        <section className="card p-5 sm:p-6 min-w-0" aria-label="Accuracy trend">
          <h2 className="text-base font-bold text-brand-navy">Practice over time</h2><p className="text-xs text-brand-slate mt-1">Daily question accuracy · includes repeat attempts</p>
          {trend.length > 1 ? <div className="h-64 mt-6" role="img" aria-label={`Daily accuracy from ${trend[0].accuracy}% to ${trend[trend.length - 1].accuracy}% across ${trend.length} practice days`}><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 14, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => new Date(value + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={36} /><YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12 }} formatter={(value) => [`${value}%`, "Accuracy"]} /><Line type="linear" dataKey="accuracy" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: "#2563eb" }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <div className="h-64 flex flex-col items-center justify-center text-center text-brand-slate"><TrendingUp size={30} className="text-brand-blue mb-3" /><p className="text-sm font-medium text-brand-navy">A strong start to your story</p><p className="text-xs mt-2 max-w-xs">Practice on another day to see how your accuracy changes.</p></div>}
        </section>
        <section className="card p-6 flex flex-col"><p className="eyebrow">Your next step</p><h2 className="text-xl font-bold text-brand-navy">{next ? "Give this skill some attention" : "Keep building your foundation"}</h2><p className="text-sm text-brand-slate mt-3 leading-relaxed">{next ? `${next.skill}: ${next.accuracy}% accuracy across ${next.attempted} questions. A focused set can help you spot the patterns.` : "Try a few more questions in each skill to build a clearer picture of your strengths."}</p><Link className="btn-primary mt-auto self-start !mt-6" href={next ? `/practice/browse?section=${encodeURIComponent(next.section)}&skill=${encodeURIComponent(next.skill)}` : "/practice"}>{next ? "Practice this skill" : "Choose a skill"}<ArrowRight size={16} /></Link></section>
      </div>
      <section className="card p-5 sm:p-6"><h2 className="text-base font-bold text-brand-navy">Skills in focus</h2><p className="text-xs text-brand-slate mt-1 mb-5">Accuracy across your selected sessions. More attempts give a clearer picture.</p><div className="grid md:grid-cols-2 gap-x-8 gap-y-5">{summary.skills.slice(0, 8).map((skill) => <Link href={`/practice/browse?section=${encodeURIComponent(skill.section)}&skill=${encodeURIComponent(skill.skill)}`} key={skill.section + skill.skill} className="group"><div className="flex justify-between gap-3 mb-2"><span className="text-sm font-medium text-brand-navy group-hover:text-brand-blue">{skill.skill}</span><span className="text-xs text-brand-slate shrink-0">{skill.accuracy}% · {skill.attempted} questions</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${skill.accuracy >= 80 ? "bg-brand-green" : skill.accuracy >= 60 ? "bg-brand-blue" : "bg-brand-amber"}`} style={{ width: `${skill.accuracy}%` }} /></div></Link>)}</div></section>
      <section className="card overflow-hidden"><div className="p-5 sm:p-6 border-b border-brand-border"><h2 className="text-base font-bold text-brand-navy">Practice history</h2><p className="text-xs text-brand-slate mt-1">Every new submission is saved, including retakes.</p></div><div className="divide-y divide-brand-border">{filtered.slice(0, visibleCount).map((entry) => <Link href={reviewHref(entry)} key={entry.source + entry.id} className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-brand-navy truncate">{entry.title}</p><p className="text-xs text-brand-slate mt-1">{entry.section === "Reading and Writing" ? "Reading & Writing" : entry.section}{entry.module ? ` · Module ${entry.module}` : ""} · {new Date(entry.completedAt).toLocaleDateString()}{entry.fullExamId ? " · Full exam" : ""}</p></div><div className="text-right shrink-0"><p className="text-sm font-bold text-brand-navy tabular-nums">{entry.correctCount}/{entry.total}</p><p className="text-xs font-medium text-brand-blue mt-1">Review →</p></div></Link>)}</div>{visibleCount < filtered.length && <div className="p-4 border-t border-brand-border text-center"><button className="btn-secondary" onClick={() => setVisibleCount((value) => value + 10)}>Show more sessions</button></div>}</section>
      <p className="text-xs text-brand-slate leading-relaxed">These percentages measure question accuracy. Older activity includes only the results that were previously saved; earlier overwritten retakes cannot be recovered.</p>
    </>}
  </div>;
}
