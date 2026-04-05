interface RenderContext {
  outputFiles: { path: string; content: string; modifiedAt: number }[];
  skills: { name: string; description: string; metadata?: Record<string, string> }[];
  baseUrl: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(text: string): string {
  // Normalize line endings and escape HTML to prevent XSS
  let html = escapeHtml(text).replace(/\r\n/g, "\n");

  // Basic inline formatting
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Block-level formatting
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

    // Fuse adjacent blockquotes within the same block
    trimmed = trimmed.replace(/<\/blockquote>\n<blockquote>/g, "<br/>");

    // If it's a standalone heading or horizontal rule
    if (/^<h[1-6]>.*<\/h[1-6]>$/.test(trimmed) || trimmed === "<hr/>") {
      return trimmed;
    }

    // Process unordered lists and mixed text within the same block
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
      // Clean up stray trailing <br/>
      return out.replace(/<br\/>\n$/, "\n").trim();
    }

    // If it's a blockquote-only block, return as is
    if (
      trimmed.startsWith("<blockquote") &&
      trimmed.endsWith("</blockquote>")
    ) {
      return trimmed;
    }

    // Default: wrap in <p> and handle internal newlines
    return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
  });

  return renderedBlocks.join("\n");
}

const STYLES = `<style>
  .rb-layout {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  /* ── Tab System ── */
  .rb-tab-radio {
    display: none;
  }
  .rb-tabs-header {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-bottom: 32px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
    padding: 0 8px;
  }
  .rb-tab-label {
    padding: 12px 4px;
    cursor: pointer;
    color: var(--color-fg-3);
    font-family: var(--font-family-display);
    font-weight: 600;
    font-size: 15px;
    border-bottom: 2px solid transparent;
    transition: color 0.2s ease, border-color 0.2s ease;
    margin-bottom: -1px;
    user-select: none;
    white-space: nowrap;
  }
  .rb-tab-label:hover {
    color: var(--color-fg);
  }

  #tab-novel:checked ~ .rb-tabs-header label[for="tab-novel"],
  #tab-outline:checked ~ .rb-tabs-header label[for="tab-outline"],
  #tab-world:checked ~ .rb-tabs-header label[for="tab-world"],
  #tab-chars:checked ~ .rb-tabs-header label[for="tab-chars"] {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  /* ── Tab Content Visibility ── */
  .rb-tab-content {
    display: none;
    animation: rb-fadeIn 0.3s ease;
  }
  @keyframes rb-fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  #tab-novel:checked ~ .rb-content-novel { display: block; }
  #tab-outline:checked ~ .rb-content-outline { display: block; }
  #tab-world:checked ~ .rb-content-world { display: block; }
  #tab-chars:checked ~ .rb-content-chars { display: block; }

  /* ── Empty State ── */
  .rb-empty {
    color: var(--color-fg-4);
    font-size: 14px;
    font-family: var(--font-family-mono);
    text-align: center;
    padding: 48px 0;
  }

  /* ── Prose Area (Novel, Outline, World) ── */
  .rb-prose {
    max-width: 680px;
    margin: 0 auto;
    line-height: 1.8;
    font-size: 15px;
    color: var(--color-fg);
    font-family: var(--font-family-body);
    padding-bottom: 64px;
  }
  .rb-prose h1 {
    font-size: 1.5em;
    font-family: var(--font-family-display);
    font-weight: 700;
    color: var(--color-fg);
    margin: 48px 0 20px;
  }
  .rb-prose h2 {
    font-size: 1.25em;
    font-family: var(--font-family-display);
    font-weight: 700;
    color: var(--color-fg);
    margin: 40px 0 16px;
  }
  .rb-prose h3 {
    font-size: 1.125em;
    font-family: var(--font-family-display);
    font-weight: 600;
    color: var(--color-fg);
    margin: 32px 0 12px;
  }
  .rb-prose hr {
    margin: 40px 0;
    text-align: center;
    border: none;
    color: var(--color-fg-4);
    font-size: 1.125em;
    letter-spacing: 0.5em;
  }
  .rb-prose hr::after {
    content: "***";
  }
  .rb-prose blockquote {
    border-left: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent) 3%, transparent);
    padding: 16px 20px;
    margin: 24px 0;
    color: var(--color-fg-2);
    border-radius: 0 8px 8px 0;
    font-size: 0.95em;
  }
  .rb-prose p {
    margin-bottom: 16px;
  }
  .rb-prose ul {
    margin-bottom: 16px;
    padding-left: 24px;
    color: var(--color-fg-2);
  }
  .rb-prose li {
    margin-bottom: 6px;
  }
  .rb-prose strong {
    font-weight: 600;
    color: var(--color-fg);
  }
  .rb-prose em {
    color: var(--color-fg-2);
  }
  .rb-file-separator {
    height: 1px;
    background: color-mix(in srgb, var(--color-edge) 8%, transparent);
    margin: 64px auto;
    width: 60%;
  }

  /* ── Characters Cards Area ── */
  .rb-chars {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-bottom: 64px;
  }
  .rb-char-card {
    background: var(--color-surface);
    border: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
    border-radius: 12px;
    padding: 32px;
    font-family: var(--font-family-body);
  }
  .rb-char-card h1 {
    font-family: var(--font-family-display);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-accent);
    margin: 0 0 16px 0;
    padding-bottom: 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
  }
  .rb-char-card h2 {
    font-family: var(--font-family-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-fg);
    margin: 24px 0 12px 0;
  }
  .rb-char-card h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-fg);
    margin: 16px 0 8px 0;
  }
  .rb-char-card p {
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.6;
    margin-bottom: 12px;
  }
  .rb-char-card ul {
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.6;
    margin: 0 0 16px 0;
    padding-left: 20px;
  }
  .rb-char-card li {
    margin-bottom: 6px;
  }
  .rb-char-card strong {
    color: var(--color-fg);
    font-weight: 600;
  }
  .rb-char-card hr {
    border: none;
    border-top: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
    margin: 24px 0;
  }
  .rb-char-card blockquote {
    border-left: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    padding-left: 16px;
    margin: 16px 0;
    color: var(--color-fg-2);
    font-style: italic;
    font-size: 14px;
  }
</style>`;

export function render(ctx: RenderContext): string {
  const files = ctx.outputFiles;
  if (files.length === 0) {
    return `${STYLES}<div class="rb-empty">아직 출력 파일이 없습니다</div>`;
  }

  // Regex helpers for categorization
  const isChar = (p: string) => /character|캐릭터|인물/i.test(p);
  const isWorld = (p: string) => /world|setting|lore|세계관|설정/i.test(p);
  const isOutline = (p: string) =>
    /outline|plot|synopsis|아웃라인|플롯|시놉시스/i.test(p);

  // Filter and split files into 4 categories
  const charsFiles = files.filter((f) => isChar(f.path));
  const worldFiles = files.filter((f) => !isChar(f.path) && isWorld(f.path));
  const outlineFiles = files.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && isOutline(f.path),
  );
  const novelFiles = files.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && !isOutline(f.path),
  );

  // Maintain consistent alphabetical ordering within categories
  charsFiles.sort((a, b) => a.path.localeCompare(b.path));
  worldFiles.sort((a, b) => a.path.localeCompare(b.path));
  outlineFiles.sort((a, b) => a.path.localeCompare(b.path));
  novelFiles.sort((a, b) => a.path.localeCompare(b.path));

  // Helpers to generate content sections
  const renderProseSection = (
    sectionFiles: OutputFile[],
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
  const outlineHtml = renderProseSection(
    outlineFiles,
    "아직 아웃라인이 없습니다.",
  );
  const worldHtml = renderProseSection(
    worldFiles,
    "아직 세계 설정이 없습니다.",
  );

  const charsHtml =
    charsFiles.length > 0
      ? charsFiles
          .map(
            (f) =>
              `<div class="rb-char-card">${renderMarkdown(f.content)}</div>`,
          )
          .join("\n")
      : `<div class="rb-empty">아직 캐릭터가 없습니다.</div>`;

  // Determine default active tab (first one with content, defaulting to novel)
  let defaultTab = "novel";
  if (novelFiles.length > 0) defaultTab = "novel";
  else if (outlineFiles.length > 0) defaultTab = "outline";
  else if (worldFiles.length > 0) defaultTab = "world";
  else if (charsFiles.length > 0) defaultTab = "chars";

  const html = `
    <div class="rb-layout">
      <!-- Hidden CSS-only tab states -->
      <input type="radio" id="tab-novel" name="rb-tabs" ${defaultTab === "novel" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-outline" name="rb-tabs" ${defaultTab === "outline" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-world" name="rb-tabs" ${defaultTab === "world" ? "checked" : ""} class="rb-tab-radio">
      <input type="radio" id="tab-chars" name="rb-tabs" ${defaultTab === "chars" ? "checked" : ""} class="rb-tab-radio">

      <!-- Tab Controls -->
      <div class="rb-tabs-header">
        <label for="tab-novel" class="rb-tab-label">이야기</label>
        <label for="tab-outline" class="rb-tab-label">아웃라인</label>
        <label for="tab-world" class="rb-tab-label">세계 설정</label>
        <label for="tab-chars" class="rb-tab-label">캐릭터</label>
      </div>

      <!-- Novel Scroll Area -->
      <div class="rb-tab-content rb-content-novel">
        <div class="rb-prose">${novelHtml}</div>
      </div>

      <!-- Outline Scroll Area -->
      <div class="rb-tab-content rb-content-outline">
        <div class="rb-prose">${outlineHtml}</div>
      </div>

      <!-- World Setting Scroll Area -->
      <div class="rb-tab-content rb-content-world">
        <div class="rb-prose">${worldHtml}</div>
      </div>

      <!-- Characters Scroll Area -->
      <div class="rb-tab-content rb-content-chars">
        <div class="rb-chars">${charsHtml}</div>
      </div>
    </div>
  `;

  return `${STYLES}${html}`;
}
