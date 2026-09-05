"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/BrainLogo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

function ArrowLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/mocks");
      router.refresh();
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-brand-bg">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-slate hover:text-brand-navy mb-6"
        >
          <ArrowLeftIcon />
          Back
        </Link>
        <div className="flex justify-center mb-8">
          <BrandLockup size={32} />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-bold text-brand-navy mb-1">Welcome back</h1>
          <p className="text-sm text-brand-slate mb-6">Log in to continue your SAT prep.</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-brand-red-light text-brand-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-navy mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-navy mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-brand-border flex-1" />
            <span className="text-xs text-brand-slate">or</span>
            <div className="h-px bg-brand-border flex-1" />
          </div>

          <GoogleSignInButton />

          <p className="mt-6 text-center text-sm text-brand-slate">
            New to BlueMind?{" "}
            <Link href="/signup" className="text-brand-blue font-medium hover:underline">
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
