"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";

type User = { id: string; email: string; is_admin: boolean; is_active: boolean; input_tokens: number; output_tokens: number; total_tokens: number; request_count: number; last_activity: string | null };
type Overview = { users: User[] };
type ModelAccess = { model: string; enabled: boolean; inherited: boolean };
const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function UsersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [modelAccess, setModelAccess] = useState<ModelAccess[]>([]);
  const [notice, setNotice] = useState("Loading users…");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }
  async function load() {
    try { const data: Overview = await request("/admin/overview"); setUsers(data.users); setNotice(""); }
    catch (error) { setNotice(`Could not load users: ${(error as Error).message}`); }
  }
  async function createUser() {
    try { const created = await request("/admin/users", { method: "POST", body: JSON.stringify({ email, password }) }); setEmail(""); setPassword(""); setNotice(`${created.email} created.`); await load(); }
    catch (error) { setNotice(`Could not create user: ${(error as Error).message}`); }
  }
  async function setActive(user: User) {
    try { await request(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) }); await load(); }
    catch (error) { setNotice(`Could not update user: ${(error as Error).message}`); }
  }
  async function manageModels(user: User) {
    try { const models = await request(`/admin/users/${user.id}/models`); setSelectedUser(user); setModelAccess(models); setNotice(""); }
    catch (error) { setNotice(`Could not load model access: ${(error as Error).message}`); }
  }
  async function setModel(model: ModelAccess) {
    if (!selectedUser) return;
    try {
      const updated = await request(`/admin/users/${selectedUser.id}/models/${encodeURIComponent(model.model)}`, { method: "PUT", body: JSON.stringify({ enabled: !model.enabled }) });
      setModelAccess((current) => current.map((item) => item.model === model.model ? updated : item));
    } catch (error) { setNotice(`Could not update model access: ${(error as Error).message}`); }
  }
  useEffect(() => { const saved = sessionStorage.getItem("ollama_gateway_token"); if (!saved) { router.replace("/login"); return; } setToken(saved); }, [router]);
  useEffect(() => { if (token) void load(); }, [token]);

  return <AdminShell><main className="min-h-screen bg-[#10131a] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-bold tracking-[.24em] text-violet-300">STARLEN CONTROL</p><h1 className="mt-2 text-3xl font-bold">Users</h1><p className="mt-1 text-sm text-slate-400">Create accounts, view usage, and control access.</p></div><button onClick={() => void load()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold">Refresh</button></header>
    <nav className="mt-5 flex gap-2 overflow-auto"><Link href="/" className="rounded px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Overview</Link><span className="rounded bg-violet-500 px-4 py-2 text-sm font-semibold">Users</span><Link href="/api-keys" className="rounded px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">API Keys</Link><Link href="/analytics" className="rounded px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Analytics</Link></nav>
    <p className="mt-4 text-sm text-amber-200">{notice}</p>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_.6fr]"><div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"><div className="border-b border-slate-800 p-5"><h2 className="font-semibold">User activity</h2><p className="text-sm text-slate-400">All users, ordered by usage</p></div><div className="overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-950/80 text-xs uppercase text-slate-400"><tr><th className="p-4">User</th><th>Requests</th><th>Input</th><th>Output</th><th>Last activity</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-slate-800"><td className="p-4"><p>{user.email}</p><span className={user.is_active ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{user.is_admin ? "Admin · " : ""}{user.is_active ? "Active" : "Disabled"}</span></td><td>{user.request_count}</td><td>{number.format(user.input_tokens)}</td><td>{number.format(user.output_tokens)}</td><td className="text-xs text-slate-400">{user.last_activity ? new Date(user.last_activity).toLocaleString() : "Never"}</td><td className="p-3">{!user.is_admin && <button onClick={() => void setActive(user)} className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20">{user.is_active ? "Disable" : "Enable"}</button>}</td></tr>)}{!users.length && <tr><td colSpan={6} className="p-5 text-slate-400">No users found.</td></tr>}</tbody></table></div></div>
    <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Create user</h2><p className="mt-1 text-sm text-slate-400">Passwords must contain at least 12 characters.</p><div className="mt-5 space-y-3"><label className="block text-sm">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><label className="block text-sm">Temporary password<input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><button disabled={!email || password.length < 12} onClick={() => void createUser()} className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Create user</button><Link href="/admin/reset-password" className="block text-center text-sm text-cyan-300 hover:text-cyan-200">Reset a user password</Link></div></aside></section>
    <section className="mt-6 rounded-2xl border border-violet-400/30 bg-slate-900/70 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Advanced-model assignments</h2><p className="mt-1 text-sm text-slate-400">Choose a user, then grant only the models that user may use.</p></div><select value={selectedUser?.id || ""} onChange={(event) => { const selected = users.find((user) => user.id === event.target.value); if (selected) void manageModels(selected); }} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">Select a user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></div>{selectedUser && <><p className="mt-4 text-xs text-slate-500">For premium-only access: disable the model globally on Overview, then set it to Allowed below for the selected user.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{modelAccess.map((model) => <div key={model.model} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{model.model}</p><p className="mt-1 text-xs text-slate-500">{model.inherited ? "Global policy" : "User-specific policy"}</p></div><button onClick={() => void setModel(model)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${model.enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{model.enabled ? "Allowed" : "Blocked"}</button></div>)}</div></>}</section>
  </div></main></AdminShell>;
}
