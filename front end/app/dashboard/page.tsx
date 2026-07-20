"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = { email: string; is_admin: boolean };
type UsageEvent = { id: string; model: string; input_tokens: number; output_tokens: number; status: string; created_at: string };
type Usage = {
  input_tokens: number; output_tokens: number; total_tokens: number; request_count: number;
  monthly_token_limit: number | null; monthly_tokens_used: number; remaining_tokens: number | null; events: UsageEvent[];
};

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function UserDashboard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [counts, setCounts] = useState({ conversations: 0, documents: 0, memories: 0 });
  const [notice, setNotice] = useState("Loading your workspace...");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  async function request(path: string) {
    const response = await fetch(`${base}${path}`, { headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }
  async function load() {
    try {
      const [nextUsage, chats, documents, memories] = await Promise.all([
        request("/usage/me"), request("/conversations"), request("/knowledge/documents"), request("/memory"),
      ]);
      setUsage(nextUsage);
      setCounts({ conversations: chats.length, documents: documents.length, memories: memories.length });
      setNotice(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) { setNotice(`Could not load dashboard: ${(error as Error).message}`); }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("ollama_gateway_token");
    if (!saved) { router.replace("/login"); return; }
    const verify = async () => {
      const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } });
      const me = await response.json().catch(() => null);
      if (!response.ok) { sessionStorage.clear(); router.replace("/login"); return; }
      setUser(me); setToken(saved);
    };
    void verify();
  }, [router]);
  useEffect(() => { if (token) void load(); }, [token]);

  const quotaPercent = usage?.monthly_token_limit ? Math.min(100, (usage.monthly_tokens_used / usage.monthly_token_limit) * 100) : 0;
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#212121] text-slate-400">Loading your dashboard...</main>;

  return <main className="min-h-screen bg-[#212121] p-4 text-[#ececec] md:p-8"><div className="mx-auto max-w-6xl"><header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold tracking-[.2em] text-slate-400">YOUR WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold">Usage dashboard</h1><p className="mt-1 text-sm text-slate-400">Your chats, memory, documents, and token usage.</p></div><div className="flex gap-2"><Link href="/chat" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Open chat</Link>{user.is_admin && <Link href="/" className="rounded-xl border border-white/15 px-4 py-2 text-sm">Admin</Link>}<button onClick={() => void load()} className="rounded-xl border border-white/15 px-4 py-2 text-sm">Refresh</button></div></header><p className="mt-4 text-sm text-slate-400">{notice}</p>

  <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total tokens" value={number.format(usage?.total_tokens || 0)} /><Metric label="Requests" value={(usage?.request_count || 0).toLocaleString()} /><Metric label="Conversations" value={counts.conversations.toLocaleString()} /><Metric label="Documents & memories" value={`${counts.documents} / ${counts.memories}`} /></section>

  <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Monthly token limit</h2><p className="mt-1 text-sm text-slate-400">Your administrator controls this limit.</p></div><span className="text-sm text-slate-300">{usage?.monthly_token_limit ? `${number.format(usage.monthly_tokens_used)} used` : "Unlimited"}</span></div>{usage?.monthly_token_limit ? <><div className="mt-5 h-3 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${quotaPercent}%` }} /></div><div className="mt-3 flex justify-between text-sm"><span>{number.format(usage.monthly_tokens_used)} used this month</span><span>{number.format(usage.remaining_tokens || 0)} remaining</span></div></> : <p className="mt-6 rounded-xl bg-black/20 p-4 text-sm text-slate-300">No monthly token limit is assigned to your account.</p>}</article>
  <article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Token breakdown</h2><div className="mt-5 space-y-4"><Bar label="Input" value={usage?.input_tokens || 0} total={usage?.total_tokens || 0} tone="bg-cyan-400" /><Bar label="Output" value={usage?.output_tokens || 0} total={usage?.total_tokens || 0} tone="bg-violet-400" /></div></article></section>

  <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#2a2a2a]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Recent model activity</h2><p className="mt-1 text-sm text-slate-400">Your latest completed or interrupted responses.</p></div><div className="overflow-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-black/20 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Time</th><th>Model</th><th>Tokens</th><th>Status</th></tr></thead><tbody>{usage?.events.slice(0, 20).map((event) => <tr key={event.id} className="border-t border-white/10"><td className="p-4 text-slate-400">{new Date(event.created_at).toLocaleString()}</td><td>{event.model}</td><td>{number.format(event.input_tokens + event.output_tokens)}</td><td className={event.status === "complete" ? "text-emerald-300" : "text-amber-300"}>{event.status}</td></tr>)}{!usage?.events.length && <tr><td colSpan={4} className="p-5 text-slate-400">No model activity yet.</td></tr>}</tbody></table></div></section>
  </div></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>; }
function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) { return <div><div className="flex justify-between text-sm"><span>{label}</span><span className="text-slate-400">{number.format(value)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full ${tone}`} style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></div></div>; }
