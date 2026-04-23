import type { AgentState, ProjectFile, TextFile } from "@agentchan/types";
import { Idiomorph } from "/api/host/lib/idiomorph.js";

const slug = location.pathname.match(/\/projects\/([^/]+)\//)?.[1] ?? "";
const root = document.getElementById("root")!;

let state: AgentState = {
  messages: [],
  pendingToolCalls: [],
  isStreaming: false,
};
let files: ProjectFile[] = [];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderBasicMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, '<hr class="sep" />')
    .replace(/\n/g, "<br />");
}

function isContentFile(f: ProjectFile): f is TextFile {
  return f.type === "text" && !f.frontmatter;
}

function buildHTML(): string {
  const content = files.filter(isContentFile);
  if (content.length === 0) {
    return `<div class="empty">아직 출력 파일이 없습니다</div>`;
  }
  return content
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file, i) => {
      const separator = i > 0 ? '<hr class="sep" />' : "";
      const header = `<div class="path">${escapeHtml(file.path)}</div>`;
      const body = `<div class="body">${renderBasicMarkdown(file.content)}</div>`;
      return `${separator}${header}${body}`;
    })
    .join("\n");
}

function render(): void {
  Idiomorph.morph(root, buildHTML(), { morphStyle: "innerHTML" });
}

async function loadFiles(): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/files`);
  files = await res.json();
}

const sse = new EventSource(`/api/projects/${slug}/state/stream`);
sse.addEventListener("snapshot", (e) => {
  state = JSON.parse((e as MessageEvent<string>).data).state;
  render();
});
sse.addEventListener("append", (e) => {
  const { message } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, messages: [...state.messages, message] };
  render();
});
sse.addEventListener("streaming", (e) => {
  const { message } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, streamingMessage: message, isStreaming: true };
  render();
});
sse.addEventListener("streaming_clear", () => {
  state = { ...state, streamingMessage: undefined, isStreaming: false };
  loadFiles().then(render);
});

await loadFiles();
render();
