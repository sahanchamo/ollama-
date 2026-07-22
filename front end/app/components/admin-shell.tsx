"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type IconName = "grid" | "users" | "key" | "chart" | "settings" | "lock" | "book" | "chat" | "logout";
const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/users", label: "People", icon: "users" },
  { href: "/api-keys", label: "API access", icon: "key" },
  { href: "/analytics", label: "Usage & limits", icon: "chart" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
  { href: "/admin/reset-password", label: "Password reset", icon: "lock" },
];

function Icon({ name }: { name: IconName }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.8 9.8M15 6l3 3M18 3l3 3" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 6-8" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06A1.7 1.7 0 0 0 15.74 18a1.7 1.7 0 0 0-1.03 1.55V20h-3v-.45A1.7 1.7 0 0 0 10.68 18a1.7 1.7 0 0 0-1.88 1l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.03H5v-3h.45A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.32-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.68 7a1.7 1.7 0 0 0 1.03-1.55V5h3v.45A1.7 1.7 0 0 0 15.74 7a1.7 1.7 0 0 0 1.88-1.06l.06-.06L19.8 8l-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.55 1.03H21v3h-.05A1.7 1.7 0 0 0 19.4 15Z" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    chat: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]">{paths[name]}</svg>;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [email, setEmail] = useState("Administrator");
  useEffect(() => { const saved = sessionStorage.getItem("ollama_gateway_user"); if (saved) setEmail(JSON.parse(saved).email || "Administrator"); }, []);
  const isCurrent = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const signOut = () => { sessionStorage.removeItem("ollama_gateway_token"); sessionStorage.removeItem("ollama_gateway_user"); router.replace("/login"); };
  return <div className="admin-shell-layout min-h-screen bg-[#10131a] text-slate-100 md:pl-64">
    <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#151920]/95 px-2 py-2 backdrop-blur md:inset-y-0 md:left-0 md:right-auto md:w-64 md:border-r md:border-t-0 md:px-3 md:py-5">
      <Link href="/" className="mb-8 hidden items-center gap-2.5 px-2 text-lg font-bold tracking-[-.04em] text-white md:flex"><img src="/icon.svg" alt="Starlen" className="size-8 rounded-lg" />starlen</Link>
      <p className="mb-2 hidden px-2 text-[10px] font-bold uppercase tracking-[.13em] text-slate-500 md:block">Administration</p>
      <nav className="mx-auto flex max-w-lg items-center justify-around gap-1 md:grid md:max-w-none md:justify-stretch">{links.map((link) => <Link key={link.href} href={link.href} title={link.label} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isCurrent(link.href) ? "bg-[oklch(78.9%_0.154_211.53_/_0.16)] text-[oklch(86%_0.11_211.53)]" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}><Icon name={link.icon} /><span className="hidden md:inline">{link.label}</span></Link>)}</nav>
      <div className="mt-auto hidden border-t border-white/10 pt-4 md:block"><p className="truncate px-2 text-xs font-medium text-slate-300">{email}</p><p className="px-2 pt-1 text-[11px] text-[oklch(78.9%_0.154_211.53)]">Administrator</p><div className="mt-4 grid gap-1"><Link href="/documentation" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"><Icon name="book" />Documentation</Link><Link href="/chat" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"><Icon name="chat" />Open workspace</Link><button onClick={signOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"><Icon name="logout" />Sign out</button></div></div>
    </aside>
    <div className="pb-20 md:pb-0">{children}</div>
  </div>;
}
