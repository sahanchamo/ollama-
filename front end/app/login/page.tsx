"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch(`${apiBase}/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Request failed");
      if (mode === "register") {
        setMode("login"); setMessage("Account created. Sign in with the same credentials."); return;
      }
      const me = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      if (!me.ok) throw new Error("Login succeeded, but account verification failed");
      const currentUser = await me.json();
      sessionStorage.setItem("ollama_gateway_token", data.access_token);
      sessionStorage.setItem("ollama_gateway_user", JSON.stringify(currentUser));
      router.replace(currentUser.is_admin ? "/" : "/chat");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl shadow-cyan-950/30">
        <p className="text-sm font-semibold tracking-[0.24em] text-cyan-400">OLLAMA GATEWAY</p>
        <h1 className="mt-2 text-3xl font-bold">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="mt-2 text-sm text-slate-400">Access the protected Ollama Gateway administration console.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-400" /></label>
          <label className="block text-sm">Password<div className="relative mt-1"><input required minLength={12} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 pr-20 outline-none focus:border-cyan-400" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 px-3 text-xs text-cyan-400 hover:text-cyan-300">{showPassword ? "Hide" : "Show"}</button></div></label>
          {message && <p className="rounded bg-slate-950 p-3 text-sm text-amber-300">{message}</p>}
          <button disabled={loading} className="w-full rounded-md bg-cyan-500 px-4 py-3 font-semibold text-slate-950">{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} className="mt-5 text-sm text-cyan-400 hover:text-cyan-300">
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
