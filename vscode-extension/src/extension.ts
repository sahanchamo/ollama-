import * as vscode from "vscode";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(exec);
const TOKEN_KEY = "starlen.gatewayToken";
const output = vscode.window.createOutputChannel("Starlen Coding Assistant");

type CommandProposal = { command: string; explanation?: string };

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand("starlen.configureToken", () => configureToken(context)));
  context.subscriptions.push(vscode.commands.registerCommand("starlen.ask", () => ask(context)));
  context.subscriptions.push(vscode.commands.registerCommand("starlen.explainSelection", () => ask(context, "Explain the selected code, identify risks, and suggest a small, safe improvement.")));
  output.appendLine("Starlen Coding Assistant is ready.");
}

async function configureToken(context: vscode.ExtensionContext) {
  const token = await vscode.window.showInputBox({ prompt: "Starlen API token", password: true, ignoreFocusOut: true });
  if (!token) return;
  await context.secrets.store(TOKEN_KEY, token.trim());
  vscode.window.showInformationMessage("Starlen token stored securely in VS Code Secret Storage.");
}

async function ask(context: vscode.ExtensionContext, preset?: string) {
  const token = await context.secrets.get(TOKEN_KEY);
  if (!token) { vscode.window.showWarningMessage("Set your Starlen API token first.", "Set token").then((choice) => choice && configureToken(context)); return; }
  const prompt = preset || await vscode.window.showInputBox({ prompt: "Ask Starlen about this workspace", placeHolder: "Example: Find the cause of this TypeScript error and propose a fix" });
  if (!prompt) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { vscode.window.showWarningMessage("Open a workspace folder before asking the coding assistant."); return; }
  const configuration = vscode.workspace.getConfiguration("starlen");
  const maxContext = configuration.get<number>("maxContextCharacters", 12000);
  const editor = vscode.window.activeTextEditor;
  const document = editor?.document;
  const selection = editor && !editor.selection.isEmpty ? document?.getText(editor.selection) : "";
  const activeFile = document ? vscode.workspace.asRelativePath(document.uri) : "No active file";
  const activeText = document?.getText().slice(0, maxContext) || "";
  const message = `Workspace: ${folder.name}\nActive file: ${activeFile}\n\nSelected code:\n${selection || "(none)"}\n\nActive file context:\n${activeText || "(none)"}\n\nRequest:\n${prompt}`;
  const progress = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Starlen is analysing your workspace", cancellable: false }, () => requestAssistant(token, message));
  output.show(true); output.appendLine(`\n# ${prompt}\n${progress}`);
  const proposals = parseCommands(progress);
  const answer = progress.replace(/<starlen-command>[\s\S]*?<\/starlen-command>/g, "").trim();
  if (answer) vscode.window.showInformationMessage("Starlen response added to the Output panel.");
  for (const proposal of proposals) await runProposal(proposal, folder.uri.fsPath);
}

async function requestAssistant(token: string, content: string): Promise<string> {
  const config = vscode.workspace.getConfiguration("starlen");
  const base = config.get<string>("apiBaseUrl", "https://ai.starlen.online/api/v1").replace(/\/$/, "");
  const model = config.get<string>("model", "qwen3:4b");
  const system = `You are Starlen, a precise coding assistant. Give concise, practical explanations. You may propose shell commands only when useful. Every command must be inside <starlen-command>{"command":"...","explanation":"..."}</starlen-command>. Never claim a command has run. Prefer safe, workspace-scoped commands. Do not include secrets or destructive commands.`;
  const response = await fetch(`${base}/chat`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: false, think: false, messages: [{ role: "system", content: system }, { role: "user", content }] }) });
  const body = await response.json().catch(() => null) as { detail?: string; message?: { content?: string }; response?: string } | null;
  if (!response.ok) throw new Error(body?.detail || `Gateway request failed (${response.status})`);
  return body?.message?.content || body?.response || "The model returned no text.";
}

function parseCommands(content: string): CommandProposal[] {
  return [...content.matchAll(/<starlen-command>\s*([\s\S]*?)\s*<\/starlen-command>/g)].flatMap((match) => { try { const proposal = JSON.parse(match[1]) as CommandProposal; return proposal.command ? [proposal] : []; } catch { return []; } });
}

async function runProposal(proposal: CommandProposal, cwd: string) {
  const mode = vscode.workspace.getConfiguration("starlen").get<string>("commandExecutionMode", "ask");
  if (mode !== "allow") {
    const choice = await vscode.window.showWarningMessage(`Starlen proposes: ${proposal.command}${proposal.explanation ? ` — ${proposal.explanation}` : ""}`, { modal: true }, "Run command", "Skip");
    if (choice !== "Run command") { output.appendLine(`Skipped: ${proposal.command}`); return; }
  }
  output.appendLine(`$ ${proposal.command}`);
  try { const result = await execute(proposal.command, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 }); output.appendLine(result.stdout || "Command completed."); if (result.stderr) output.appendLine(result.stderr); }
  catch (error) { const failure = error as { stdout?: string; stderr?: string; message: string }; output.appendLine(failure.stdout || ""); output.appendLine(failure.stderr || failure.message); vscode.window.showErrorMessage("Starlen command failed. See the Output panel."); }
}

export function deactivate() {}
