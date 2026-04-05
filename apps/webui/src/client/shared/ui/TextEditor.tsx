import { useState, useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
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
import { Button } from "./Button.js";

export type EditorLanguage = "typescript" | "markdown";

interface TextEditorProps {
  content: string;
  onSave?: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDocChange?: (text: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  placeholder?: string;
  statusInfo?: string;
  labels?: {
    unsaved?: string;
    saved?: string;
    save?: string;
    saving?: string;
    delete?: string;
  };
}

const defaultLabels = {
  unsaved: "Unsaved changes",
  saved: "All changes saved",
  save: "Save",
  saving: "Saving...",
  delete: "Delete",
};

// Obsidian Teal theme — uses CSS variables so dark/light auto-switches
const obsidianTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--color-surface)",
      color: "var(--color-fg)",
      fontSize: "13px",
      fontFamily: "var(--font-family-mono)",
      height: "100%",
      borderRadius: "12px",
      border: "1px solid color-mix(in srgb, var(--color-edge) 8%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
    },
    ".cm-content": {
      padding: "16px",
      caretColor: "var(--color-accent)",
      lineHeight: "1.625",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-accent)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-family-mono)",
      overflow: "auto",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-surface)",
      color: "var(--color-fg-4)",
      border: "none",
      paddingLeft: "4px",
    },
    ".cm-activeLineGutter": {
      color: "var(--color-fg-2)",
      backgroundColor: "transparent",
    },
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
    ".cm-foldGutter .cm-gutterElement": {
      color: "var(--color-fg-4)",
      padding: "0 4px",
    },
    ".cm-placeholder": {
      color: "var(--color-fg-4)",
    },
    ".cm-line": {
      padding: "0 8px",
    },
  },
);

// Syntax highlight colors matching Obsidian Teal palette
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

function getLanguageExtension(lang?: EditorLanguage) {
  switch (lang) {
    case "typescript":
      return javascript({ typescript: true });
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

export function TextEditor({
  content,
  onSave,
  onDelete,
  onDocChange,
  language,
  readOnly = false,
  placeholder,
  statusInfo,
  labels,
}: TextEditorProps) {
  const l = { ...defaultLabels, ...labels };
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  // Refs to keep callbacks accessible from CM extensions without recreating the view
  const onSaveRef = useRef(onSave);
  const dirtyRef = useRef(dirty);
  const onDocChangeRef = useRef(onDocChange);
  onSaveRef.current = onSave;
  dirtyRef.current = dirty;
  onDocChangeRef.current = onDocChange;

  const handleSave = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !onSaveRef.current) return;
    setSaving(true);
    try {
      await onSaveRef.current(view.state.doc.toString());
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  // Create EditorView — recreate only for structural changes (language, readOnly)
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (dirtyRef.current) void handleSave();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setDirty(true);
        onDocChangeRef.current?.(update.state.doc.toString());
      }
    });

    const extensions = [
      saveKeymap,
      keymap.of([indentWithTab]),
      keymap.of(defaultKeymap),
      getLanguageExtension(language),
      syntaxHighlighting(obsidianHighlight),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      indentOnInput(),
      foldGutter(),
      obsidianTheme,
      EditorView.lineWrapping,
      updateListener,
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    }

    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    const state = EditorState.create({
      doc: contentRef.current,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setDirty(false);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language, readOnly, placeholder, handleSave]);

  // Sync external content changes without destroying the view
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
      setDirty(false);
    }
  }, [content]);

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="flex-1 min-h-0 [&_.cm-editor]:h-full" />
      {!readOnly && onSave && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-[11px] text-fg-3 flex items-center gap-1.5">
            <span>{dirty ? l.unsaved : l.saved}</span>
            {statusInfo && (
              <>
                <span className="text-fg-4">·</span>
                <span>{statusInfo}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button variant="danger" onClick={onDelete}>
                {l.delete}
              </Button>
            )}
            <Button
              variant="accent"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? l.saving : l.save}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
