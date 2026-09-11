import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSharedQuestionMeta, openSharedQuestionSet } from "@/lib/shared-question";
import { BrandLockup } from "@/components/BrainLogo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Every visit depends on who is signed in — never cache this page.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { questionId: string } }): Promise<Metadata> {
  const meta = await getSharedQuestionMeta(params.questionId).catch(() => null);
  if (!meta) return { title: "Shared SAT question · BlueMind" };
  const title = `Can you solve this SAT question? ${meta.skill} · ${meta.difficulty}`;
  const description = `A friend shared a ${meta.section} question with you on BlueMind. Solve it, check your answer, and compare notes.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "BlueMind", type: "website" },
    robots: { index: false },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <BrandLockup size={32} />
        </div>
        <div className="card p-7 sm:p-9">{children}</div>
      </div>
    </div>
  );
}

const DIFFICULTY_CHIP: Record<string, string> = {
  Easy: "bg-brand-green-light text-brand-green",
  Medium: "bg-brand-amber-light text-brand-amber",
  Hard: "bg-brand-red-light text-brand-red",
};

export default async function SharedQuestionPage({ params }: { params: { questionId: string } }) {
  const meta = await getSharedQuestionMeta(params.questionId);
  if (!meta) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-brand-navy mb-2">This question isn&apos;t available</h1>
        <p className="text-sm text-brand-slate mb-6">
          The link may be mistyped, or the question was removed from the question bank.
        </p>
        <Link href="/practice" className="btn-primary w-full text-center">
          Open the question bank
        </Link>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (user) {
    const href = await openSharedQuestionSet(user.id, meta);
    if (href) redirect(href);
    return (
      <Shell>
        <h1 className="text-xl font-bold text-brand-navy mb-2">We couldn&apos;t open this question</h1>
        <p className="text-sm text-brand-slate mb-6">Please try the link again in a moment.</p>
        <Link href="/practice" className="btn-secondary w-full text-center">
          Back to the question bank
        </Link>
      </Shell>
    );
  }

  const next = `/q/${encodeURIComponent(meta.id)}`;
  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue mb-2">A friend shared a question with you</p>
      <h1 className="text-2xl font-bold text-brand-navy mb-4">Can you solve it?</h1>
      <div className="flex flex-wrap gap-2 mb-5">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-brand-navy">{meta.section}</span>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-brand-navy">{meta.skill}</span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${DIFFICULTY_CHIP[meta.difficulty] ?? "bg-slate-100 text-brand-navy"}`}>
          {meta.difficulty}
        </span>
      </div>
      <p className="text-sm text-brand-slate mb-6">
        Sign in to open the question, check your answer and read the explanation. Then compare notes with your friend.
      </p>
      <div className="space-y-3">
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn-primary w-full text-center block">
          Create a free account
        </Link>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-secondary w-full text-center block">
          Log in
        </Link>
      </div>
      <div className="flex items-center gap-3 my-5">
        <div className="h-px bg-brand-border flex-1" />
        <span className="text-xs text-brand-slate">or</span>
        <div className="h-px bg-brand-border flex-1" />
      </div>
      <GoogleSignInButton next={next} />
    </Shell>
  );
}
