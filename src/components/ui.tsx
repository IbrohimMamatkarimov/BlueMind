import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, Calculator, Send } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</div>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="card px-6 py-12 text-center flex flex-col items-center"><span className="mb-5 grid place-items-center rounded-2xl bg-brand-blue-light text-brand-blue w-12 h-12"><BookOpen size={23} /></span><h2 className="text-xl font-bold text-brand-navy">{title}</h2><p className="text-sm text-brand-slate max-w-md mt-2 mb-6 leading-relaxed">{description}</p>{children}</div>;
}
export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className="card p-5 sm:p-6"><p className="text-xs font-semibold text-brand-slate">{label}</p><p className="text-3xl font-bold tracking-tight text-brand-navy mt-3 tabular-nums">{value}</p>{detail && <p className="text-xs text-brand-slate mt-2">{detail}</p>}</div>;
}
export function SubjectCard({ section, solved, total, onClick }: { section: string; solved: number; total: number; onClick: () => void }) {
  const math = section === "Math";
  const Icon = math ? Calculator : BookOpen;
  const percent = total ? Math.min(100, Math.round(solved / total * 100)) : 0;
  return <button onClick={onClick} className="subject-card card text-left p-6 sm:p-7 group">
    <div className="flex items-center justify-between"><span className={`subject-icon ${math ? "subject-math" : "subject-reading"}`}><Icon size={25} /></span><ArrowUpRight size={21} className="text-brand-slate group-hover:text-brand-blue" /></div>
    <h2 className="text-xl font-bold text-brand-navy mt-6">{math ? "Math" : "Reading & Writing"}</h2><p className="text-sm text-brand-slate mt-2">{math ? "Build confidence with equations, data, and geometry." : "Strengthen comprehension, grammar, and expression."}</p>
    <div className="flex justify-between text-xs text-brand-slate mt-7 mb-2"><span>{solved.toLocaleString()} of {total.toLocaleString()} questions solved</span><span>{percent}%</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-blue rounded-full" style={{ width: `${percent}%` }} /></div><p className="text-sm font-semibold text-brand-blue mt-5">Choose your topics <span aria-hidden="true">→</span></p>
  </button>;
}
export function CommunityLink() {
  return <a href="https://t.me/bluemind_uz" target="_blank" rel="noreferrer" className="community-link"><Send size={18} /><span>New mocks, updates, and support <strong className="font-semibold text-brand-navy">@bluemind_uz</strong></span><ArrowUpRight size={16} className="ml-auto shrink-0" /></a>;
}
