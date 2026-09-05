"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Sidebar, MobileTopBar } from "./Sidebar";
import { BrainWatermark } from "./BrainLogo";
import { TextWatermarkOverlay } from "./TextWatermarkOverlay";

const THEME_KEY = "bluemind-app-theme";
const COLLAPSE_KEY = "bluemind-sidebar-collapsed";

/** Shared dark-mode state, readable from any page inside the signed-in app
 * (not just the Sidebar) — e.g. the Mocks page renders its own toggle next
 * to the Math/Reading & Writing switcher, in sync with the Sidebar's. */
const ThemeContext = createContext<{ dark: boolean; toggleDark: () => void }>({
  dark: false,
  toggleDark: () => {},
});
export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Client wrapper for the whole signed-in app shell — persistent left
 * sidebar (desktop) + compact top bar (mobile), owns the dark/light toggle
 * for every dashboard page. Same underlying trick as the exam page's
 * `.exam-dark`: a class on the wrapper overrides the same Tailwind utility
 * classes already used everywhere (see `.app-dark` in globals.css) instead
 * of needing a `dark:` variant on every element.
 *
 * Defaults to light ("sun mode") on a student's very first visit (no
 * stored preference yet) — after that, whatever they last chose sticks,
 * same as the exam page's own toggle, which reads this same key so the
 * two stay in sync.
 */
export function AppShell({
  userName,
  isAdmin,
  avatarData,
  children,
}: {
  userName: string;
  isAdmin: boolean;
  avatarData?: string | null;
  children: React.ReactNode;
}) {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    setDark(stored === "1");
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    setReady(true);
  }, []);

  function toggleDark() {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem(THEME_KEY, next ? "1" : "0");
      return next;
    });
  }
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ dark, toggleDark }}>
      <div
        className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
          dark ? "app-dark bg-[#0b1220]" : "bg-brand-bg"
        } ${ready ? "" : "invisible"}`}
      >
        <BrainWatermark className="fixed top-0 right-0 z-0" size={260} opacity={dark ? 0.14 : 0.06} dark={dark} />
        <BrainWatermark className="fixed -bottom-24 -left-24 z-0" size={340} opacity={dark ? 0.1 : 0.04} dark={dark} />
        <TextWatermarkOverlay dark={dark} />
        <div className="relative z-10 flex">
          <Sidebar
            userName={userName}
            isAdmin={isAdmin}
            avatarData={avatarData}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
          <div className="flex-1 min-w-0">
            <MobileTopBar userName={userName} isAdmin={isAdmin} avatarData={avatarData} />
            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 transition-opacity duration-300">{children}</main>
          </div>
        </div>
      </div>
    </ThemeContext.Provider>
  );
}
