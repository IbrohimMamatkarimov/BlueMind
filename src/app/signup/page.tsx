"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/BrainLogo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
        <div className="flex justify-center mb-8">
          <BrandLockup size={32} />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-bold text-brand-navy mb-1">Create your free account</h1>
          <p className="text-sm text-brand-slate mb-6">Everything in BlueMind is free — no card required.</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-brand-red-light text-brand-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-navy mb-1.5" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm"
                placeholder="Your name"
              />
            </div>
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm"
                placeholder="At least 8 characters"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-brand-border flex-1" />
            <span className="text-xs text-brand-slate">or</span>
            <div className="h-px bg-brand-border flex-1" />
          </div>

          <GoogleSignInButton />

          <p className="mt-6 text-center text-sm text-brand-slate">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-blue font-medium hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
