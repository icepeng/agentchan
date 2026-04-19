import { useEffect, useRef, useState, type RefObject } from "react";
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
  foldGutter,
  HighlightStyle,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { useI18n } from "@/client/i18n/index.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { isImagePath, type EditorAPI } from "@/client/entities/editor/index.js";
import { estimateTokens, formatTokens } from "@/client/shared/pricing.utils.js";
import { useLatestRef } from "@/client/shared/useLatestRef.js";

const TOKEN_DEBOUNCE_MS = 300;

// --- Obsidian Teal theme (from former TextEditor) ---

const obsidianTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-fg)",
    fontSize: "13px",
    fontFamily: "var(--font-family-mono)",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    padding: "16px",
    caretColor: "var(--color-accent)",
    lineHeight: "1.625",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)" },
  ".cm-scroller": { fontFamily: "var(--font-family-mono)", overflow: "auto" },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-fg-4)",
    border: "none",
    paddingLeft: "4px",
  },
  ".cm-activeLineGutter": { color: "var(--color-fg-2)", backgroundColor: "transparent" },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--color-edge) 3%, transparent)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
    color: "var(--color-accent) !important",
  },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--color-fg-4)", padding: "0 4px" },
  ".cm-line": { padding: "0 8px" },
  // Search panel
  ".cm-panels": {
    backgroundColor: "var(--color-elevated)",
    color: "var(--color-fg-2)",
    borderColor: "color-mix(in srgb, var(--color-edge) 10%, transparent)",
  },
  ".cm-panel.cm-search": {
    padding: "8px 12px",
    fontSize: "12px",
    fontFamily: "var(--font-family-mono)",
  },
  ".cm-panel.cm-search input": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-fg)",
    border: "1px solid color-mix(in srgb, var(--color-edge) 15%, transparent)",
    borderRadius: "4px",
    padding: "2px 6px",
    outline: "none",
  },
  ".cm-panel.cm-search input:focus": {
    borderColor: "var(--color-accent)",
  },
  ".cm-panel.cm-search button": {
    backgroundColor: "transparent",
    color: "var(--color-fg-3)",
    border: "none",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  ".cm-panel.cm-search button:hover": {
    color: "var(--color-fg)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
  },
  ".cm-panel.cm-search label": {
    color: "var(--color-fg-3)",
    fontSize: "12px",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--color-warm) 20%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
  },
  // Autocomplete tooltip
  ".cm-tooltip": {
    backgroundColor: "var(--color-elevated)",
    border: "1px solid color-mix(in srgb, var(--color-edge) 12%, transparent)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px color-mix(in srgb, var(--color-void) 40%, transparent)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete": {
    fontSize: "12px",
    fontFamily: "var(--font-family-mono)",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 8px",
    color: "var(--color-fg-2)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
    color: "var(--color-fg)",
  },
  ".cm-completionLabel": {
    color: "var(--color-fg)",
  },
  ".cm-completionDetail": {
    color: "var(--color-fg-4)",
    fontStyle: "italic",
    marginLeft: "8px",
  },
  ".cm-completionMatchedText": {
    color: "var(--color-accent)",
    textDecoration: "none",
  },
});

const obsidianHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-accent)" },
  { tag: tags.operator, color: "var(--color-fg-2)" },
  { tag: tags.typeName, color: "#7dd3fc" },
  { tag: tags.className, color: "#7dd3fc" },
  { tag: tags.propertyName, color: "#c4b5fd" },
  { tag: tags.function(tags.variableName), color: "#c4b5fd" },
  { tag: tags.definition(tags.variableName), color: "var(--color-fg)" },
  { tag: tags.variableName, color: "var(--color-fg)" },
  { tag: tags.string, color: "var(--color-warm)" },
  { tag: tags.number, color: "#f0abfc" },
  { tag: tags.bool, color: "#f0abfc" },
  { tag: tags.null, color: "#f0abfc" },
  { tag: tags.comment, color: "var(--color-fg-4)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--color-fg-3)" },
  { tag: tags.heading, color: "var(--color-accent)", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, color: "var(--color-accent)", textDecoration: "underline" },
  { tag: tags.tagName, color: "var(--color-accent)" },
  { tag: tags.attributeName, color: "#c4b5fd" },
  { tag: tags.attributeValue, color: "var(--color-warm)" },
]);

type EditorLanguage = "typescript" | "markdown";

function detectLanguage(path: string): EditorLanguage | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "js" || ext === "mjs" || ext === "mts") return "typescript";
  if (ext === "md") return "markdown";
  return undefined;
}

function getLanguageExtension(lang?: EditorLanguage) {
  switch (lang) {
    case "typescript": return javascript({ typescript: true });
    case "markdown": return markdown();
    default: return [];
  }
}

// --- Renderer autocomplete ---

function rendererCompletions(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\b(\w+)\.(\w*)$/);
  if (!match) return null;

  const text = match.text;
  const dotPos = text.lastIndexOf(".");
  const varName = text.substring(0, dotPos);
  const from = match.from + dotPos + 1;

  if (varName === "ctx") {
    return {
      from,
      options: [
        { label: "files", type: "property", detail: "ProjectFile[]" },
        { label: "baseUrl", type: "property", detail: "string" },
      ],
    };
  }

  if (/^(f|file|entry|item|doc|textFile|tf)$/i.test(varName)) {
    return {
      from,
      options: [
        { label: "type", type: "property", detail: '"text" | "binary"' },
        { label: "path", type: "property", detail: "string" },
        { label: "content", type: "property", detail: "string (TextFile)" },
        { label: "frontmatter", type: "property", detail: "Record<string, unknown> | null" },
        { label: "modifiedAt", type: "property", detail: "number" },
      ],
    };
  }

  return null;
}

// --- Component ---

interface FileEditorProps {
  path: string | null;
  baseline: string | null;
  dirty: boolean;
  onMarkDirty: () => void;
  onSave: () => Promise<void>;
  editorRef: RefObject<EditorAPI | null>;
}

export function FileEditor({ path, baseline, dirty, onMarkDirty, onSave, editorRef }: FileEditorProps) {
  const { t } = useI18n();
  const project = useProjectSelectionState();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onMarkDirtyRef = useLatestRef(onMarkDirty);
  const onSaveRef = useLatestRef(onSave);
  const dirtyRef = useLatestRef(dirty);
  // True while the sync effect applies a programmatic doc swap — keeps the
  // updateListener from mis-attributing it as a user edit.
  const suppressDirtyRef = useRef(false);
  const tokenTimerRef = useRef<number | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);

  const language = path ? detectLanguage(path) : undefined;
  const hasBaseline = baseline !== null;

  // Create / destroy EditorView when path changes or baseline first loads.
  // hasBaseline toggles the effect on null→value transition so the view is built
  // once content arrives; subsequent baseline changes (external refresh, save)
  // flow through the sync effect below and don't tear down the view.
  useEffect(() => {
    if (!containerRef.current || !path || baseline === null || isImagePath(path)) return;

    const saveKeymap = keymap.of([{
      key: "Mod-s",
      run: () => {
        if (dirtyRef.current) void onSaveRef.current();
        return true;
      },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      if (!suppressDirtyRef.current && !dirtyRef.current) {
        onMarkDirtyRef.current();
      }

      // Debounce the token estimate — estimateTokens is O(n) per char and
      // was dominating keystroke cost. Only recompute once typing settles.
      if (tokenTimerRef.current !== null) {
        clearTimeout(tokenTimerRef.current);
      }
      tokenTimerRef.current = window.setTimeout(() => {
        const v = viewRef.current;
        if (v) setTokenCount(estimateTokens(v.state.doc.toString()));
        tokenTimerRef.current = null;
      }, TOKEN_DEBOUNCE_MS);
    });

    setTokenCount(estimateTokens(baseline));

    const state = EditorState.create({
      doc: baseline,
      extensions: [
        saveKeymap,
        keymap.of([
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        history(),
        getLanguageExtension(language),
        syntaxHighlighting(obsidianHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        foldGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        search({ top: true }),
        highlightSelectionMatches(),
        ...(language === "typescript"
          ? [autocompletion({ override: [rendererCompletions] })]
          : []),
        obsidianTheme,
        EditorView.lineWrapping,
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    editorRef.current = {
      getContent: () => viewRef.current?.state.doc.toString() ?? null,
    };

    return () => {
      if (tokenTimerRef.current !== null) {
        clearTimeout(tokenTimerRef.current);
        tokenTimerRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
      editorRef.current = null;
    };
  }, [path, language, hasBaseline]); // eslint-disable-line react-hooks/exhaustive-deps -- baseline used only for initial doc; save/markDirty via refs

  // Sync baseline → CodeMirror doc. With buffer lifted out of React, baseline
  // only changes on SELECT_FILE / FILE_SAVED / EXTERNAL_REFRESH, so this effect
  // stays off the keystroke path entirely.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || baseline === null) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === baseline) return;

    suppressDirtyRef.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: baseline },
      });
      if (tokenTimerRef.current !== null) {
        clearTimeout(tokenTimerRef.current);
        tokenTimerRef.current = null;
      }
      setTokenCount(estimateTokens(baseline));
    } finally {
      suppressDirtyRef.current = false;
    }
  }, [baseline]);

  // No file selected
  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-4 text-sm">
        {t("editMode.selectFile")}
      </div>
    );
  }

  // Image preview
  if (isImagePath(path)) {
    const slug = project.activeProjectSlug;
    // Strip "files/" prefix for the serving route
    const servePath = path.startsWith("files/") ? path.slice(6) : path;
    const imageUrl = `/api/projects/${encodeURIComponent(slug ?? "")}/files/${servePath}`;

    return (
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <img
          src={imageUrl}
          alt={path}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    );
  }

  // Code editor
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File path header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-edge/6 text-[11px] text-fg-3">
        <span className="font-mono truncate">{path}</span>
        {dirty && <span className="text-accent">•</span>}
        {tokenCount !== null && (
          <span className="ml-auto text-fg-4 tabular-nums">
            {t("editor.approx")}{formatTokens(tokenCount)} {t("editor.tokens")}
          </span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 [&_.cm-editor]:h-full" />
    </div>
  );
}
