"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; email: string; is_admin: boolean };
type Overview = { users: User[] };

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("Checking administrator session…");
  const [saving, setSaving] = useState(false);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  useEffect(() => {
    const savedToken = sessionStorage.getItem("ollama_gateway_token");
    if (!savedToken) { router.replace("/login"); return; }
    const load = async () => {
      const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } });
      if (!me.ok || !(await me.json()).is_admin) { router.replace("/"); return; }
      const overview = await fetch(`${base}/admin/overview`, { headers: { Authorization: `Bearer ${savedToken}` } });
      if (!overview.ok) { setStatus("Could not load users."); return; }
      const data: Overview = await overview.json();
      setToken(savedToken);
      setUsers(data.users);
      setUserId(data.users[0]?.id || "");
      setStatus("");
    };
    void load().catch(() => setStatus("Could not verify administrator session."));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !userId || password.length < 12) return;
    setSaving(true); setStatus("");
    try {
      const response = await fetch(`${base}/admin/users/${userId}/password`, { method: "PUT", headers, body: JSON.stringify({ password }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Password reset failed");
      }
      setPassword("");
      setStatus("Password reset successfully. Share the new password securely.");
    } catch (error) { setStatus((error as Error).message); }
    finally { setSaving(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-[#07111f] p-4 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-7 shadow-2xl"><Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200">← Administration</Link><h1 className="mt-4 text-2xl font-bold">Reset user password</h1><p className="mt-2 text-sm text-slate-400">Administrators can set a new password for any user.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm">User<select value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-3">{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label><label className="block text-sm">New password<div className="relative mt-1"><input required minLength={12} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 pr-20" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 px-3 text-xs text-cyan-300">{showPassword ? "Hide" : "Show"}</button></div></label><button disabled={saving || !userId || password.length < 12} className="w-full rounded-md bg-amber-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{saving ? "Resetting…" : "Reset password"}</button></form>{status && <p className="mt-4 rounded bg-slate-950 p-3 text-sm text-amber-200">{status}</p>}</section></main>;
}
