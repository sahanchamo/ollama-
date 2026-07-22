"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type User = { id: string; email: string; is_admin: boolean; is_active: boolean };
type UsageUser = User & { input_tokens: number; output_tokens: number; total_tokens: number; request_count: number; last_activity: string | null };
type Overview = { user_count: number; active_user_count: number; request_count: number; input_tokens: number; output_tokens: number; total_tokens: number; users: UsageUser[] };
type ApiKey = { id: string; user_id: string; name: string; key_prefix: string; created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null };
type Analytics = { days: number; active_key_count: number; revoked_key_count: number; daily: { day: string; request_count: number; input_tokens: number; output_tokens: number }[]; models: { model: string; request_count: number; input_tokens: number; output_tokens: number; total_tokens: number; average_duration_ms: number }[]; recent: { id: string; email: string; model: string; input_tokens: number; output_tokens: number; total_duration_ns: number; status: string; created_at: string }[] };
type ManagedModel = { model: string; enabled: boolean };

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function AdminDashboard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [managedModels, setManagedModels] = useState<ManagedModel[]>([]);
  const [modelFilter, setModelFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [keyName, setKeyName] = useState("Production integration");
  const [expiryDays, setExpiryDays] = useState("90");
  const [newKey, setNewKey] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [status, setStatus] = useState("Loading administrator session…");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  const rankedUsers = useMemo(() => [...(overview?.users || [])].sort((a, b) => b.total_tokens - a.total_tokens), [overview]);
  const maximumTokens = Math.max(...rankedUsers.map((item) => item.total_tokens), 1);
  const visibleModels = managedModels.filter((model) => model.model.toLowerCase().includes(modelFilter.toLowerCase()));
  const enabledModels = managedModels.filter((model) => model.enabled).length;

  function logout() {
    sessionStorage.removeItem("ollama_gateway_token");
    sessionStorage.removeItem("ollama_gateway_user");
    router.replace("/login");
  }

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }

  async function loadDashboard() {
    try {
      const [nextOverview, nextKeys, nextAnalytics, nextModels] = await Promise.all([request("/admin/overview"), request("/admin/api-keys"), request(`/admin/analytics?days=${rangeDays}`), request("/admin/models")]);
      setOverview(nextOverview); setKeys(nextKeys); setAnalytics(nextAnalytics); setManagedModels(nextModels);
      if (!selectedUserId && nextOverview.users.length) setSelectedUserId(nextOverview.users[0].id);
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) { setStatus(`Dashboard error: ${(error as Error).message}`); }
  }

  async function toggleModel(model: ManagedModel) {
    try { await request(`/admin/models/${encodeURIComponent(model.model)}`, { method: "PUT", body: JSON.stringify({ enabled: !model.enabled }) }); setStatus(`${model.model} ${model.enabled ? "disabled" : "enabled"}.`); await loadDashboard(); }
    catch (error) { setStatus(`Could not update model: ${(error as Error).message}`); }
  }

  async function createKey() {
    if (!selectedUserId) return;
    try {
      const expires = Number(expiryDays);
      const created = await request("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ user_id: selectedUserId, name: keyName, expires_in_days: expires > 0 ? expires : undefined }),
      });
      setNewKey(created.api_key); setStatus("API key created. Copy it before leaving this page."); await loadDashboard();
    } catch (error) { setStatus(`Could not create key: ${(error as Error).message}`); }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this API key? This cannot be undone.")) return;
    try { await request(`/admin/api-keys/${id}`, { method: "DELETE" }); setStatus("API key revoked."); await loadDashboard(); }
    catch (error) { setStatus(`Could not revoke key: ${(error as Error).message}`); }
  }

  async function updateUser(userId: string, isActive: boolean) {
    try {
      await request(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify({ is_active: isActive }) });
      setStatus(`User ${isActive ? "enabled" : "disabled"}.`); await loadDashboard();
    } catch (error) { setStatus(`Could not update user: ${(error as Error).message}`); }
  }

  async function createUser() {
    try {
      const created = await request("/admin/users", { method: "POST", body: JSON.stringify({ email: newUserEmail, password: newUserPassword }) });
      setNewUserEmail("");
      setNewUserPassword("");
      setSelectedUserId(created.id);
      setStatus(`User ${created.email} created.`);
      await loadDashboard();
    } catch (error) { setStatus(`Could not create user: ${(error as Error).message}`); }
  }

  async function resetUserPassword() {
    if (!selectedUserId || resetPassword.length < 12) return;
    try {
      await request(`/admin/users/${selectedUserId}/password`, { method: "PUT", body: JSON.stringify({ password: resetPassword }) });
      setResetPassword("");
      setStatus("Password reset. Share the new password with the user securely.");
    } catch (error) { setStatus(`Could not reset password: ${(error as Error).message}`); }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem("ollama_gateway_token");
    if (!savedToken) { router.replace("/login"); return; }
    const load = async () => {
      try {
        const response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } });
        if (!response.ok) throw new Error("Session expired");
        const me = await response.json();
        setUser(me); setToken(savedToken);
        if (!me.is_admin) setStatus("This account does not have administrator access.");
      } catch { logout(); }
    };
    void load();
  }, [router]);

  useEffect(() => { if (token && user?.is_admin) void loadDashboard(); }, [token, user?.is_admin, rangeDays]);

  if (!user) return <main className="grid min-h-screen place-items-center text-slate-400">Verifying access…</main>;
  if (!user.is_admin) return <main className="grid min-h-screen place-items-center p-4"><section className="max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-8 text-center"><p className="text-sm font-semibold tracking-[.2em] text-rose-400">ACCESS DENIED</p><h1 className="mt-3 text-2xl font-bold">Administrator account required</h1><p className="mt-2 text-sm text-slate-400">Your user dashboard has been removed. Ask an administrator for access.</p><button onClick={logout} className="mt-6 rounded bg-slate-700 px-4 py-2">Sign out</button></section></main>;

  return <main className="starlen-console min-h-screen bg-[#07111f] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl"><header className="console-hero flex flex-col gap-5 rounded-3xl border border-slate-700/70 p-5 md:flex-row md:items-center md:justify-between md:p-7"><div className="flex items-start gap-4"><img src="/icon.svg" className="mt-1 h-11 w-11 rounded-2xl" alt="Starlen" /><div><p className="text-xs font-bold tracking-[.26em] text-violet-300">STARLEN CONTROL</p><h1 className="mt-2 text-3xl font-bold">Administration</h1><p className="mt-1 text-sm text-slate-400">Monitor usage, protect access, and keep every workspace healthy.</p></div></div><div className="flex items-center gap-3"><div className="hidden text-right text-xs text-slate-400 md:block"><p className="max-w-48 truncate">{user.email}</p><p className="text-violet-300">Administrator</p></div><button onClick={loadDashboard} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white">Refresh</button><button onClick={logout} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Sign out</button></div></header><nav className="console-nav mt-4 flex gap-2 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/40 p-2"><Link href="/" className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white">Overview</Link><Link href="/users" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Users</Link><Link href="/api-keys" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">API keys</Link><Link href="/analytics" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Analytics</Link><Link href="/documentation" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Documentation</Link><Link href="/chat" className="ml-auto rounded-xl px-4 py-2 text-sm text-cyan-300 hover:bg-slate-800">Open chat</Link></nav>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{status}</p><label className="flex items-center gap-2 text-sm text-slate-400">Analytics range<select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div>
    {overview && <><section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Registered users" value={overview.user_count} tone="text-violet-300" /><Metric label="Active users" value={overview.active_user_count} tone="text-emerald-300" /><Metric label="AI requests" value={overview.request_count} tone="text-cyan-300" /><Metric label="Total tokens" value={compact.format(overview.total_tokens)} tone="text-amber-300" /></section>

    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">Model access</h2><p className="mt-1 text-sm text-slate-400">Control what users can select. Disabled models are blocked at the API too.</p></div><div className="flex gap-2"><input value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="Find a model" className="w-40 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-violet-400" /><span className="rounded bg-violet-500/15 px-2 py-2 text-xs text-violet-300">{enabledModels}/{managedModels.length} on</span></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleModels.map((model) => <div key={model.model} className={`model-access-card flex items-center justify-between gap-3 rounded-xl border p-3 ${model.enabled ? "border-white/10 bg-black/20" : "border-rose-400/20 bg-rose-950/10"}`}><div className="min-w-0"><p className="truncate text-sm font-medium">{model.model}</p><p className={model.enabled ? "mt-1 text-xs text-emerald-300" : "mt-1 text-xs text-rose-300"}>{model.enabled ? "Available to users" : "Disabled for users"}</p></div><button onClick={() => void toggleModel(model)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${model.enabled ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"}`}>{model.enabled ? "Disable" : "Enable"}</button></div>)}{!visibleModels.length && <p className="text-sm text-slate-400">No models match this search.</p>}</div></section>

    {analytics && <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-start justify-between"><div><h2 className="font-semibold">Token and request trend</h2><p className="text-sm text-slate-400">Daily activity across the last {analytics.days} days</p></div><span className="rounded bg-cyan-500/15 px-2 py-1 text-xs text-cyan-300">Live database data</span></div><UsageChart points={analytics.daily} /></div><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Model performance</h2><p className="text-sm text-slate-400">Usage and average response time</p><div className="mt-5 space-y-4">{analytics.models.map((model) => <div key={model.model} className="rounded-lg bg-slate-950 p-3"><div className="flex justify-between gap-3"><b className="truncate text-sm">{model.model}</b><span className="text-xs text-slate-400">{model.request_count} requests</span></div><div className="mt-2 flex justify-between text-xs text-slate-400"><span>{compact.format(model.total_tokens)} tokens</span><span>{model.average_duration_ms.toLocaleString()} ms avg</span></div></div>)}{!analytics.models.length && <p className="mt-5 text-sm text-slate-400">No model activity in this range.</p>}</div></div></section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-start justify-between"><div><h2 className="font-semibold">Usage by user</h2><p className="text-sm text-slate-400">Total input and generated tokens</p></div><span className="rounded bg-violet-500/15 px-2 py-1 text-xs text-violet-300">Top {Math.min(rankedUsers.length, 8)}</span></div><div className="mt-6 space-y-4">{rankedUsers.slice(0, 8).map((item) => <div key={item.id}><div className="mb-1 flex justify-between gap-4 text-sm"><span className="truncate">{item.email}</span><span className="shrink-0 font-medium">{compact.format(item.total_tokens)} tokens</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Math.max((item.total_tokens / maximumTokens) * 100, 1)}%` }} /></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>Input {compact.format(item.input_tokens)} · Output {compact.format(item.output_tokens)}</span><span>{item.request_count} requests</span></div></div>)}{!rankedUsers.length && <p className="text-sm text-slate-400">No tracked usage yet.</p>}</div></div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Token composition</h2><p className="text-sm text-slate-400">Prompt versus generated tokens</p><div className="mt-7 flex items-center gap-6"><div className="grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#22d3ee 0 ${(overview.total_tokens ? overview.input_tokens / overview.total_tokens : 0) * 360}deg, #a78bfa 0 360deg)` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-slate-900 text-center"><b className="text-lg">{compact.format(overview.total_tokens)}</b><span className="text-[10px] text-slate-400">TOKENS</span></div></div><div className="space-y-3 text-sm"><p><span className="mr-2 inline-block h-3 w-3 rounded bg-cyan-400" />Input <b className="ml-2">{compact.format(overview.input_tokens)}</b></p><p><span className="mr-2 inline-block h-3 w-3 rounded bg-violet-400" />Output <b className="ml-2">{compact.format(overview.output_tokens)}</b></p><p className="border-t border-slate-800 pt-3 text-slate-400">Average <b className="text-slate-100">{overview.request_count ? Math.round(overview.total_tokens / overview.request_count) : 0}</b> tokens / request</p></div></div></div></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"><div className="border-b border-slate-800 p-5"><h2 className="font-semibold">User activity</h2><p className="text-sm text-slate-400">All users, ordered by usage</p></div><div className="overflow-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">User</th><th>Requests</th><th>Input</th><th>Output</th><th>Last activity</th></tr></thead><tbody>{rankedUsers.map((item) => <tr key={item.id} className="border-t border-slate-800"><td className="p-4"><p>{item.email}</p><span className={item.is_active ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{item.is_admin ? "Admin · " : ""}{item.is_active ? "Active" : "Disabled"}</span></td><td>{item.request_count}</td><td>{compact.format(item.input_tokens)}</td><td>{compact.format(item.output_tokens)}</td><td className="text-xs text-slate-400">{item.last_activity ? new Date(item.last_activity).toLocaleString() : "Never"}</td></tr>)}</tbody></table></div></div>

    <div className="space-y-6"><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Create user</h2><p className="mt-1 text-sm text-slate-400">Create a standard user account. You can assign roles and quotas afterward.</p><div className="mt-5 space-y-3"><label className="block text-sm">Email<input required type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2" /></label><label className="block text-sm">Temporary password<input required type="password" minLength={12} value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2" /></label><button onClick={createUser} disabled={!newUserEmail || newUserPassword.length < 12} className="w-full rounded-md bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Create user</button></div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Generate API key</h2><p className="mt-1 text-sm text-slate-400">A key is displayed once; store it securely.</p><div className="mt-5 space-y-3"><label className="block text-sm">Owner<select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2">{rankedUsers.map((item) => <option value={item.id} key={item.id}>{item.email}</option>)}</select></label><label className="block text-sm">Key name<input value={keyName} onChange={(e) => setKeyName(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2" /></label><label className="block text-sm">Expiry days <span className="text-slate-500">(0 = no expiry)</span><input type="number" min="0" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2" /></label><button onClick={createKey} className="w-full rounded-md bg-violet-500 px-4 py-3 font-semibold text-white">Generate API key</button>{newKey && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"><p className="text-xs text-amber-300">Copy now — this secret cannot be shown again.</p><code className="mt-2 block break-all text-xs text-amber-100">{newKey}</code></div>}</div></div></div></section>

    <section id="api-keys" className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"><div className="border-b border-slate-800 p-5"><h2 className="font-semibold">API key registry</h2><p className="text-sm text-slate-400">Revoke keys immediately when no longer needed.</p></div><div className="overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Key</th><th>Owner</th><th>Last used</th><th>Expiry</th><th /></tr></thead><tbody>{keys.map((key) => { const owner = overview.users.find((item) => item.id === key.user_id); return <tr className="border-t border-slate-800" key={key.id}><td className="p-4"><p>{key.name}</p><code className="text-xs text-slate-400">{key.key_prefix}…</code></td><td>{owner?.email || key.user_id}</td><td className="text-xs text-slate-400">{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}</td><td className="text-xs text-slate-400">{key.expires_at ? new Date(key.expires_at).toLocaleDateString() : "Never"}</td><td className="p-4">{key.revoked_at ? <span className="text-xs text-slate-500">Revoked</span> : <button onClick={() => revokeKey(key.id)} className="rounded bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300">Revoke</button>}</td></tr>; })}{!keys.length && <tr><td className="p-4 text-slate-400" colSpan={5}>No API keys created.</td></tr>}</tbody></table></div></section></>}
  </div></main>;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-sm text-slate-400">{label}</p><p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p></article>;
}

function UsageChart({ points }: { points: { day: string; request_count: number; input_tokens: number; output_tokens: number }[] }) {
  if (!points.length) return <p className="mt-12 text-center text-sm text-slate-400">No activity in this selected range.</p>;
  const maximum = Math.max(...points.map((point) => point.input_tokens + point.output_tokens), 1);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 92 - ((point.input_tokens + point.output_tokens) / maximum) * 78;
    return `${x},${y}`;
  }).join(" ");
  return <><div className="mt-6 h-52"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible"><line x1="0" x2="100" y1="92" y2="92" stroke="#334155" strokeWidth=".5" /><line x1="0" x2="100" y1="52" y2="52" stroke="#1e293b" strokeWidth=".5" /><line x1="0" x2="100" y1="14" y2="14" stroke="#1e293b" strokeWidth=".5" /><polyline points={coordinates} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{points[0].day}</span><span>Peak {compact.format(maximum)} tokens/day</span><span>{points[points.length - 1].day}</span></div></>;
}
