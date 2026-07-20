"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");
const guestLimit = 10;
type ChatItem = { id: string; role: "user" | "assistant"; content: string; pending?: boolean };

function guestId() {
  const existing = sessionStorage.getItem("starlen_guest_session");
  if (existing) return existing;
  const value = typeof crypto?.randomUUID === "function" ? crypto.randomUUID().replaceAll("-", "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem("starlen_guest_session", value);
  return value;
}

export default function GuestChatPage() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [remaining, setRemaining] = useState(guestLimit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const used = guestLimit - remaining;

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || busy || remaining <= 0) return;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const history = [...messages, { id: requestId, role: "user" as const, content }]
      .filter((message) => !message.pending)
      .slice(-12)
      .map(({ role, content: text }) => ({ role, content: text }));
    setPrompt(""); setError(""); setBusy(true);
    setMessages((current) => [...current, { id: requestId, role: "user", content }, { id: `answer-${requestId}`, role: "assistant", content: "", pending: true }]);
    try {
      const response = await fetch(`${base}/chat/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen2.5:3b", session_id: guestId(), messages: history, stream: true }) });
      const left = response.headers.get("X-Guest-Messages-Remaining");
      if (left !== null) setRemaining(Number(left));
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Unable to send message");
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) continue; const item = JSON.parse(line); if (item.error) throw new Error(item.error);
          const part = item.message?.content || "";
          if (part) setMessages((current) => current.map((message) => message.id === `answer-${requestId}` ? { ...message, content: message.content + part } : message));
        }
      }
    } catch (caught) {
      const text = (caught as Error).message; setError(text);
      if (/10 free messages/i.test(text)) setRemaining(0);
    } finally {
      setMessages((current) => current.map((message) => message.id === `answer-${requestId}` ? { ...message, pending: false } : message)); setBusy(false);
    }
  }

  const suggestions = ["Explain a complex idea simply", "Plan a focused project", "Help me write something better"];

  return <main className="guest-experience min-h-dvh bg-[#11131d] text-slate-100">
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="guest-orb guest-orb-one" /><div className="guest-orb guest-orb-two" /><div className="guest-grid" /></div>
    <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><Link href="/guest" className="flex items-center gap-3"><img src="/icon.svg" className="h-9 w-9 rounded-xl" alt="Starlen" /><span className="text-sm font-bold tracking-[.28em]">STARLEN</span></Link><div className="flex items-center gap-3 text-sm text-slate-300"><span className="guest-progress hidden rounded-full border border-white/10 px-3 py-1.5 sm:inline"><b>{remaining}</b> free messages left</span><Link className="rounded-xl border border-white/15 bg-white/[.03] px-4 py-2 font-medium hover:bg-white/10" href="/login">Sign in</Link></div></header>
    <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-77px)] max-w-4xl flex-col px-4 pb-6">
      {!messages.length && <div className="m-auto max-w-2xl text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] border border-white/30 bg-white/10 shadow-2xl shadow-violet-500/30"><img src="/icon.svg" className="h-14 w-14" alt="" /></div><p className="mt-6 text-xs font-bold tracking-[.38em] text-sky-300">STARLEN PREVIEW</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Think clearly. Build privately.</h1><p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">Try Starlen with ten free messages. Create an account whenever you are ready to keep chats, memories, documents, and personal API access.</p><div className="mt-8 flex flex-wrap justify-center gap-2">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)} className="rounded-xl border border-white/10 bg-white/[.035] px-4 py-2.5 text-sm text-slate-200 transition hover:border-sky-300/40 hover:bg-white/[.08]">{suggestion}</button>)}</div><div className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-2 text-left text-xs text-slate-400"><span className="rounded-xl border border-white/10 bg-black/10 p-3">No account needed</span><span className="rounded-xl border border-white/10 bg-black/10 p-3">Chats are temporary</span><span className="rounded-xl border border-white/10 bg-black/10 p-3">10 messages free</span></div></div>}
      <div className={`mx-auto w-full max-w-3xl ${messages.length ? "pt-8" : ""} pb-36`}>
        {messages.map((message) => <article key={message.id} className={`mb-7 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={message.role === "user" ? "max-w-[80%] rounded-3xl bg-white/10 px-5 py-3" : "w-full rounded-3xl border border-white/10 bg-black/15 px-5 py-3"}>{message.content ? <div className="leading-7 [&_p]:my-2 [&_pre]:overflow-auto"><ReactMarkdown>{message.content}</ReactMarkdown></div> : message.pending ? <span className="animate-pulse text-slate-400">Starlen is thinking…</span> : null}</div></article>)}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#11131d] via-[#11131d] to-transparent px-4 pb-6 pt-16"><div className="mx-auto max-w-3xl rounded-[26px] border border-white/15 bg-[#202536]/90 p-3 shadow-2xl backdrop-blur"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={busy || remaining <= 0} placeholder={remaining > 0 ? "Message Starlen…" : "Your free preview is complete"} rows={1} className="min-h-12 w-full resize-none bg-transparent px-3 py-2 outline-none placeholder:text-slate-400" /><div className="flex items-center justify-between px-2 pb-1 text-xs text-slate-400"><span>{used}/10 used · This preview is not saved</span>{remaining > 0 ? <button disabled={busy || !prompt.trim()} className="rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Send <span aria-hidden="true">↑</span></button> : <Link href="/login" className="rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 px-4 py-2 font-semibold text-slate-950">Save your workspace</Link>}</div></div>{error && <p className="mx-auto mt-2 max-w-3xl rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200">{error}</p>}</form>
    </section>
  </main>;
}
