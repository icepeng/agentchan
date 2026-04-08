interface RenderContext {
  outputFiles: { path: string; content: string; modifiedAt: number }[];
  skills: { name: string; description: string; metadata?: Record<string, string> }[];
  baseUrl: string;
}

// ── Helpers ──────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return result;
}

// ── Section Parsing ─────────────────────────

interface Section {
  id: string;
  title: string;
  icon: string;
  content: string;
}

const SECTION_MAP: Record<string, { id: string; icon: string }> = {
  "전체 줄거리": { id: "plot", icon: "📜" },
  "최신 화": { id: "latest", icon: "✨" },
  "등장인물": { id: "characters", icon: "👥" },
  "주요 사건": { id: "events", icon: "⚡" },
  "현재 상황": { id: "status", icon: "📍" },
};

interface ParseResult {
  title: string;
  sections: Section[];
}

function parseSummary(content: string): ParseResult {
  let title = "이야기 요약";
  const sections: Section[] = [];
  const lines = content.split("\n");
  let current: Section | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !current) {
      title = h1[1].trim();
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current) {
        current.content = buffer.join("\n").trim();
        sections.push(current);
      }
      const sectionTitle = h2[1].trim();
      const mapped = SECTION_MAP[sectionTitle];
      current = {
        id: mapped?.id ?? sectionTitle.toLowerCase().replace(/\s+/g, "-"),
        title: sectionTitle,
        icon: mapped?.icon ?? "📋",
        content: "",
      };
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }

  if (current) {
    current.content = buffer.join("\n").trim();
    sections.push(current);
  }

  return { title, sections };
}

// ── Content Renderers ───────────────────────

function renderParagraph(text: string): string {
  if (!text) return "";
  return `<p class="sm-paragraph">${formatInline(text)}</p>`;
}

function renderCharacterList(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const items = lines.map((line) => {
    const match = line.match(/^-\s+\*\*(.+?)\*\*:\s*(.+?)(?:\s*—\s*(.+))?$/);
    if (match) {
      const name = escapeHtml(match[1]);
      const role = escapeHtml(match[2]);
      const desc = match[3] ? escapeHtml(match[3]) : "";
      return `
        <div class="sm-char-item">
          <div class="sm-char-initial">${name.charAt(0)}</div>
          <div class="sm-char-info">
            <span class="sm-char-name">${name}</span>
            <span class="sm-char-role">${role}</span>
            ${desc ? `<span class="sm-char-desc">${desc}</span>` : ""}
          </div>
        </div>`;
    }
    return `<div class="sm-char-item"><div class="sm-char-info"><span class="sm-char-desc">${formatInline(line.replace(/^-\s+/, ""))}</span></div></div>`;
  });
  return `<div class="sm-char-list">${items.join("")}</div>`;
}

function renderEventList(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const items = lines.map((line, i) => {
    const content = line.replace(/^\d+\.\s*/, "");
    return `
      <div class="sm-event-item">
        <div class="sm-event-dot">
          <div class="sm-event-circle"></div>
          ${i < lines.length - 1 ? '<div class="sm-event-line"></div>' : ""}
        </div>
        <div class="sm-event-text">${formatInline(content)}</div>
      </div>`;
  });
  return `<div class="sm-event-list">${items.join("")}</div>`;
}

function renderSectionContent(section: Section): string {
  switch (section.id) {
    case "characters":
      return renderCharacterList(section.content);
    case "events":
      return renderEventList(section.content);
    default:
      return section.content
        .split("\n\n")
        .map((p) => renderParagraph(p.trim()))
        .join("");
  }
}

// ── Render ───────────────────────────────────

function renderSection(section: Section): string {
  const content = renderSectionContent(section);
  const isHighlight = section.id === "latest" || section.id === "status";

  return `
    <div class="sm-section${isHighlight ? " sm-highlight" : ""}" data-section="${section.id}">
      <div class="sm-section-header">
        <span class="sm-section-icon">${section.icon}</span>
        <h2 class="sm-section-title">${escapeHtml(section.title)}</h2>
      </div>
      <div class="sm-section-body">
        ${content}
      </div>
    </div>`;
}

function renderEmpty(): string {
  return `
    <div class="sm-empty">
      <div class="sm-empty-rule"></div>
      <div class="sm-empty-text">요약할 내용이 없습니다</div>
      <div class="sm-empty-sub">output 파일이 생성되면 요약을 작성할 수 있습니다</div>
      <div class="sm-empty-rule"></div>
    </div>`;
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  .sm-root {
    max-width: 680px;
    margin: 0 auto;
    padding: 24px 0 64px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Header ── */
  .sm-header {
    text-align: center;
    padding: 20px 0 12px;
  }
  .sm-header-title {
    font-family: var(--font-family-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-fg);
    letter-spacing: -0.01em;
  }
  .sm-header-meta {
    font-size: 11px;
    font-family: var(--font-family-mono);
    color: var(--color-fg-4);
    margin-top: 8px;
    letter-spacing: 0.03em;
  }

  /* ── Section Card ── */
  .sm-section {
    background: var(--color-surface);
    border: 1px solid color-mix(in srgb, var(--color-edge) 8%, transparent);
    border-radius: 12px;
    padding: 24px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .sm-section:hover {
    border-color: color-mix(in srgb, var(--color-edge) 16%, transparent);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--color-edge) 4%, transparent);
  }
  .sm-highlight {
    border-left: 3px solid color-mix(in srgb, var(--color-accent) 40%, transparent);
  }
  .sm-highlight:hover {
    border-left-color: color-mix(in srgb, var(--color-accent) 60%, transparent);
  }

  .sm-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .sm-section-icon {
    font-size: 16px;
    flex-shrink: 0;
  }
  .sm-section-title {
    font-family: var(--font-family-display);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0;
  }

  .sm-section-body {
    color: var(--color-fg-2);
    font-size: 14px;
    line-height: 1.75;
  }

  /* ── Paragraphs ── */
  .sm-paragraph {
    margin: 0 0 12px 0;
  }
  .sm-paragraph:last-child {
    margin-bottom: 0;
  }
  .sm-section-body strong {
    color: var(--color-fg);
    font-weight: 600;
  }

  /* ── Character List ── */
  .sm-char-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sm-char-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .sm-char-initial {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    background: color-mix(in srgb, var(--color-accent) 8%, transparent);
    color: var(--color-accent);
    margin-top: 2px;
  }
  .sm-char-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sm-char-name {
    font-family: var(--font-family-display);
    font-weight: 600;
    font-size: 14px;
    color: var(--color-fg);
  }
  .sm-char-role {
    font-size: 12px;
    color: var(--color-accent);
    opacity: 0.7;
  }
  .sm-char-desc {
    font-size: 13px;
    color: var(--color-fg-3);
    line-height: 1.5;
  }

  /* ── Event Timeline ── */
  .sm-event-list {
    display: flex;
    flex-direction: column;
  }
  .sm-event-item {
    display: flex;
    gap: 14px;
    min-height: 32px;
  }
  .sm-event-dot {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 16px;
    padding-top: 6px;
  }
  .sm-event-circle {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-accent) 50%, transparent);
    flex-shrink: 0;
  }
  .sm-event-line {
    width: 1px;
    flex: 1;
    background: color-mix(in srgb, var(--color-edge) 12%, transparent);
    margin: 4px 0;
  }
  .sm-event-text {
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--color-fg-2);
    padding-bottom: 12px;
  }
  .sm-event-item:last-child .sm-event-text {
    padding-bottom: 0;
  }

  /* ── Empty State ── */
  .sm-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    gap: 12px;
    opacity: 0.3;
  }
  .sm-empty-rule {
    width: 28px;
    height: 1px;
    background: var(--color-fg-4);
  }
  .sm-empty-text {
    font-family: var(--font-family-display);
    font-size: 13px;
    color: var(--color-fg-3);
    letter-spacing: 0.06em;
  }
  .sm-empty-sub {
    font-size: 11px;
    color: var(--color-fg-4);
    font-family: var(--font-family-mono);
  }
</style>`;

// ── Main renderer ────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function render(ctx: RenderContext): string {
  const summaryFile = ctx.outputFiles.find(
    (f) => f.path === "summary.md" || f.path.endsWith("/summary.md"),
  );

  if (!summaryFile) return STYLES + renderEmpty();

  const { title, sections } = parseSummary(summaryFile.content);
  if (sections.length === 0) return STYLES + renderEmpty();

  const timeStr = formatDate(summaryFile.modifiedAt);
  const sectionsHtml = sections.map(renderSection).join("\n");

  return `${STYLES}
    <div class="sm-root">
      <div class="sm-header">
        <div class="sm-header-title">${escapeHtml(title)}</div>
        ${timeStr ? `<div class="sm-header-meta">LAST UPDATED ${timeStr}</div>` : ""}
      </div>
      ${sectionsHtml}
    </div>`;
}
