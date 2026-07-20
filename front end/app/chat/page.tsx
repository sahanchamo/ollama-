"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type User = { email: string; is_admin: boolean };
type Model = { name: string };
type Conversation = { id: string; title: string; model: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string; status: string; created_at: string };
type Detail = Conversation & { messages: Message[] };
type Document = { id: string; filename: string; chunk_count: number };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/gateway").replace(/\/$/, "");

function MessageContent({ content }: { content: string }) {
  const blocks = content.split(/```/);
  return (
    <div className="space-y-4 whitespace-pre-wrap break-words leading-7">
      {blocks.map((block, index) => {
        if (index % 2 === 0) return block ? <p key={index}>{block}</p> : null;
        const [language, ...lines] = block.replace(/^\n/, "").split("\n");
        const code = lines.join("\n") || language;
        return (
          <div key={index} className="overflow-hidden rounded-2xl bg-[#242424] text-sm text-slate-100">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-slate-400">
              <span>{lines.length ? language || "code" : "text"}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(code)} className="hover:text-white">Copy</button>
            </div>
            <pre className="overflow-x-auto p-4 font-mono leading-6">{code}</pre>
          </div>
        );
      })}
    </div>
  );
}

export default function ChatWorkspace() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("qwen2.5:3b");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Detail | null>(null);
  const [prompt, setPrompt] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || "Request failed");
    return body;
  }

  function logout() {
    window.speechSynthesis?.cancel();
    sessionStorage.clear();
    router.replace("/login");
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Voice input is not supported by this browser. Try Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognition.current?.stop();
      return;
    }
    const instance = new SpeechRecognition();
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";
    instance.onresult = (event) => {
      const transcript = Array.from(event.results, (result) => result[0].transcript).join("");
      setPrompt(transcript);
    };
    instance.onerror = (event) => {
      if (event.error !== "aborted") setNotice(`Voice input failed: ${event.error}`);
    };
    instance.onend = () => setIsListening(false);
    recognition.current = instance;
    setIsListening(true);
    instance.start();
  }

  function speak(message: Message) {
    if (!window.speechSynthesis) {
      setNotice("Spoken responses are not supported by this browser.");
      return;
    }
    if (speakingMessageId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content.replace(/```[\\s\\S]*?```/g, "Code omitted."));
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  async function loadModels() {
    const data = await api("/chat/models");
    const chatModels = (data.models || []).filter((item: Model) => !/(embed|embedding)/i.test(item.name));
    setModels(chatModels);
    if (chatModels.length) {
      setModel((current) => chatModels.some((item: Model) => item.name === current) ? current : chatModels[0].name);
    } else {
      setNotice("No chat model is installed. Pull qwen2.5:3b in Ollama, then refresh.");
    }
  }

  async function loadConversations() { setConversations(await api("/conversations")); }
  async function loadDocuments() { setDocuments(await api("/knowledge/documents")); }
  async function openConversation(id: string) {
    try { setActive(await api(`/conversations/${id}`)); }
    catch (error) { setNotice((error as Error).message); }
  }

  async function createConversation() {
    try {
      const created = await api("/conversations", { method: "POST", body: JSON.stringify({ model }) });
      await loadConversations();
      await openConversation(created.id);
    } catch (error) { setNotice(`Could not create chat: ${(error as Error).message}`); }
  }

  async function renameConversation() {
    if (!active) return;
    const title = window.prompt("Rename chat", active.title);
    if (!title?.trim()) return;
    try {
      const updated = await api(`/conversations/${active.id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() }) });
      setActive({ ...active, ...updated });
      await loadConversations();
    } catch (error) { setNotice((error as Error).message); }
  }

  async function deleteConversation() {
    if (!active) return;
    setDeleteTarget(active);
  }

  async function confirmDeleteConversation() {
    if (!deleteTarget) return;
    try {
      await api(`/conversations/${deleteTarget.id}`, { method: "DELETE" });
      if (active?.id === deleteTarget.id) setActive(null);
      await loadConversations();
      setNotice("Conversation deleted.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setDeleteTarget(null); }
  }

  function deleteConversationById(conversation: Conversation) { setDeleteTarget(conversation); }

  async function changeModel(nextModel: string) {
    if (!active) { setModel(nextModel); return; }
    try {
      const updated = await api(`/conversations/${active.id}`, { method: "PATCH", body: JSON.stringify({ model: nextModel }) });
      setActive({ ...active, ...updated });
      setModel(nextModel);
      await loadConversations();
    } catch (error) { setNotice(`Could not change model: ${(error as Error).message}`); }
  }

  async function uploadDocument(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${base}/knowledge/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Upload failed");
      await loadDocuments();
      setNotice(`${data.filename} is ready for answers.`);
    } catch (error) { setNotice(`Upload failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  }

  async function deleteDocument(id: string) {
    try { await api(`/knowledge/documents/${id}`, { method: "DELETE" }); await loadDocuments(); }
    catch (error) { setNotice((error as Error).message); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    let chat = active;
    try {
      if (!chat) {
        const created = await api("/conversations", { method: "POST", body: JSON.stringify({ model }) });
        chat = await api(`/conversations/${created.id}`);
        setActive(chat);
        await loadConversations();
      }
      if (!chat) return;
      const content = prompt.trim();
      setPrompt("");
      setBusy(true);
      setNotice("");
      const requestId = crypto.randomUUID();
      const userMessageId = `local-user-${requestId}`;
      const assistantMessageId = `streaming-${requestId}`;
      const temporary: Message = { id: assistantMessageId, role: "assistant", content: "", status: "streaming", created_at: new Date().toISOString() };
      setActive((current) => current ? { ...current, messages: [...current.messages, { id: userMessageId, role: "user", content, status: "complete", created_at: new Date().toISOString() }, temporary] } : current);

      const response = await fetch(`${base}/conversations/${chat.id}/messages`, { method: "POST", headers, body: JSON.stringify({ content }) });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Message failed");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) continue;
          const item = JSON.parse(line);
          if (item.error) throw new Error(item.error);
          const part = item.message?.content || "";
          if (part) setActive((current) => current ? { ...current, messages: current.messages.map((message) => message.id === assistantMessageId ? { ...message, content: message.content + part } : message) } : current);
        }
      }
      setActive((current) => current ? { ...current, messages: current.messages.map((message) => message.id === assistantMessageId ? { ...message, status: "complete" } : message) } : current);
      await loadConversations();
    } catch (error) {
      setNotice(`Message failed: ${(error as Error).message}`);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("ollama_gateway_token");
    const stored = sessionStorage.getItem("ollama_gateway_user");
    if (!saved || !stored) { router.replace("/login"); return; }
    try { setToken(saved); setUser(JSON.parse(stored)); }
    catch { logout(); }
  }, [router]);

  useEffect(() => {
    if (!token) return;
    Promise.all([loadModels(), loadConversations(), loadDocuments()]).catch((error) => setNotice((error as Error).message));
  }, [token]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => () => {
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  if (!user) return <main className="grid min-h-screen place-items-center bg-[#212121] text-slate-400">Loading workspace…</main>;

  const selectedModel = active?.model || model;

  return (
    <main className="flex h-dvh overflow-hidden bg-[#212121] text-[#ececec]">
      <aside className={`${sidebarOpen ? "w-[280px]" : "w-0"} relative flex shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#171717] transition-all duration-200`}>
        <div className="flex h-full w-[280px] flex-col p-2.5">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-white/30 text-sm">◉</span>
            <div className="flex gap-2 text-slate-300"><span>⌕</span><span>▯</span></div>
          </div>
          <button onClick={createConversation} className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-[#2a2a2a]"><span className="text-lg">✎</span> New chat</button>
          <div className="mt-6 px-2 text-xs font-medium text-slate-400">Chats</div>
          <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {conversations.map((conversation) => (
              <div key={conversation.id} className={`group flex items-center rounded-lg ${active?.id === conversation.id ? "bg-[#2f2f2f]" : "hover:bg-[#2a2a2a]"}`}>
                <button onClick={() => openConversation(conversation.id)} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm">{conversation.title}</button>
                <button onClick={() => deleteConversationById(conversation)} aria-label={`Delete ${conversation.title}`} className="mr-1 rounded-md px-2 py-1 text-xs text-slate-400 opacity-0 hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100">✕</button>
              </div>
            ))}
            {!conversations.length && <p className="px-3 py-3 text-xs leading-5 text-slate-500">Your chat history will appear here.</p>}
          </div>
          <div className="border-t border-white/10 pt-2">
            <button onClick={() => setDocumentsOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[#2a2a2a]">▣ Knowledge base <span className="ml-auto text-xs text-slate-400">{documents.length}</span></button>
            {user.is_admin && <Link href="/" className="mt-1 block rounded-lg px-3 py-2 text-sm hover:bg-[#2a2a2a]">Admin dashboard</Link>}
            <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#2a2a2a]"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-600 text-[10px]">{user.email.slice(0, 1).toUpperCase()}</span><span className="truncate">{user.email}</span></button>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10">☰</button>
          <select value={selectedModel} onChange={(event) => void changeModel(event.target.value)} className="max-w-56 cursor-pointer appearance-none rounded-lg bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-white/10">
            <option value={selectedModel}>{selectedModel}</option>
            {models.filter((item) => item.name !== selectedModel).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
          {active && <div className="ml-auto flex gap-1"><button onClick={renameConversation} className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Rename</button><button onClick={deleteConversation} className="rounded-lg px-3 py-1.5 text-sm text-rose-200 hover:bg-white/10">Delete</button></div>}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 pb-44 pt-8 sm:pt-12">
            {active?.messages.length ? active.messages.filter((message) => message.role !== "system").map((message) => (
              <article key={message.id} className={`group mb-8 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={message.role === "user" ? "max-w-[82%] rounded-[24px] bg-[#303030] px-5 py-3 leading-7 shadow-sm" : "w-full px-1 py-1"}>
                  {message.content ? <MessageContent content={message.content} /> : message.status === "streaming" ? <span className="animate-pulse text-slate-400">Thinking…</span> : null}
                  {message.role === "assistant" && message.content && <div className="mt-3 flex gap-3 text-sm text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"><button type="button" onClick={() => navigator.clipboard.writeText(message.content)} className="hover:text-white">▣ Copy</button><button type="button" onClick={() => speak(message)} className="hover:text-white">{speakingMessageId === message.id ? "Stop audio" : "Listen"}</button><span>⌘</span><span>↻</span></div>}
                </div>
              </article>
            )) : (
              <div className="pt-24 text-center sm:pt-32">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl font-black text-[#212121] shadow-xl shadow-black/20">O</div>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.5rem]">How can I help you today?</h1>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">Ask questions, work with your private documents, or explore ideas with your local model.</p>
                <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
                  <button onClick={() => setPrompt("Summarize my uploaded documents")} className="rounded-xl border border-white/10 bg-[#2a2a2a] px-4 py-3 text-sm text-slate-200 transition hover:bg-[#333333]">Summarize my documents</button>
                  <button onClick={() => setPrompt("Help me plan a project")} className="rounded-xl border border-white/10 bg-[#2a2a2a] px-4 py-3 text-sm text-slate-200 transition hover:bg-[#333333]">Help me plan a project</button>
                  <button onClick={() => setPrompt("Explain this clearly with examples")} className="rounded-xl border border-white/10 bg-[#2a2a2a] px-4 py-3 text-sm text-slate-200 transition hover:bg-[#333333]">Explain a topic</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={send} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent px-4 pb-5 pt-14">
          <div className="mx-auto max-w-3xl">
            <input ref={fileInput} type="file" accept=".txt,.md,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); event.currentTarget.value = ""; }} />
            <div className="rounded-[28px] border border-white/10 bg-[#303030] p-3 shadow-2xl shadow-black/30 transition focus-within:border-white/20 focus-within:bg-[#353535]">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={busy} rows={1} placeholder="Ask anything" className="max-h-48 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-slate-400" />
              <div className="flex items-center justify-between"><div className="flex items-center gap-1"><button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10">＋ Add document</button><button type="button" onClick={startVoiceInput} disabled={busy} aria-pressed={isListening} className={`rounded-lg px-2 py-1 text-sm transition ${isListening ? "bg-rose-500/20 text-rose-200" : "text-slate-300 hover:bg-white/10"}`}>{isListening ? "Stop recording" : "Voice input"}</button></div><button disabled={busy || !prompt.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg text-black transition hover:bg-slate-200 disabled:bg-slate-600 disabled:text-slate-400">↑</button></div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Ollama can make mistakes. Check important information.</p>
          </div>
        </form>
      </section>

      {notice && <div role="status" className={`fixed right-5 top-5 z-30 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl ${/failed|could not|error|no chat model/i.test(notice) ? "border-rose-400/30 bg-rose-950/95 text-rose-100" : "border-emerald-400/30 bg-emerald-950/95 text-emerald-100"}`}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-xs">{/failed|could not|error|no chat model/i.test(notice) ? "!" : "✓"}</span><p className="flex-1 text-sm leading-5">{notice}</p><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification" className="text-lg leading-4 opacity-70 hover:opacity-100">×</button></div>}

      {deleteTarget && <div role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#2a2a2a] p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-rose-500/15 text-rose-300">!</span><div><h2 id="delete-chat-title" className="font-semibold">Delete conversation?</h2><p className="mt-1 text-sm text-slate-400">“{deleteTarget.title}” and its messages will be permanently removed.</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm hover:bg-white/10">Cancel</button><button type="button" onClick={() => void confirmDeleteConversation()} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400">Delete</button></div></div></div>}

      {documentsOpen && <aside className="absolute inset-y-0 right-0 z-20 w-full max-w-sm border-l border-white/10 bg-[#171717] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Knowledge base</h2><p className="text-xs text-slate-400">Private RAG documents</p></div><button onClick={() => setDocumentsOpen(false)} className="rounded-lg p-2 hover:bg-white/10">✕</button></div><button type="button" onClick={() => fileInput.current?.click()} className="mt-5 w-full rounded-xl border border-dashed border-white/20 px-4 py-5 text-sm text-slate-300 hover:bg-white/5">＋ Upload a TXT, MD, or PDF</button><p className="mt-2 text-xs text-slate-500">Documents are indexed privately and supplied only when relevant.</p><div className="mt-6 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl bg-[#2f2f2f] p-3"><span className="min-w-0 flex-1 truncate text-sm">{document.filename}<small className="ml-2 text-slate-400">{document.chunk_count} chunks</small></span><button onClick={() => deleteDocument(document.id)} className="text-xs text-rose-300 hover:text-rose-200">Delete</button></div>)}{!documents.length && <p className="text-sm text-slate-400">No documents yet.</p>}</div></aside>}
    </main>
  );
}
