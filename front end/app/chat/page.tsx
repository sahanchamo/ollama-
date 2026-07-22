"use client";

import Link from "next/link";
import { ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

type User = { email: string; is_admin: boolean };
type Model = { name: string };
type Conversation = { id: string; title: string; model: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string; status: string; created_at: string; images?: string[] };
type Detail = Conversation & { messages: Message[] };
type Memory = { id: string; content: string; created_at: string };
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

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="break-words leading-7 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:my-3 [&_ol]:list-decimal [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-[#242424] [&_pre]:p-4 [&_pre]:leading-6 [&_ul]:my-3 [&_ul]:list-disc">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

export default function ChatWorkspace() {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [hideModelPicker, setHideModelPicker] = useState(false);
  const [model, setModel] = useState("qwen3:4b");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Detail | null>(null);
  const [prompt, setPrompt] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ name: string; data: string }[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [draggingImages, setDraggingImages] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Record<string, string>>({});
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [responseLanguage, setResponseLanguage] = useState("");
  const [webResearch, setWebResearch] = useState(false);

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
    instance.lang = responseLanguage === "Sinhala" ? "si-LK" : navigator.language || "en-US";
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
    utterance.lang = responseLanguage === "Sinhala" ? "si-LK" : navigator.language || "en-US";
    utterance.rate = 1;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  async function loadModels() {
    const data = await api("/chat/models");
    setHideModelPicker(Boolean(data.hide_model_picker));
    const chatModels = (data.models || []).filter((item: Model) => !/(embed|embedding)/i.test(item.name));
    setModels(chatModels);
    if (chatModels.length) {
      const fallback = chatModels[0].name;
      setModel((current) => chatModels.some((item: Model) => item.name === current) ? current : fallback);
      if (active && !chatModels.some((item: Model) => item.name === active.model)) {
        const updated = await api(`/conversations/${active.id}`, { method: "PATCH", body: JSON.stringify({ model: fallback }) });
        setActive((current) => current?.id === active.id ? { ...current, ...updated } : current);
        setNotice(`${active.model} is hidden by an administrator. Switched this chat to ${fallback}.`);
      }
    } else {
      setNotice("No chat model is installed. Pull qwen2.5:3b in Ollama, then refresh.");
    }
  }

  async function loadConversations() { setConversations(await api("/conversations")); }
  async function loadMemories() { setMemories(await api("/memory")); }
  async function saveMemory() {
    const content = memoryDraft.trim();
    if (!content) return;
    try {
      await api("/memory", { method: "POST", body: JSON.stringify({ content }) });
      setMemoryDraft("");
      await loadMemories();
      setNotice("Memory saved for future chats.");
    } catch (error) { setNotice(`Could not save memory: ${(error as Error).message}`); }
  }
  async function deleteMemory(id: string) {
    try { await api(`/memory/${id}`, { method: "DELETE" }); await loadMemories(); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function openConversation(id: string) {
    try { setActive(await api(`/conversations/${id}`)); }
    catch (error) { setNotice((error as Error).message); }
  }

  async function createConversation() {
    try {
      setActive(null); setPrompt(""); setAttachedImages([]); setAttachmentMenuOpen(false);
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

  async function addScreenshot(file: File) {
    if (!file.type.startsWith("image/")) { setNotice("Choose a PNG, JPG, WEBP, or other image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setNotice("Each screenshot must be 5 MB or smaller."); return; }
    if (attachedImages.length >= 4) { setNotice("You can attach up to four screenshots per message."); return; }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read image")); reader.readAsDataURL(file); });
      const data = dataUrl.split(",")[1];
      if (!data) throw new Error("Could not read image");
      setAttachedImages((current) => [...current, { name: file.name, data }]);
    } catch (error) { setNotice((error as Error).message); }
  }

  async function regenerateResponse(message: Message) {
    if (!active || regeneratingMessageId) return;
    setRegeneratingMessageId(message.id);
    try {
      const alternative = await api(`/conversations/${active.id}/messages/${message.id}/regenerate`, { method: "POST" });
      setAlternatives((current) => ({ ...current, [message.id]: alternative.content }));
    } catch (error) { setNotice(`Could not regenerate response: ${(error as Error).message}`); }
    finally { setRegeneratingMessageId(null); }
  }

  async function chooseAlternative(message: Message, content: string) {
    if (!active) return;
    try {
      const updated = await api(`/conversations/${active.id}/messages/${message.id}/content`, { method: "PUT", body: JSON.stringify({ content }) });
      setActive((current) => current ? { ...current, messages: current.messages.map((item) => item.id === message.id ? updated : item) } : current);
      setAlternatives((current) => { const next = { ...current }; delete next[message.id]; return next; });
      setNotice("Your preferred answer was saved.");
    } catch (error) { setNotice(`Could not save preferred answer: ${(error as Error).message}`); }
  }

  async function addScreenshots(files: File[]) {
    for (const file of files) {
      if (attachedImages.length >= 4) break;
      await addScreenshot(file);
    }
  }

  async function attachDocuments(files: File[]) {
    const selected = files.filter((file) => file.size <= 10 * 1024 * 1024);
    if (!selected.length) { setNotice("Choose text/code files that are 10 MB or smaller."); return; }
    if (selected.length !== files.length) setNotice("Some files were skipped because they exceed 10 MB.");
    setBusy(true);
    try {
      let chat = active;
      if (!chat) {
        const created = await api("/conversations", { method: "POST", body: JSON.stringify({ model }) });
        await loadConversations();
        chat = await api(`/conversations/${created.id}`);
        setActive(chat);
      }
      if (!chat) throw new Error("Could not create a chat for this document");
      const attached: string[] = [];
      for (const file of selected) {
        const form = new FormData(); form.append("file", file, file.webkitRelativePath || file.name);
        const response = await fetch(`${base}/knowledge/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        const document = await response.json().catch(() => null);
        if (!response.ok) throw new Error(document?.detail || `Could not upload ${file.name}`);
        await api(`/conversations/${chat.id}/knowledge/${document.id}`, { method: "PUT" });
        attached.push(document.filename);
      }
      setNotice(`${attached.length} file${attached.length === 1 ? "" : "s"} attached to this chat and ready to use.`);
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  function pasteScreenshots(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (!images.length) return;
    event.preventDefault();
    void addScreenshots(images);
  }


  async function send(event: FormEvent) {
    event.preventDefault();
    if ((!prompt.trim() && !attachedImages.length) || busy) return;
    let chat = active;
    try {
      if (!chat) {
        const created = await api("/conversations", { method: "POST", body: JSON.stringify({ model }) });
        chat = await api(`/conversations/${created.id}`);
        setActive(chat);
        await loadConversations();
      }
      if (!chat) return;
      const content = prompt.trim() || "Please analyze these screenshots.";
      const images = attachedImages.map((image) => image.data);
      setPrompt("");
      setAttachedImages([]);
      setBusy(true);
      setNotice("");
      const requestId = createRequestId();
      const userMessageId = `local-user-${requestId}`;
      const assistantMessageId = `streaming-${requestId}`;
      const temporary: Message = { id: assistantMessageId, role: "assistant", content: "", status: "streaming", created_at: new Date().toISOString() };
      setActive((current) => current ? { ...current, messages: [...current.messages, { id: userMessageId, role: "user", content, images, status: "complete", created_at: new Date().toISOString() }, temporary] } : current);

      const activeSkills = JSON.parse(localStorage.getItem("starlen_active_skill_sets") || "[]");
      const response = await fetch(`${base}/conversations/${chat.id}/messages`, { method: "POST", headers, body: JSON.stringify({ content, images, skill_set_ids: Array.isArray(activeSkills) ? activeSkills.slice(0, 5) : [], use_web: webResearch }) });
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
    if (!saved || !stored) { router.replace("/guest"); return; }
    try { setToken(saved); setUser(JSON.parse(stored)); }
    catch { logout(); }
  }, [router]);

  useEffect(() => {
    if (!token) return;
    Promise.all([loadModels(), loadConversations(), loadMemories(), api("/account/preferences")])
      .then(([, , , preferences]) => setResponseLanguage(preferences?.response_language || ""))
      .catch((error) => setNotice((error as Error).message));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const refreshModels = () => void loadModels().catch((error) => setNotice((error as Error).message));
    const onStorage = (event: StorageEvent) => { if (event.key === "starlen_model_policy_updated") refreshModels(); };
    window.addEventListener("focus", refreshModels);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("focus", refreshModels); window.removeEventListener("storage", onStorage); };
  }, [token, active?.id]);

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
    <main className="flex h-dvh overflow-hidden bg-[#212121] text-[#ececec]" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); setDraggingImages(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); }} onDrop={(event) => { event.preventDefault(); setDraggingImages(false); void addScreenshots(Array.from(event.dataTransfer.files)); }}>
      <aside className={`${sidebarOpen ? "w-[280px]" : "w-0"} relative flex shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#212121] transition-all duration-200`}>
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
            <Link href="/settings" className="mt-1 block rounded-lg px-3 py-2 text-sm hover:bg-[#2a2a2a]">Settings & API keys</Link>
            {user.is_admin && <Link href="/" className="mt-1 block rounded-lg px-3 py-2 text-sm hover:bg-[#2a2a2a]">Admin dashboard</Link>}
            <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#2a2a2a]"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-600 text-[10px]">{user.email.slice(0, 1).toUpperCase()}</span><span className="truncate">{user.email}</span></button>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10">☰</button>
          {!hideModelPicker && <div className="model-picker"><span>Model</span><select value={selectedModel} onChange={(event) => void changeModel(event.target.value)} aria-label="Select AI model" disabled={!models.length}>
            {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select><button type="button" onClick={() => void loadModels()} title="Refresh installed models" aria-label="Refresh models">↻</button></div>
          }
          <button onClick={() => setMemoriesOpen(true)} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">Memory</button>
          {active && <div className="ml-auto flex gap-1"><button onClick={renameConversation} className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Rename</button><button onClick={deleteConversation} className="rounded-lg px-3 py-1.5 text-sm text-rose-200 hover:bg-white/10">Delete</button></div>}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 pb-44 pt-8 sm:pt-12">
            {active?.messages.length ? active.messages.filter((message) => message.role !== "system").map((message) => (
              <article key={message.id} className={`group mb-8 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={message.role === "user" ? "max-w-[82%] rounded-[24px] bg-[#303030] px-5 py-3 leading-7 shadow-sm" : "w-full px-1 py-1"}>
                  {message.images?.length ? <div className="mb-3 flex flex-wrap gap-2">{message.images.map((image, index) => <img key={`${message.id}-${index}`} src={`data:image/*;base64,${image}`} alt={`Attached screenshot ${index + 1}`} className="max-h-56 max-w-full rounded-xl border border-white/10 object-contain" />)}</div> : null}
                  {message.content ? <MessageContent content={message.content} /> : message.status === "streaming" ? <span className="animate-pulse text-slate-400">Thinking…</span> : null}
                  {message.role === "assistant" && message.content && <><div className="mt-3 flex gap-3 text-sm text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"><button type="button" onClick={() => navigator.clipboard.writeText(message.content)} className="hover:text-white">▣ Copy</button><button type="button" onClick={() => speak(message)} className="hover:text-white">{speakingMessageId === message.id ? "Stop audio" : "Listen"}</button><button type="button" onClick={() => void regenerateResponse(message)} disabled={regeneratingMessageId === message.id} className="hover:text-white disabled:opacity-50">{regeneratingMessageId === message.id ? "Regenerating…" : "↻ Regenerate"}</button></div>{alternatives[message.id] && <div className="mt-5 rounded-2xl border border-sky-300/25 bg-sky-300/5 p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-200">Alternative answer</p><div className="mt-3"><MessageContent content={alternatives[message.id]} /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setAlternatives((current) => { const next = { ...current }; delete next[message.id]; return next; })} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10">Keep original</button><button type="button" onClick={() => void chooseAlternative(message, alternatives[message.id])} className="rounded-lg bg-sky-300 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-200">Use alternative</button></div></div>}</>}
                </div>
              </article>
            )) : (
              <div className="pt-24 text-center sm:pt-32">
                <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-[22px] shadow-2xl shadow-violet-950/50"><img src="/icon.svg" alt="Starlen" className="h-full w-full" /></div>
                <p className="mt-4 text-xs font-bold tracking-[.34em] text-sky-300">STARLEN</p>
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

        <form onSubmit={send} className="absolute inset-x-0 bottom-0 bg-[#212121] px-4 pb-5 pt-5">
          <div className="mx-auto max-w-3xl">
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addScreenshot(file); event.currentTarget.value = ""; }} />
            <input ref={documentInput} type="file" multiple className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void attachDocuments(files); event.currentTarget.value = ""; }} />
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setWebResearch((enabled) => !enabled)} disabled={busy} aria-pressed={webResearch} title="Search the internet and cite sources" className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${webResearch ? "border-sky-300/50 bg-sky-300/15 text-sky-100" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>{webResearch ? "Web research on" : "Web research"}</button></div>
            {/* Folder input uses Chromium's directory picker, supported by VS Code/Chrome-based browsers. */}
            {/* @ts-expect-error webkitdirectory is a browser-specific input attribute. */}
            <input ref={folderInput} type="file" multiple webkitdirectory="" className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void attachDocuments(files); event.currentTarget.value = ""; }} />
            <div className="rounded-[28px] border border-white/10 bg-[#303030] p-3 shadow-2xl shadow-black/30 transition focus-within:border-white/20 focus-within:bg-[#353535]">
              {attachedImages.length > 0 && <div className="mb-2 flex flex-wrap gap-2 px-2">{attachedImages.map((image, index) => <div key={`${image.name}-${index}`} className="group relative"><img src={`data:image/*;base64,${image.data}`} alt={image.name} className="h-16 w-20 rounded-lg border border-white/10 object-cover" /><button type="button" onClick={() => setAttachedImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${image.name}`} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-black text-xs opacity-0 group-hover:opacity-100">×</button></div>)}</div>}
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={pasteScreenshots} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={busy} rows={1} placeholder="Ask anything · paste a screenshot with Ctrl+V" className="max-h-48 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-slate-400" />
              <div className="flex items-center justify-between"><div className="relative flex items-center gap-1"><button type="button" onClick={() => setAttachmentMenuOpen((open) => !open)} disabled={busy} aria-expanded={attachmentMenuOpen} className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50">📎 Attach</button>{attachmentMenuOpen && <div className="absolute bottom-10 left-0 z-20 w-44 rounded-xl border border-white/10 bg-[#252525] p-1 shadow-2xl"><button type="button" onClick={() => { setAttachmentMenuOpen(false); documentInput.current?.click(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Upload files</button><button type="button" onClick={() => { setAttachmentMenuOpen(false); folderInput.current?.click(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Upload folder</button></div>}<button type="button" onClick={startVoiceInput} disabled={busy} aria-pressed={isListening} className={`rounded-lg px-2 py-1 text-sm transition ${isListening ? "bg-rose-500/20 text-rose-200" : "text-slate-300 hover:bg-white/10"}`}>{isListening ? "Stop recording" : "Voice input"}</button></div><button disabled={busy || (!prompt.trim() && !attachedImages.length)} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg text-black transition hover:bg-slate-200 disabled:bg-slate-600 disabled:text-slate-400">↑</button></div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Ollama can make mistakes. Check important information.</p>
          </div>
        </form>
      </section>

      {notice && <div role="status" className={`fixed right-5 top-5 z-30 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl ${/failed|could not|error|no chat model/i.test(notice) ? "border-rose-400/30 bg-rose-950/95 text-rose-100" : "border-emerald-400/30 bg-emerald-950/95 text-emerald-100"}`}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-xs">{/failed|could not|error|no chat model/i.test(notice) ? "!" : "✓"}</span><p className="flex-1 text-sm leading-5">{notice}</p><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification" className="text-lg leading-4 opacity-70 hover:opacity-100">×</button></div>}

      {draggingImages && <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[32px] border-2 border-dashed border-sky-300 bg-sky-400/10 backdrop-blur-sm"><div className="rounded-3xl border border-white/20 bg-[#1d2538]/95 px-10 py-8 text-center shadow-2xl"><div className="text-3xl">▧</div><h2 className="mt-3 text-xl font-semibold">Drop screenshots to analyze</h2><p className="mt-2 text-sm text-slate-300">Up to four images · 5 MB each · use a vision model</p></div></div>}
      {deleteTarget && <div role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#2a2a2a] p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-rose-500/15 text-rose-300">!</span><div><h2 id="delete-chat-title" className="font-semibold">Delete conversation?</h2><p className="mt-1 text-sm text-slate-400">“{deleteTarget.title}” and its messages will be permanently removed.</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm hover:bg-white/10">Cancel</button><button type="button" onClick={() => void confirmDeleteConversation()} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400">Delete</button></div></div></div>}

      {memoriesOpen && <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-white/10 bg-[#171717] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Long-term memory</h2><p className="text-xs text-slate-400">Private facts and preferences used across chats</p></div><button onClick={() => setMemoriesOpen(false)} aria-label="Close memory" className="rounded-lg p-2 hover:bg-white/10">Close</button></div><textarea value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} maxLength={2000} rows={4} placeholder="Example: I prefer concise answers and work in Sri Lanka." className="mt-5 w-full resize-none rounded-xl border border-white/10 bg-[#2a2a2a] p-3 text-sm outline-none focus:border-white/30" /><button type="button" onClick={() => void saveMemory()} disabled={!memoryDraft.trim()} className="mt-2 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:bg-slate-600 disabled:text-slate-300">Save memory</button><p className="mt-3 text-xs leading-5 text-slate-500">Memories are used as private context in future chats. Delete any memory you no longer want used.</p><div className="mt-5 space-y-2 overflow-y-auto"><h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Saved memories</h3>{memories.map((memory) => <div key={memory.id} className="rounded-xl bg-[#2f2f2f] p-3"><p className="whitespace-pre-wrap text-sm leading-5">{memory.content}</p><button onClick={() => void deleteMemory(memory.id)} className="mt-2 text-xs text-rose-300 hover:text-rose-200">Delete</button></div>)}{!memories.length && <p className="text-sm text-slate-400">No saved memories yet.</p>}</div></aside>}
    </main>
  );
}
