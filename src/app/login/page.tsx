"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppTheme } from "@/lib/theme";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { BrandLockup } from "@/components/BrainLogo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { nextFromLocation } from "@/lib/next-path";

function ArrowLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { dark, toggleDark } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // A shared question link sends people here as ?next=/q/<id>; carry it
  // through sign-in (and across the login ↔ signup links) so they land
  // on the question instead of the dashboard.
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => setNext(nextFromLocation()), []);

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
      router.push(nextFromLocation() ?? "/today");
      router.refresh();
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={["auth-shell min-h-screen flex items-center justify-center px-4 py-12", dark ? "app-dark" : ""].join(" ")}>
      <button onClick={toggleDark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="fixed right-5 top-5 sidebar-utility">{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
      <div className="auth-rise w-full max-w-sm">
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
        <div className="card auth-card p-7 sm:p-9">
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-navy mb-1.5">Welcome back</h1>
          <p className="text-sm text-brand-slate mb-6">Log in to continue your SAT prep.</p>

          {error && (
            <div role="alert" className="mb-4 px-3 py-2 rounded-lg bg-brand-red-light text-brand-red text-sm">
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
                className="w-full px-3.5 py-3 rounded-xl border border-brand-border focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15 outline-none text-sm transition motion-reduce:transition-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-navy mb-1.5" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-11 py-3 rounded-xl border border-brand-border focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15 outline-none text-sm transition motion-reduce:transition-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-brand-slate hover:text-brand-navy"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 !rounded-xl">
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
            <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="text-brand-blue font-medium hover:underline">
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
