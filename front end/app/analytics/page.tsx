"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UserUsage = { id: string; email: string; input_tokens: number; output_tokens: number; total_tokens: number; request_count: number };
type Overview = { users: UserUsage[] };
type Analytics = { days: number; active_key_count: number; revoked_key_count: number; daily: { day: string; request_count: number; input_tokens: number; output_tokens: number }[]; models: { model: string; request_count: number; total_tokens: number; average_duration_ms: number }[]; recent: { id: string; email: string; model: string; input_tokens: number; output_tokens: number; status: string; created_at: string }[] };
type Quota = { user_id: string; email: string; monthly_token_limit: number | null; monthly_tokens_used: number; remaining_tokens: number | null };

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function AnalyticsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("Loading analytics…");
  const header = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...header, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }
  async function load() {
    try {
      const [nextOverview, nextAnalytics, nextQuotas] = await Promise.all([api("/admin/overview"), api(`/admin/analytics?days=${days}`), api("/admin/quotas")]);
      setOverview(nextOverview); setAnalytics(nextAnalytics); setQuotas(nextQuotas); setNotice(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) { setNotice(`Analytics error: ${(error as Error).message}`); }
  }
  async function saveQuota(quota: Quota) {
    const raw = drafts[quota.user_id] ?? (quota.monthly_token_limit?.toString() || "");
    const limit = raw.trim() ? Number(raw) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1000)) { setNotice("Token limit must be at least 1,000, or leave blank for unlimited."); return; }
    try { await api(`/admin/users/${quota.user_id}/quota`, { method: "PUT", body: JSON.stringify({ monthly_token_limit: limit }) }); setNotice(`Quota saved for ${quota.email}.`); await load(); }
    catch (error) { setNotice(`Could not save quota: ${(error as Error).message}`); }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem("ollama_gateway_token");
    if (!saved) { router.replace("/login"); return; }
    void (async () => {
      const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } });
      const user = await response.json().catch(() => null);
      if (!response.ok || !user?.is_admin) { router.replace("/"); return; }
      setToken(saved);
    })();
  }, [router]);
  useEffect(() => { if (token) void load(); }, [token, days]);

  return <main className="min-h-screen bg-[#07111f] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl"><header className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between"><div><Link href="/" className="text-sm font-bold tracking-[.24em] text-violet-300">OLLAMA GATEWAY</Link><h1 className="mt-2 text-3xl font-bold">Analytics & controls</h1><p className="mt-1 text-sm text-slate-400">Usage trends, model operations, and enforceable user token limits.</p></div><div className="flex gap-2"><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select><button onClick={() => void load()} className="rounded bg-violet-500 px-4 py-2 text-sm font-semibold">Refresh</button></div></header><p className="mt-4 text-sm text-slate-400">{notice}</p>
  {analytics && <><section className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Daily token volume</h2><p className="text-sm text-slate-400">Input + generated tokens over {analytics.days} days</p><DailyBars values={analytics.daily} /></section><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Model analytics</h2><div className="mt-4 space-y-3">{analytics.models.map((model) => <div className="rounded-lg bg-slate-950 p-3" key={model.model}><div className="flex justify-between gap-3"><b className="truncate text-sm">{model.model}</b><span className="text-xs text-slate-400">{model.request_count} calls</span></div><div className="mt-2 flex justify-between text-xs text-slate-400"><span>{number.format(model.total_tokens)} tokens</span><span>{model.average_duration_ms.toLocaleString()} ms average</span></div></div>)}</div><div className="mt-5 flex gap-3 text-xs"><span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">{analytics.active_key_count} active keys</span><span className="rounded bg-slate-700 px-2 py-1 text-slate-300">{analytics.revoked_key_count} revoked</span></div></section></section>
  <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><UsageLeaderboard users={overview?.users || []} /><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Monthly token limits</h2><p className="text-sm text-slate-400">Blank = unlimited. Limits apply before each generation request.</p><div className="mt-4 max-h-[540px] space-y-3 overflow-auto">{quotas.map((quota) => <div key={quota.user_id} className="rounded-lg bg-slate-950 p-3"><div className="flex justify-between gap-3 text-sm"><b className="truncate">{quota.email}</b><span className="shrink-0 text-slate-400">Used {number.format(quota.monthly_tokens_used)}</span></div><div className="mt-3 flex gap-2"><input value={drafts[quota.user_id] ?? (quota.monthly_token_limit?.toString() || "")} onChange={(event) => setDrafts({ ...drafts, [quota.user_id]: event.target.value })} placeholder="Unlimited" type="number" min="1000" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" /><button onClick={() => void saveQuota(quota)} className="rounded bg-violet-500 px-3 py-1 text-sm">Save</button></div><p className="mt-2 text-xs text-slate-500">{quota.monthly_token_limit ? `${number.format(quota.remaining_tokens || 0)} tokens remaining this month` : "No monthly limit"}</p></div>)}</div></section></section>
  <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"><div className="p-5"><h2 className="font-semibold">Recent generation events</h2><p className="text-sm text-slate-400">Most recent 50 tracked responses</p></div><div className="max-h-96 overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Time</th><th>User</th><th>Model</th><th>Tokens</th><th>Status</th></tr></thead><tbody>{analytics.recent.map((event) => <tr className="border-t border-slate-800" key={event.id}><td className="p-4 text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</td><td>{event.email}</td><td>{event.model}</td><td>{number.format(event.input_tokens + event.output_tokens)}</td><td className={event.status === "complete" ? "text-emerald-300" : "text-amber-300"}>{event.status}</td></tr>)}</tbody></table></div></section></>}</div></main>;
}

function UsageLeaderboard({ users }: { users: UserUsage[] }) {
  const ranked = [...users].sort((a, b) => b.total_tokens - a.total_tokens);
  const maximum = Math.max(...ranked.map((user) => user.total_tokens), 1);
  const total = ranked.reduce((sum, user) => sum + user.total_tokens, 0);
  return <section className="usage-leaderboard"><header><div><p>Account activity</p><h2>Usage leaderboard</h2><span>All-time consumption across your workspace</span></div><div className="usage-total"><small>Total usage</small><b>{number.format(total)}</b><span>tokens</span></div></header><div className="usage-list">{ranked.map((user, index) => <article key={user.id} className={index < 3 ? "featured" : ""}><span className={`usage-rank rank-${Math.min(index + 1, 4)}`}>{String(index + 1).padStart(2, "0")}</span><span className="usage-avatar">{user.email.slice(0, 1).toUpperCase()}</span><div className="usage-details"><div><b title={user.email}>{user.email}</b><span>{user.request_count.toLocaleString()} request{user.request_count === 1 ? "" : "s"}</span></div><div className="usage-meter"><i style={{ width: `${user.total_tokens ? Math.max(user.total_tokens / maximum * 100, 1.5) : 0}%` }} /></div></div><div className="usage-value"><b>{number.format(user.total_tokens)}</b><span>tokens</span></div></article>)}{!ranked.length && <p className="py-8 text-center text-sm text-slate-400">No user activity yet.</p>}</div></section>;
}

function DailyBars({ values }: { values: Analytics["daily"] }) {
  const maximum = Math.max(...values.map((item) => item.input_tokens + item.output_tokens), 1);
  return <div className="daily-volume-chart"><div className="daily-volume-bars">{values.map((item) => {
    const tokens = item.input_tokens + item.output_tokens;
    const height = tokens ? Math.max(tokens / maximum * 100, 3) : 0;
    return <div key={item.day} title={`${item.day}: ${tokens.toLocaleString()} tokens`} className="daily-volume-column"><div className="daily-volume-bar" style={{ height: `${height}%` }} /></div>;
  })}</div><div className="daily-volume-meta"><span>{values[0]?.day || "No data"}</span><span>Peak {number.format(maximum)} tokens/day</span><span>{values[values.length - 1]?.day || ""}</span></div></div>;
}
