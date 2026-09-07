"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookMarked, BookOpen, ChartNoAxesCombined, FileText, LogOut, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useTheme } from "./AppShell";
export const NAV_ITEMS = [
  { href: "/mocks", label: "Mock Tests", icon: FileText },
  { href: "/practice", label: "Question Bank", icon: BookOpen },
  { href: "/mistakes", label: "Mistakes Notebook", icon: NotebookPen },
  { href: "/vocabulary", label: "Vocabulary", icon: BookMarked },
  { href: "/progress", label: "Progress", icon: ChartNoAxesCombined },
];
type Profile = { userName?: string | null; isAdmin?: boolean; avatarData?: string | null; guest?: boolean };
function Avatar({ avatarData, userName }: Profile) {
  return <span className="avatar">{avatarData ? <img src={avatarData} alt="" className="w-full h-full object-cover" /> : userName ? userName[0].toUpperCase() : <UserRound size={18} />}</span>;
}
export function Sidebar({ collapsed, onToggleCollapsed, ...profile }: Profile & { collapsed: boolean; onToggleCollapsed: () => void }) {
  const pathname = usePathname(); const router = useRouter(); const { dark, toggleDark } = useTheme();
  const items = profile.isAdmin ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck }] : NAV_ITEMS;
  async function logout() { const response = await fetch("/api/auth/logout", { method: "POST" }); if (response.ok) { router.push("/login"); router.refresh(); } }
  return <aside className={`app-sidebar hidden md:flex flex-col shrink-0 h-screen sticky top-0 ${collapsed ? "w-[76px]" : "w-[240px]"}`}>
    <Link href={profile.guest ? "/" : "/mocks"} aria-label="BlueMind home" className={`h-20 flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-6"}`}>
      <img src="/logo.png" alt="" width={30} height={30} className="shrink-0" />{!collapsed && <span className="text-lg font-extrabold text-brand-navy tracking-tight">BlueMind<span className="text-brand-blue">.</span></span>}
    </Link>
    <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1.5">
      {!collapsed && <p className="eyebrow px-3 mb-4">Your workspace</p>}
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href) || (href === "/mocks" && pathname === "/");
        return <Link key={href} href={profile.guest ? href === "/mocks" ? "/" : "/login" : href} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={`nav-link ${active ? "nav-active" : ""} ${collapsed ? "justify-center px-0" : "px-3"}`}><Icon size={20} strokeWidth={1.8} />{!collapsed && <span>{label}</span>}</Link>;
      })}
    </nav>
    <div className="p-3 border-t border-brand-border space-y-1.5">
      <button onClick={toggleDark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={`nav-link w-full ${collapsed ? "justify-center px-0" : "px-3"}`}>{dark ? <Sun size={19} /> : <Moon size={19} />}{!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}</button>
      <Link href={profile.guest ? "/login" : "/account"} aria-label={profile.guest ? "Sign in" : "Your account"} title={profile.guest ? "Sign in" : "Your account"} className={`flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 ${collapsed ? "justify-center" : ""}`}><Avatar {...profile} />{!collapsed && <div className="min-w-0"><p className="text-sm font-semibold text-brand-navy truncate">{profile.guest ? "Sign in" : profile.userName ?? "Your account"}</p><p className="text-xs text-brand-slate">{profile.guest ? "Save your progress" : "Account settings"}</p></div>}</Link>
      <div className="flex gap-1">
        {!profile.guest && <button onClick={logout} title="Log out" aria-label="Log out" className="sidebar-utility"><LogOut size={17} /></button>}
        <button onClick={onToggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-utility flex-1">{collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>Collapse</span></>}</button>
      </div>
    </div>
  </aside>;
}
export function MobileTopBar(profile: Profile) {
  const pathname = usePathname(); const { dark, toggleDark } = useTheme();
  return <header className="mobile-header md:hidden sticky top-0 z-40 border-b border-brand-border">
    <div className="h-16 px-4 flex items-center justify-between">
      <Link href={profile.guest ? "/" : "/mocks"} className="flex items-center gap-2 font-extrabold text-brand-navy"><img src="/logo.png" alt="" width={25} height={25} />BlueMind<span className="text-brand-blue -ml-2">.</span></Link>
      <div className="flex items-center gap-2"><button onClick={toggleDark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="sidebar-utility">{dark ? <Sun size={19} /> : <Moon size={19} />}</button><Link href={profile.guest ? "/login" : "/account"} aria-label={profile.guest ? "Sign in" : "Your account"}><Avatar {...profile} /></Link></div>
    </div>
    <nav aria-label="Main navigation" className="flex gap-1 px-3 pb-3 overflow-x-auto">
      {[...NAV_ITEMS, ...(profile.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : [])].map(({ href, label }) => {
        const active = pathname?.startsWith(href) || (href === "/mocks" && pathname === "/");
        return <Link key={href} href={profile.guest ? href === "/mocks" ? "/" : "/login" : href} aria-current={active ? "page" : undefined} className={`flex-1 text-center rounded-lg px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${active ? "bg-brand-blue-light text-brand-blue" : "text-brand-slate"}`}>{label}</Link>;
      })}
    </nav>
  </header>;
}
