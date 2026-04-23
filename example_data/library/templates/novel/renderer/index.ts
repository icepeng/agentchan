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

function renderMarkdown(text: string): string {
  let html = escapeHtml(text).replace(/\r\n/g, "\n");

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/^---$/gm, "<hr/>");
  html = html.replace(/^&gt;\s*(.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^-\s+(.*)$/gm, "<li>$1</li>");

  const blocks = html.split(/\n\n+/);
  const renderedBlocks = blocks.map((block) => {
    let trimmed = block.trim();
    if (!trimmed) return "";

    trimmed = trimmed.replace(/<\/blockquote>\n<blockquote>/g, "<br/>");

    if (/^<h[1-6]>.*<\/h[1-6]>$/.test(trimmed) || trimmed === "<hr/>") {
      return trimmed;
    }

    if (trimmed.includes("<li>")) {
      const lines = trimmed.split("\n");
      let out = "";
      let inList = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith("<li>")) {
          if (!inList) {
            out += "<ul>\n";
            inList = true;
          }
          out += line + "\n";
        } else {
          if (inList) {
            out += "</ul>\n";
            inList = false;
          }
          const isBlock =
            /^<h[1-6]>/.test(line) ||
            /^<blockquote/.test(line) ||
            line === "<hr/>";
          out += line + (isBlock ? "\n" : "<br/>\n");
        }
      }
      if (inList) out += "</ul>\n";
      return out.replace(/<br\/>\n$/, "\n").trim();
    }

    if (
      trimmed.startsWith("<blockquote") &&
      trimmed.endsWith("</blockquote>")
    ) {
      return trimmed;
    }

    return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
  });

  return renderedBlocks.join("\n");
}

function isTextFile(f: ProjectFile): f is TextFile {
  return f.type === "text";
}

function buildHTML(): string {
  const textFiles = files.filter(isTextFile);
  if (textFiles.length === 0) {
    return `<div class="rb-empty">아직 출력 파일이 없습니다</div>`;
  }

  const isChar = (p: string) => /character|캐릭터|인물/i.test(p);
  const isWorld = (p: string) => /world|setting|lore|세계관|설정/i.test(p);
  const isOutline = (p: string) =>
    /outline|plot|synopsis|아웃라인|플롯|시놉시스/i.test(p);

  const charsFiles = textFiles.filter((f) => isChar(f.path));
  const worldFiles = textFiles.filter((f) => !isChar(f.path) && isWorld(f.path));
  const outlineFiles = textFiles.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && isOutline(f.path),
  );
  const novelFiles = textFiles.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && !isOutline(f.path),
  );

  charsFiles.sort((a, b) => a.path.localeCompare(b.path));
  worldFiles.sort((a, b) => a.path.localeCompare(b.path));
  outlineFiles.sort((a, b) => a.path.localeCompare(b.path));
  novelFiles.sort((a, b) => a.path.localeCompare(b.path));

  const renderProseSection = (
    sectionFiles: TextFile[],
    emptyMessage: string,
  ) => {
    if (sectionFiles.length === 0)
      return `<div class="rb-empty">${emptyMessage}</div>`;
    return sectionFiles
      .map((f, i) => {
        const sep = i > 0 ? `<div class="rb-file-separator"></div>` : "";
        return `${sep}<div>${renderMarkdown(f.content)}</div>`;
      })
      .join("\n");
  };

  const novelHtml = renderProseSection(novelFiles, "아직 작성된 챕터가 없습니다.");
  const outlineHtml = renderProseSection(outlineFiles, "아직 아웃라인이 없습니다.");
  const worldHtml = renderProseSection(worldFiles, "아직 세계 설정이 없습니다.");

  const charsHtml =
    charsFiles.length > 0
      ? charsFiles
          .map((f) => `<div class="rb-char-card">${renderMarkdown(f.content)}</div>`)
          .join("\n")
      : `<div class="rb-empty">아직 캐릭터가 없습니다.</div>`;

  let defaultTab = "novel";
  if (novelFiles.length > 0) defaultTab = "novel";
  else if (outlineFiles.length > 0) defaultTab = "outline";
  else if (worldFiles.length > 0) defaultTab = "world";
  else if (charsFiles.length > 0) defaultTab = "chars";

  return `
    <div class="rb-layout">
      <input type="radio" id="tab-novel" name="rb-tabs" ${defaultTab === "novel" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-outline" name="rb-tabs" ${defaultTab === "outline" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-world" name="rb-tabs" ${defaultTab === "world" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-chars" name="rb-tabs" ${defaultTab === "chars" ? "checked" : ""} class="rb-tab-radio">

      <div class="rb-tabs-header">
        <label for="tab-novel" class="rb-tab-label">이야기</label>
        <label for="tab-outline" class="rb-tab-label">아웃라인</label>
        <label for="tab-world" class="rb-tab-label">세계 설정</label>
        <label for="tab-chars" class="rb-tab-label">캐릭터</label>
      </div>

      <div class="rb-tab-content rb-content-novel">
        <div class="rb-prose">${novelHtml}</div>
      </div>

      <div class="rb-tab-content rb-content-outline">
        <div class="rb-prose">${outlineHtml}</div>
      </div>

      <div class="rb-tab-content rb-content-world">
        <div class="rb-prose">${worldHtml}</div>
      </div>

      <div class="rb-tab-content rb-content-chars">
        <div class="rb-chars">${charsHtml}</div>
      </div>
    </div>
  `;
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
