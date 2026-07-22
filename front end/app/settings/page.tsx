"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = { email: string; is_admin: boolean };
type Usage = { total_tokens: number; request_count: number; monthly_token_limit: number | null; monthly_tokens_used: number; remaining_tokens: number | null };
type ApiKey = { id: string; name: string; key_prefix: string; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string };

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const apiEndpoints = [
  ["GET", "/chat/models", "List the models available to your account."],
  ["GET", "/conversations", "List your saved conversations."],
  ["POST", "/conversations", "Create a conversation with an available model."],
  ["POST", "/conversations/{conversation_id}/messages", "Send a message and receive an NDJSON stream."],
  ["GET", "/usage/me", "Read your token usage and quota."],
  ["GET", "/memory", "List your saved private memories."],
  ["POST", "/knowledge/documents", "Upload a document to your private knowledge base."],
  ["GET", "/account/api-keys", "List your personal integration API keys."],
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("My integration");
  const [expiry, setExpiry] = useState("90");
  const [newKey, setNewKey] = useState("");
  const [responseLanguage, setResponseLanguage] = useState("");
  const [notice, setNotice] = useState("Loading settings...");
  const [activeTab, setActiveTab] = useState<"settings" | "docs">("settings");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }
  async function load() {
    try { const [nextUsage, nextKeys, preferences] = await Promise.all([api("/usage/me"), api("/account/api-keys"), api("/account/preferences")]); setUsage(nextUsage); setKeys(nextKeys); setResponseLanguage(preferences.response_language || ""); setNotice("Settings loaded."); }
    catch (error) { setNotice(`Could not load settings: ${(error as Error).message}`); }
  }
  async function saveLanguage() {
    try { await api("/account/preferences", { method: "PUT", body: JSON.stringify({ response_language: responseLanguage || null }) }); setNotice(responseLanguage ? `Replies will use ${responseLanguage}.` : "Reply language set to automatic."); }
    catch (error) { setNotice((error as Error).message); }
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

  return <main className="min-h-screen bg-[#212121] p-4 text-[#ececec] md:p-8"><div className="mx-auto max-w-4xl"><header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold tracking-[.2em] text-slate-400">ACCOUNT</p><h1 className="mt-2 text-3xl font-semibold">Settings</h1><p className="mt-1 text-sm text-slate-400">Manage your usage, personal API keys, and chat history.</p></div><div className="flex gap-2"><Link href="/dashboard" className="rounded-xl border border-white/15 px-4 py-2 text-sm">Dashboard</Link><Link href="/chat" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Back to chat</Link></div></header><div className="mt-5 flex gap-2 border-b border-white/10"><button type="button" onClick={() => setActiveTab("settings")} className={`border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "settings" ? "border-sky-300 text-sky-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}>Settings</button><button type="button" onClick={() => setActiveTab("docs")} className={`border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "docs" ? "border-sky-300 text-sky-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}>API docs</button></div><p className="mt-4 text-sm text-slate-400">{notice}</p>
  {activeTab === "settings" && <>
  <section className="mt-6 grid gap-5 md:grid-cols-2"><article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Token usage</h2><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Total tokens" value={number.format(usage?.total_tokens || 0)} /><Stat label="Requests" value={(usage?.request_count || 0).toLocaleString()} /></div><div className="mt-5"><div className="flex justify-between text-sm"><span>Monthly quota</span><span>{usage?.monthly_token_limit ? `${number.format(usage.monthly_tokens_used)} / ${number.format(usage.monthly_token_limit)}` : "Unlimited"}</span></div>{usage?.monthly_token_limit && <><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-slate-400">{number.format(usage.remaining_tokens || 0)} tokens remaining this month</p></>}</div></article>
  <article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Reply language</h2><p className="mt-1 text-sm text-slate-400">Use this language for future AI replies. You can still ask for a different language in one message.</p><select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value)} className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 p-3 outline-none"><option value="">Automatic — match my message</option><option>English</option><option>Sinhala</option><option>Tamil</option><option>Arabic</option><option>Chinese</option><option>French</option><option>German</option><option>Hindi</option><option>Japanese</option><option>Korean</option><option>Spanish</option></select><button onClick={() => void saveLanguage()} className="mt-3 w-full rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm font-medium text-sky-100 hover:bg-sky-400/20">Save reply language</button></article>
  <article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Personal API keys</h2><p className="mt-1 text-sm text-slate-400">Use keys only in private backend services, never browser code.</p><label className="mt-4 block text-sm">Key name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 outline-none" /></label><label className="mt-3 block text-sm">Expiry<select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 outline-none"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">Never</option></select></label><button onClick={() => void createKey()} disabled={!name.trim()} className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:bg-slate-600">Create personal API key</button>{newKey && <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3"><p className="text-xs text-amber-200">Copy this key now. It will not be shown again.</p><code className="mt-2 block break-all text-xs text-amber-100">{newKey}</code></div>}</article></section>
  <section className="mt-6 rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Your API keys</h2><div className="mt-4 space-y-2">{keys.map((key) => <div key={key.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 p-3 text-sm"><div className="min-w-0 flex-1"><p>{key.name}</p><code className="text-xs text-slate-400">{key.key_prefix}...</code></div><span className="text-xs text-slate-400">{key.revoked_at ? "Revoked" : key.expires_at ? `Expires ${new Date(key.expires_at).toLocaleDateString()}` : "No expiry"}</span>{!key.revoked_at && <button onClick={() => void revokeKey(key.id)} className="text-xs text-rose-300">Revoke</button>}</div>)}{!keys.length && <p className="text-sm text-slate-400">No personal API keys yet.</p>}</div></section>
  <section className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-950/15 p-5"><h2 className="font-semibold text-rose-200">Danger zone</h2><p className="mt-1 text-sm text-slate-400">Delete all conversations and messages in your account. Your documents and long-term memory are not affected.</p><button onClick={() => void clearChats()} className="mt-4 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-medium text-white">Clear all my chats</button></section>
  </>}
  {activeTab === "docs" && <section className="mt-6 space-y-5"><article className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5"><h2 className="font-semibold">Your API reference</h2><p className="mt-2 text-sm leading-6 text-slate-300">Use a personal API key for server-to-server integrations. This reference only shows endpoints available to your account; administrator endpoints are not included.</p><div className="mt-4 rounded-xl bg-black/25 p-4"><p className="text-xs font-semibold tracking-wide text-slate-400">API BASE URL</p><code className="mt-2 block break-all text-sm text-sky-200">{base}</code></div></article><article className="rounded-2xl border border-white/10 bg-[#2a2a2a] p-5"><h2 className="font-semibold">Authentication</h2><p className="mt-2 text-sm text-slate-400">Send your personal API key in the <code className="rounded bg-black/30 px-1.5 py-0.5 text-slate-200">X-API-Key</code> header. Keep keys in server-side environment variables and revoke them here if exposed.</p><pre className="mt-4 overflow-auto rounded-xl bg-black/30 p-4 text-xs leading-6 text-emerald-200"><code>{`curl "${base}/chat/models" \\\n  -H "X-API-Key: ogw_your_personal_key"`}</code></pre></article><article className="overflow-hidden rounded-2xl border border-white/10 bg-[#2a2a2a]"><div className="p-5"><h2 className="font-semibold">Available endpoints</h2><p className="mt-1 text-sm text-slate-400">All listed endpoints require authentication, except public health checks.</p></div><div className="overflow-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-black/20 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Method</th><th>Endpoint</th><th>Purpose</th></tr></thead><tbody>{apiEndpoints.map(([method, path, description]) => <tr key={path} className="border-t border-white/10"><td className="p-4"><span className={method === "GET" ? "rounded bg-sky-400/10 px-2 py-1 text-xs text-sky-200" : "rounded bg-violet-400/10 px-2 py-1 text-xs text-violet-200"}>{method}</span></td><td><code className="text-slate-200">{path}</code></td><td className="p-4 text-slate-400">{description}</td></tr>)}</tbody></table></div></article></section>}
  </div></main>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
