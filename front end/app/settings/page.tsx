"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = { email: string; is_admin: boolean };
type Usage = { total_tokens: number; request_count: number; monthly_token_limit: number | null; monthly_tokens_used: number; remaining_tokens: number | null };
type ApiKey = { id: string; name: string; key_prefix: string; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string };

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function SettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("My integration");
  const [expiry, setExpiry] = useState("90");
  const [newKey, setNewKey] = useState("");
  const [notice, setNotice] = useState("Loading settings...");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }
  async function load() {
    try { const [nextUsage, nextKeys] = await Promise.all([api("/usage/me"), api("/account/api-keys")]); setUsage(nextUsage); setKeys(nextKeys); setNotice("Settings loaded."); }
    catch (error) { setNotice(`Could not load settings: ${(error as Error).message}`); }
  }
  async function createKey() {
    try {
      const created = await api("/account/api-keys", { method: "POST", body: JSON.stringify({ name, expires_in_days: expiry === "0" ? undefined : Number(expiry) }) });
      setNewKey(created.api_key); setNotice("API key created. Copy it now; it cannot be shown again."); await load();
    } catch (error) { setNotice(`Could not create key: ${(error as Error).message}`); }
  }
  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this API key? Applications using it will stop working.")) return;
    try { await api(`/account/api-keys/${id}`, { method: "DELETE" }); setNotice("API key revoked."); await load(); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function clearChats() {
    if (!window.confirm("Delete every chat and message in your account? This cannot be undone.")) return;
    try { await api("/conversations", { method: "DELETE" }); setNotice("All of your chats were deleted."); }
    catch (error) { setNotice((error as Error).message); }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem("ollama_gateway_token");
    if (!saved) { router.replace("/login"); return; }
    const verify = async () => { const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } }); const me = await response.json().catch(() => null); if (!response.ok) { sessionStorage.clear(); router.replace("/login"); return; } setUser(me); setToken(saved); };
    void verify();
  }, [router]);
  useEffect(() => { if (token) void load(); }, [token]);
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#212121] text-slate-400">Loading settings...</main>;
  const percent = usage?.monthly_token_limit ? Math.min(100, (usage.monthly_tokens_used / usage.monthly_token_limit) * 100) : 0;

  return <main className="min-h-screen bg-[#212121] p-4 text-[#ececec] md:p-8"><div className="mx-auto max-w-4xl"><header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold tracking-[.2em] text-slate-400">ACCOUNT</p><h1 className="mt-2 text-3xl font-semibold">Settings</h1><p className="mt-1 text-sm text-slate-400">Manage your usage, personal API keys, and chat history.</p></div><div className="flex gap-2"><Link href="/dashboard" className="rounded-xl border border-white/15 px-4 py-2 text-sm">Dashboard</Link><Link href="/chat" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Back to chat</Link></div></header><p className="mt-4 text-sm text-slate-400">{notice}</p>
  <section className="mt-6 grid gap-5 md:grid-cols-2"><article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Token usage</h2><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Total tokens" value={number.format(usage?.total_tokens || 0)} /><Stat label="Requests" value={(usage?.request_count || 0).toLocaleString()} /></div><div className="mt-5"><div className="flex justify-between text-sm"><span>Monthly quota</span><span>{usage?.monthly_token_limit ? `${number.format(usage.monthly_tokens_used)} / ${number.format(usage.monthly_token_limit)}` : "Unlimited"}</span></div>{usage?.monthly_token_limit && <><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-slate-400">{number.format(usage.remaining_tokens || 0)} tokens remaining this month</p></>}</div></article>
  <article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Personal API keys</h2><p className="mt-1 text-sm text-slate-400">Use keys only in private backend services, never browser code.</p><label className="mt-4 block text-sm">Key name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 outline-none" /></label><label className="mt-3 block text-sm">Expiry<select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 outline-none"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">Never</option></select></label><button onClick={() => void createKey()} disabled={!name.trim()} className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:bg-slate-600">Create personal API key</button>{newKey && <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3"><p className="text-xs text-amber-200">Copy this key now. It will not be shown again.</p><code className="mt-2 block break-all text-xs text-amber-100">{newKey}</code></div>}</article></section>
  <section className="mt-6 rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Your API keys</h2><div className="mt-4 space-y-2">{keys.map((key) => <div key={key.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 p-3 text-sm"><div className="min-w-0 flex-1"><p>{key.name}</p><code className="text-xs text-slate-400">{key.key_prefix}...</code></div><span className="text-xs text-slate-400">{key.revoked_at ? "Revoked" : key.expires_at ? `Expires ${new Date(key.expires_at).toLocaleDateString()}` : "No expiry"}</span>{!key.revoked_at && <button onClick={() => void revokeKey(key.id)} className="text-xs text-rose-300">Revoke</button>}</div>)}{!keys.length && <p className="text-sm text-slate-400">No personal API keys yet.</p>}</div></section>
  <section className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-950/15 p-5"><h2 className="font-semibold text-rose-200">Danger zone</h2><p className="mt-1 text-sm text-slate-400">Delete all conversations and messages in your account. Your documents and long-term memory are not affected.</p><button onClick={() => void clearChats()} className="mt-4 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-medium text-white">Clear all my chats</button></section>
  </div></main>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
