"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Sidebar, MobileTopBar } from "./Sidebar";
import { useAppTheme } from "@/lib/theme";
const ThemeContext = createContext({ dark: false, toggleDark: () => {} });
export function useTheme() { return useContext(ThemeContext); }
export function AppShell({ userName, isAdmin = false, avatarData, guest = false, children }: {
  userName?: string | null; isAdmin?: boolean; avatarData?: string | null; guest?: boolean; children: React.ReactNode;
}) {
  const theme = useAppTheme();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("bluemind-sidebar-collapsed") === "1"); } catch {} }, []);
  function toggleCollapsed() { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("bluemind-sidebar-collapsed", next ? "1" : "0"); } catch {} }
  const profile = { userName, isAdmin, avatarData, guest };
  return <ThemeContext.Provider value={theme}>
    <div className={`app-shell min-h-screen ${theme.dark ? "app-dark dark" : ""}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="flex"><Sidebar {...profile} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        <div className="flex-1 min-w-0"><MobileTopBar {...profile} />
          <main id="main-content" className="app-content max-w-7xl mx-auto px-4 sm:px-7 lg:px-10 py-7 sm:py-10" tabIndex={-1}>{children}</main>
        </div>
      </div>
    </div>
  </ThemeContext.Provider>;
}
