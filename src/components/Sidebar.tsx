"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./AppShell";

const NAV_ITEMS = [
  { href: "/mocks", label: "Mocks", icon: DocIcon },
  { href: "/practice", label: "Question Bank", icon: LayersIcon },
  { href: "/coach", label: "Coach", icon: CoachIcon },
  { href: "/progress", label: "Your Data", icon: ChartIcon },
];

export function Sidebar({
  userName,
  isAdmin,
  avatarData,
  collapsed,
  onToggleCollapsed,
}: {
  userName?: string | null;
  isAdmin?: boolean;
  avatarData?: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark } = useTheme();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r border-brand-border bg-white transition-[width] duration-150 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <Link href="/mocks" className="flex items-center gap-2 pl-5 pr-3 h-16 shrink-0 border-b border-brand-border overflow-hidden">
        <span className="shrink-0">
          <img
            src="/logo.png"
            alt=""
            width={24}
            height={24}
            style={{
              objectFit: "contain",
              filter: dark ? "brightness(1.6) saturate(1.3) drop-shadow(0 0 5px rgba(255,255,255,0.25))" : undefined,
            }}
          />
        </span>
        {!collapsed && <span className="text-[15px] font-extrabold text-brand-navy tracking-tight whitespace-nowrap">BlueMind</span>}
      </Link>

      <nav className={`flex-1 overflow-y-auto py-4 space-y-2 ${collapsed ? "px-2.5" : "px-3"}`}>
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center rounded-2xl text-base font-semibold transition-all duration-200 ${
                collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3"
              } ${
                active
                  ? "bg-brand-blue-light text-brand-blue"
                  : "text-brand-slate hover:text-brand-navy hover:bg-slate-100"
              }`}
            >
              <span className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? "" : "group-hover:text-amber-500"}`}>
                <Icon />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            title={collapsed ? "Admin" : undefined}
            className={`group flex items-center rounded-2xl text-base font-semibold transition-all duration-200 ${
              collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3"
            } ${
              pathname?.startsWith("/admin")
                ? "bg-brand-blue-light text-brand-blue"
                : "text-brand-slate hover:text-brand-navy hover:bg-slate-100"
            }`}
          >
            <span className="shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:text-amber-500">
              <ShieldIcon />
            </span>
            {!collapsed && <span>Admin</span>}
          </Link>
        )}
      </nav>

      <div className="border-t border-brand-border p-3 space-y-2 shrink-0">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          {!collapsed && (
            <Link
              href="/account"
              className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              {avatarData ? (
                <img
                  src={avatarData}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-brand-border"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-brand-blue text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {(userName?.[0] ?? "S").toUpperCase()}
                </span>
              )}
              <span className="min-w-0 truncate text-sm font-medium text-brand-navy">{userName ?? "Profile"}</span>
            </Link>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-brand-red hover:bg-brand-red-light"
          >
            Log out
          </button>
        )}

        <button
          onClick={onToggleCollapsed}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-brand-slate border border-brand-border hover:bg-slate-50"
        >
          <ChevronIcon collapsed={collapsed} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}

/** Compact top bar shown only below the md breakpoint, where the sidebar is
 * hidden entirely — keeps mobile navigable without duplicating the whole
 * sidebar as an overlay. */
export function MobileTopBar({ userName, isAdmin, avatarData }: { userName?: string | null; isAdmin?: boolean; avatarData?: string | null }) {
  const pathname = usePathname();
  const { dark } = useTheme();
  return (
    <header className="md:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-brand-border">
      <div className="px-4 h-14 flex items-center justify-between">
        <Link href="/mocks" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt=""
            width={22}
            height={22}
            style={{
              objectFit: "contain",
              filter: dark ? "brightness(1.6) saturate(1.3) drop-shadow(0 0 5px rgba(255,255,255,0.25))" : undefined,
            }}
          />
          <span className="font-bold text-brand-navy text-sm">BlueMind</span>
        </Link>
        <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-semibold flex items-center justify-center overflow-hidden shrink-0">
          {avatarData ? (
            <img src={avatarData} alt="" className="w-full h-full object-cover" />
          ) : (
            (userName?.[0] ?? "S").toUpperCase()
          )}
        </span>
      </div>
      <nav className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                active ? "bg-brand-blue-light text-brand-blue" : "text-brand-navy/70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link href="/admin" className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-brand-navy/70">
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}

function DocIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M6 3h9l3 3v15H6V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5M3 8l9 5 9-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function CoachIcon() {
  // Person (bottom-left) + a chat bubble with an ellipsis (top-right), with
  // real breathing room between them — previously the bubble sat right up
  // against the head with almost no gap, so at small sizes it looked fused
  // together instead of like two separate shapes.
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 20.5c0-3.6 2.2-6.3 5-6.3s5 2.7 5 6.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="14" y="2" width="9" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16.2 8.5l-1.3 2.6v-2.6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="16.2" cy="5.25" r="0.9" fill="currentColor" />
      <circle cx="18.5" cy="5.25" r="0.9" fill="currentColor" />
      <circle cx="20.8" cy="5.25" r="0.9" fill="currentColor" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 16c.7-1.6 2-2.4 3-2.4s2.3.8 3 2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={collapsed ? "rotate-180" : ""}>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
