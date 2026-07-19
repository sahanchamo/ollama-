"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiBase = "http://152.42.253.49/api/v1";
const localApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");

const endpoints = [
  ["GET", "/health/live", "Service liveness check. No authentication."],
  ["GET", "/health/ready", "Checks API, PostgreSQL, Redis, and Ollama."],
  ["POST", "/api/v1/auth/login", "Exchange email and password for a JWT session token."],
  ["GET", "/api/v1/chat/models", "List locally downloaded Ollama models."],
  ["POST", "/api/v1/conversations", "Create a persistent chat conversation."],
  ["POST", "/api/v1/conversations/{id}/messages", "Send a message; response streams as NDJSON."],
  ["GET", "/api/v1/usage/me", "Read the authenticated user’s token and request totals."],
  ["POST", "/api/v1/knowledge/documents", "Upload and index TXT, Markdown, or text PDF for RAG."],
  ["GET", "/api/v1/admin/overview", "Admin-only: all-user usage metrics for this dashboard."],
  ["POST", "/api/v1/admin/api-keys", "Admin-only: issue a new user API key."],
];

export default function Documentation() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("ollama_gateway_token");
    if (!token) { router.replace("/login"); return; }
    const verify = async () => {
      const response = await fetch(`${localApiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const user = await response.json().catch(() => null);
      if (!response.ok || !user?.is_admin) { router.replace("/"); return; }
      setAllowed(true);
    };
    void verify();
  }, [router]);

  if (!allowed) return <main className="grid min-h-screen place-items-center text-slate-400">Loading documentation…</main>;

  return <main className="min-h-screen bg-[#07111f] p-4 text-slate-100 md:p-8"><div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[220px_1fr]"><aside className="lg:sticky lg:top-8 lg:h-fit"><Link href="/" className="text-sm font-bold tracking-[.24em] text-violet-300">OLLAMA GATEWAY</Link><h1 className="mt-2 text-2xl font-bold">Developer docs</h1><nav className="mt-6 flex gap-1 overflow-auto lg:flex-col"><a href="#quickstart" className="rounded px-3 py-2 text-sm hover:bg-slate-800">Quick start</a><a href="#api-keys" className="rounded px-3 py-2 text-sm hover:bg-slate-800">API keys</a><a href="#endpoints" className="rounded px-3 py-2 text-sm hover:bg-slate-800">Endpoints</a><a href="#rag" className="rounded px-3 py-2 text-sm hover:bg-slate-800">Knowledge / RAG</a><Link href="/" className="rounded bg-violet-500 px-3 py-2 text-sm font-semibold text-white">← Admin dashboard</Link></nav></aside><article className="space-y-6"><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><p className="text-sm font-bold tracking-[.22em] text-violet-300">API REFERENCE</p><h2 className="mt-2 text-3xl font-bold">Build with your private Ollama gateway</h2><p className="mt-3 max-w-3xl text-slate-400">Use a generated API key to call the protected model, conversation, RAG, and usage endpoints. The key identifies the owning user, and every generation is counted in their usage metrics.</p><div className="mt-5 rounded-lg bg-slate-950 p-4"><p className="text-xs text-slate-500">PUBLIC API BASE URL</p><code className="mt-1 block break-all text-cyan-300">{apiBase}</code></div></section>

  <section id="quickstart" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold">Quick start</h2><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300"><li>In the admin dashboard, create a key and select its owner.</li><li>Copy the secret immediately. It begins with <code>ogw_</code> and cannot be shown again.</li><li>Send it in the <code>X-API-Key</code> header for protected requests.</li><li>Use the models endpoint to find an installed model, then create a conversation and send messages.</li></ol><Code>{`export API_BASE=${apiBase}\nexport API_KEY="ogw_your_secret_key"\n\ncurl "$API_BASE/chat/models" \\\n  -H "X-API-Key: $API_KEY"`}</Code></section>

  <section id="api-keys" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold">API-key authentication</h2><p className="mt-3 text-sm text-slate-400">API keys are for server-to-server integrations. Keep keys out of browser code, Git repositories, and public logs. Revoke a key immediately if exposed.</p><Code>{`curl -X POST "$API_BASE/conversations" \\\n  -H "X-API-Key: $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"qwen3.5:4b"}'`}</Code><div className="mt-4 grid gap-3 md:grid-cols-3"><Guide title="Scope" text="A key acts as its selected user. It can only see that user’s chats, documents, and usage." /><Guide title="Expiry" text="Choose an expiry date when creating sensitive or temporary integration keys." /><Guide title="Revoke" text="Revocation is immediate. The stored hash cannot be converted back into a secret." /></div></section>

  <section id="endpoints" className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"><div className="p-6"><h2 className="text-xl font-semibold">Endpoint summary</h2><p className="mt-2 text-sm text-slate-400">All routes under <code>/api/v1</code> require a JWT bearer token or <code>X-API-Key</code>, unless stated otherwise.</p></div><div className="overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Method</th><th>Endpoint</th><th>Purpose</th></tr></thead><tbody>{endpoints.map(([method, path, description]) => <tr key={path} className="border-t border-slate-800"><td className="p-4"><span className={method === "GET" ? "rounded bg-cyan-500/15 px-2 py-1 text-xs text-cyan-300" : "rounded bg-violet-500/15 px-2 py-1 text-xs text-violet-300"}>{method}</span></td><td><code>{path}</code></td><td className="p-4 text-slate-400">{description}</td></tr>)}</tbody></table></div></section>

  <section id="rag" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold">Knowledge base and RAG</h2><p className="mt-3 text-sm text-slate-400">Upload private documents to give Ollama current, controlled context. Each document is embedded locally, scoped to its owner, and relevant excerpts are added to chat replies with source instructions.</p><Code>{`curl -X POST "$API_BASE/knowledge/documents" \\\n  -H "X-API-Key: $API_KEY" \\\n  -F "file=@company-policy-2026.pdf"`}</Code><p className="mt-3 text-sm text-amber-300">RAG answers only from uploaded material. For current internet news, prices, or live events, add a web-search provider; do not rely on model training data alone.</p></section>
  </article></div></main>;
}

function Code({ children }: { children: string }) { return <pre className="mt-4 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-emerald-300"><code>{children}</code></pre>; }
function Guide({ title, text }: { title: string; text: string }) { return <div className="rounded-lg bg-slate-950 p-4"><h3 className="font-semibold text-violet-300">{title}</h3><p className="mt-2 text-sm text-slate-400">{text}</p></div>; }
