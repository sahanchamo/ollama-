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
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Request failed");
      if (mode === "register") { setMode("login"); setMessage("Account created. Sign in to continue."); return; }
      const me = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      if (!me.ok) throw new Error("Login succeeded, but account verification failed");
      const currentUser = await me.json();
      sessionStorage.setItem("ollama_gateway_token", data.access_token);
      sessionStorage.setItem("ollama_gateway_user", JSON.stringify(currentUser));
      router.replace(currentUser.is_admin ? "/" : "/chat");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  const isLogin = mode === "login";
  return <main className="auth-page">
    <header className="auth-header"><Link href="/guest" className="auth-brand"><img src="/icon.svg" alt="Starlen" /><span>Starlen</span></Link><Link href="/guest" className="auth-guest-link">Try guest chat <span>↗</span></Link></header>
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="auth-eyebrow">PRIVATE AI WORKSPACE</p>
        <h1>Work with AI,<br /><em>on your terms.</em></h1>
        <p className="auth-description">A focused workspace for conversations, documents, and ideas—powered by the models you choose.</p>
        <div className="auth-benefits"><div><b>01</b><span><strong>Private by default</strong><small>Your workspace and conversations stay yours.</small></span></div><div><b>02</b><span><strong>Built for real work</strong><small>Chat, research, and work with your documents.</small></span></div><div><b>03</b><span><strong>Model flexibility</strong><small>Use the models available to your workspace.</small></span></div></div>
      </div>
      <div className="auth-card-wrap"><div className="auth-card">
        <div className="auth-card-top"><p>{isLogin ? "WELCOME BACK" : "CREATE ACCOUNT"}</p><span className="auth-status"><i /> Secure access</span></div>
        <h2>{isLogin ? "Sign in to your workspace" : "Create your workspace"}</h2>
        <p className="auth-card-description">{isLogin ? "Enter your details to continue where you left off." : "Start saving conversations, documents, and preferences."}</p>
        <div className="auth-tabs"><button type="button" className={isLogin ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button><button type="button" className={!isLogin ? "active" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Create account</button></div>
        <form onSubmit={submit} className="auth-form"><label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<div className="auth-password"><input required minLength={12} autoComplete={isLogin ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button></div></label>{message && <p className="auth-message">{message}</p>}<button disabled={loading} className="auth-submit">{loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}<span>→</span></button></form>
        <p className="auth-footnote">By continuing, you agree to use this workspace responsibly.</p>
      </div></div>
    </section>
  </main>;
}
