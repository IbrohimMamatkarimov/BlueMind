"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLockup } from "./BrainLogo";

const NAV_ITEMS = [
  { href: "/mocks", label: "Mocks" },
  { href: "/practice", label: "Practice" },
  { href: "/coach", label: "Coach" },
  { href: "/progress", label: "Progress" },
];

export function Navbar({
  userName,
  isAdmin,
  darkMode,
  onToggleDark,
}: {
  userName?: string | null;
  isAdmin?: boolean;
  darkMode?: boolean;
  onToggleDark?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-brand-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/mocks" className="shrink-0">
          <BrandLockup size={26} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-blue-light text-brand-blue"
                    : "text-brand-navy/70 hover:text-brand-navy hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname?.startsWith("/admin")
                  ? "bg-brand-blue-light text-brand-blue"
                  : "text-brand-navy/70 hover:text-brand-navy hover:bg-slate-50"
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {onToggleDark && (
            <button
              onClick={onToggleDark}
              title={darkMode ? "Switch to light background" : "Switch to dark background"}
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                darkMode
                  ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                  : "border-brand-border text-brand-navy hover:bg-slate-50"
              }`}
            >
              <MoonIcon />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-brand-border hover:bg-slate-50 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-semibold flex items-center justify-center">
                {(userName?.[0] ?? "S").toUpperCase()}
              </span>
              <span className="hidden sm:inline text-sm font-medium text-brand-navy">
                {userName ?? "Profile"}
              </span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 card p-1.5"
                role="menu"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <Link
                  href="/progress"
                  className="block px-3 py-2 rounded-lg text-sm text-brand-navy hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Your BlueMind
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-brand-red hover:bg-brand-red-light"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                active ? "bg-brand-blue-light text-brand-blue" : "text-brand-navy/70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
              pathname?.startsWith("/admin") ? "bg-brand-blue-light text-brand-blue" : "text-brand-navy/70"
            }`}
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.5 14.2A8.5 8.5 0 119.8 3.5a7 7 0 0010.7 10.7z" fill="currentColor" />
    </svg>
  );
}
