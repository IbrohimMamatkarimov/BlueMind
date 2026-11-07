"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { MockCatalog } from "./MockCatalog";
export function PublicLanding({ signedIn, userName }: { signedIn: boolean; userName: string | null }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  async function continueAsGuest() {
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/guest", { method: "POST" });
      if (!response.ok) throw new Error("Guest access is temporarily unavailable. Please try again.");
      router.push("/today");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start guest access.");
      setStarting(false);
    }
  }
  return <AppShell guest={!signedIn} userName={userName}><div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-sm"><div><p className="font-bold text-brand-navy">Explore BlueMind</p><p className="mt-1 text-sm text-brand-slate">Try the Question Bank, notebook, vocabulary and progress tools as a guest.</p>{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div><button type="button" onClick={continueAsGuest} disabled={starting} className="btn-primary shrink-0">{starting ? "Opening workspace…" : "Explore as guest"}</button></div><MockCatalog guest={!signedIn} /></AppShell>;
}
