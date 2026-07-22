"use client";

import Link from "next/link";
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
      const response = await fetch(`${apiBase}/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Request failed");
      if (mode === "register") { setMode("login"); setMessage("Account created. Sign in to continue to Starlen."); return; }
      const me = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      if (!me.ok) throw new Error("Login succeeded, but account verification failed");
      const currentUser = await me.json();
      sessionStorage.setItem("ollama_gateway_token", data.access_token);
      sessionStorage.setItem("ollama_gateway_user", JSON.stringify(currentUser));
      router.replace(currentUser.is_admin ? "/" : "/chat");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  return <main className="login-scene min-h-screen overflow-hidden bg-[#0a0d18] text-white">
    <div className="login-3d-scene" aria-hidden="true"><div className="login-cube login-cube-large"><i /><i /><i /><i /><i /><i /></div><div className="login-cube login-cube-small"><i /><i /><i /><i /><i /><i /></div><div className="login-ring login-ring-one" /><div className="login-ring login-ring-two" /><span className="login-star login-star-one" /><span className="login-star login-star-two" /></div>
    <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><Link href="/guest" className="flex items-center gap-3"><img src="/icon.svg" className="h-10 w-10 rounded-xl shadow-lg shadow-indigo-500/30" alt="Starlen" /><span className="text-sm font-bold tracking-[.28em]">STARLEN</span></Link><Link href="/guest" className="rounded-full border border-white/15 bg-white/[.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">Try guest chat</Link></nav>
    <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-84px)] max-w-6xl items-center gap-12 px-5 pb-12 lg:grid-cols-[1.1fr_.9fr]">
      <div className="order-2 text-center lg:order-1 lg:text-left"><p className="text-xs font-bold tracking-[.38em] text-sky-300">PERSONAL AI, YOUR WAY</p><h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">A smarter space for your ideas.</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">Chat with your local models, keep personal memories, and ask questions across private documents—all in one secure Starlen workspace.</p><div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-300 lg:justify-start"><span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">Private memory</span><span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">Document intelligence</span><span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">Personal API keys</span></div></div>
      <div className="login-perspective order-1 mx-auto w-full max-w-md lg:order-2"><div className="login-card relative overflow-hidden rounded-[30px] border border-white/20 bg-[#151a2c]/85 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8"><div className="login-card-glow" /><div className="relative"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><img src="/icon.svg" className="h-8 w-8" alt="" /></div><div><p className="text-xs font-bold tracking-[.25em] text-sky-300">STARLEN ACCESS</p><p className="mt-1 text-xs text-slate-400">Your secure AI workspace</p></div></div><h2 className="mt-7 text-3xl font-semibold">{mode === "login" ? "Welcome back" : "Create your workspace"}</h2><p className="mt-2 text-sm text-slate-400">{mode === "login" ? "Sign in to continue your saved conversations." : "Start saving chats, memory, and documents."}</p>
        <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium text-slate-200">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:bg-black/30" placeholder="you@example.com" /></label><label className="block text-sm font-medium text-slate-200">Password<div className="relative mt-2"><input required minLength={12} autoComplete={mode === "login" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-20 outline-none transition focus:border-sky-300/60 focus:bg-black/30" placeholder="At least 12 characters" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 px-4 text-xs font-medium text-sky-300 hover:text-sky-200">{showPassword ? "Hide" : "Show"}</button></div></label>{message && <p className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-3 py-2.5 text-sm text-amber-100">{message}</p>}<button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-indigo-500/20 transition hover:brightness-110">{loading ? "Please wait…" : mode === "login" ? "Sign in to Starlen" : "Create account"}</button></form><button onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} className="mt-5 text-sm text-sky-300 hover:text-sky-200">{mode === "login" ? "New to Starlen? Create an account" : "Already have an account? Sign in"}</button></div></div></div>
    </section>
  </main>;
}
