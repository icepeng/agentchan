import { useState, useCallback } from "react";
import { TextEditor, type EditorLanguage } from "@/client/shared/ui/TextEditor.js";
import { Switch } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { estimateTokens, formatTokens } from "@/client/shared/pricing.utils.js";

interface SkillEditorProps {
  content: string;
  onSave?: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  language?: EditorLanguage;
  readOnly?: boolean;
  showTokenCount?: boolean;
  /**
   * When true, render frontmatter toggles for `always-active` and
   * `disable-model-invocation` above the text editor. Toggling persists the
   * change immediately by patching the YAML frontmatter and calling onSave.
   * Only meaningful for skill (markdown) editing — not used for renderers.
   */
  enableSkillToggles?: boolean;
}

const FLAG_ALWAYS_ACTIVE = "always-active";
const FLAG_DISABLE_MODEL = "disable-model-invocation";

/**
 * Returns true if `field: true` appears as a top-level key inside the
 * markdown frontmatter block. Other YAML values are ignored.
 */
function hasFrontmatterFlag(content: string, field: string): boolean {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const re = new RegExp(`^${field}:\\s*true\\s*$`, "m");
  return re.test(fm[1]);
}

/**
 * Patch a single boolean frontmatter field. Preserves other YAML keys and
 * the markdown body. If the frontmatter block is missing, one is inserted
 * (only when enabling). If the field is already in the desired state, the
 * content is returned unchanged so callers can short-circuit on identity.
 */
function setFrontmatterFlag(content: string, field: string, enabled: boolean): string {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/);
  if (!fm) {
    if (!enabled) return content;
    return `---\n${field}: true\n---\n\n${content}`;
  }
  const fmText = fm[1];
  const rest = fm[2] ?? "";
  const lineRe = new RegExp(`^${field}:\\s*.*$`, "m");
  let newFmText: string;
  if (lineRe.test(fmText)) {
    if (enabled) {
      if (new RegExp(`^${field}:\\s*true\\s*$`, "m").test(fmText)) return content;
      newFmText = fmText.replace(lineRe, `${field}: true`);
    } else {
      // Drop the line and any leading newline; clean up a leftover blank first line.
      newFmText = fmText.replace(new RegExp(`(^|\\r?\\n)${field}:\\s*.*`, "m"), "");
      newFmText = newFmText.replace(/^\r?\n/, "");
    }
  } else {
    if (!enabled) return content;
    newFmText = fmText + `\n${field}: true`;
  }
  return `---\n${newFmText}\n---${rest}`;
}

export function SkillEditor({
  content,
  onSave,
  onDelete,
  language,
  readOnly,
  showTokenCount,
  enableSkillToggles,
}: SkillEditorProps) {
  const { t } = useI18n();
  // Mirror the editor doc so toggles can patch frontmatter without losing
  // unsaved body edits. TextEditor is controlled — assigning to currentContent
  // triggers a CodeMirror dispatch in its content-sync effect.
  // Callers re-mount this component via `key={selected}` when selection
  // changes, so initializing from the prop is sufficient.
  const [currentContent, setCurrentContent] = useState(content);
  const [tokenCount, setTokenCount] = useState(() =>
    showTokenCount ? estimateTokens(content) : 0,
  );

  const handleDocChange = useCallback(
    (text: string) => {
      setCurrentContent(text);
      if (showTokenCount) setTokenCount(estimateTokens(text));
    },
    [showTokenCount],
  );

  const handleToggleFlag = useCallback(
    async (field: string, value: boolean) => {
      const next = setFrontmatterFlag(currentContent, field, value);
      if (next === currentContent) return;
      setCurrentContent(next);
      if (showTokenCount) setTokenCount(estimateTokens(next));
      // Persist immediately — toggles always co-commit any unsaved body edits.
      await onSave?.(next);
    },
    [currentContent, onSave, showTokenCount],
  );

  const statusInfo = showTokenCount
    ? `${t("editor.approx")} ${formatTokens(tokenCount)} ${t("editor.tokens")}`
    : undefined;

  const showToggles = enableSkillToggles && !readOnly;
  const alwaysActive = showToggles ? hasFrontmatterFlag(currentContent, FLAG_ALWAYS_ACTIVE) : false;
  const disableModel = showToggles ? hasFrontmatterFlag(currentContent, FLAG_DISABLE_MODEL) : false;

  return (
    <div className="flex flex-col h-full gap-3">
      {showToggles && (
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 px-4 py-3 rounded-xl bg-base/50 border border-edge/6">
          <label className="flex items-center gap-3 text-sm cursor-pointer flex-1 min-w-0">
            <Switch
              checked={alwaysActive}
              onChange={(v) => void handleToggleFlag(FLAG_ALWAYS_ACTIVE, v)}
            />
            <div className="min-w-0">
              <div className="text-fg-2 font-medium">{t("skillToggles.alwaysActive")}</div>
              <div className="text-xs text-fg-3">{t("skillToggles.alwaysActiveHint")}</div>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer flex-1 min-w-0">
            <Switch
              checked={disableModel}
              onChange={(v) => void handleToggleFlag(FLAG_DISABLE_MODEL, v)}
            />
            <div className="min-w-0">
              <div className="text-fg-2 font-medium">{t("skillToggles.disableModel")}</div>
              <div className="text-xs text-fg-3">{t("skillToggles.disableModelHint")}</div>
            </div>
          </label>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <TextEditor
          content={currentContent}
          onSave={onSave}
          onDelete={onDelete}
          onDocChange={handleDocChange}
          language={language}
          readOnly={readOnly}
          statusInfo={statusInfo}
          labels={{
            unsaved: t("editor.unsaved"),
            saved: t("editor.saved"),
            save: t("editor.save"),
            saving: t("editor.saving"),
            delete: t("editor.delete"),
          }}
        />
      </div>
    </div>
  );
}
