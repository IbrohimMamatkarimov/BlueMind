"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn } from "lucide-react";
import { AppShell } from "./AppShell";
import { MockCatalog } from "./MockCatalog";

const FAILED_KEY = "bluemind-guest-start-failed";

// Visitors who aren't signed in are guests: there is no "continue as guest"
// choice. A guest session starts on arrival and sends them to their workspace.
// If it can't start (service down, blocked cookies) the catalog stays visible
// with clear sign-in options, and we don't retry again in this tab.
export function PublicLanding({ signedIn, userName }: { signedIn: boolean; userName: string | null }) {
  const router = useRouter();
  const [starting, setStarting] = useState(!signedIn);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (signedIn) return;
    let skip = false;
    try {
      skip = window.sessionStorage.getItem(FAILED_KEY) === "1" || navigator.webdriver === true;
    } catch {}
    if (skip) {
      setStarting(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/guest", { method: "POST" })
      .then((response) => {
        if (!response.ok) throw new Error("guest start failed");
        if (cancelled) return;
        router.replace("/today");
        router.refresh();
      })
      .catch(() => {
        try { window.sessionStorage.setItem(FAILED_KEY, "1"); } catch {}
        if (cancelled) return;
        setStarting(false);
        setFailed(true);
      });
    return () => { cancelled = true; };
  }, [signedIn, router]);

  return (
    <AppShell guest={!signedIn} userName={userName}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <p className="font-bold text-brand-navy">{starting ? "Opening your workspace…" : "Welcome to BlueMind"}</p>
          <p className="mt-1 text-sm text-brand-slate">
            {failed
              ? "Practice tools are temporarily unavailable. You can still sign in to continue."
              : "Sign in to save your scores and pick up where you left off."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/signup" className="rounded-xl border border-brand-border px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50 motion-reduce:transition-none">Create account</Link>
          <Link href="/login" className="btn-primary group inline-flex items-center gap-2"><LogIn size={16} />Sign in<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></Link>
        </div>
      </div>
      <MockCatalog guest={!signedIn} />
    </AppShell>
  );
}
