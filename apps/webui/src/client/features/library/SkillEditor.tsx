import { useState, useCallback } from "react";
import { TextEditor, type EditorLanguage } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { estimateTokens, formatTokens } from "@/client/shared/pricing.utils.js";

interface SkillEditorProps {
  content: string;
  onSave?: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  language?: EditorLanguage;
  readOnly?: boolean;
  showTokenCount?: boolean;
}

export function SkillEditor({ content, onSave, onDelete, language, readOnly, showTokenCount }: SkillEditorProps) {
  const { t } = useI18n();
  const [tokenCount, setTokenCount] = useState(() =>
    showTokenCount ? estimateTokens(content) : 0,
  );

  const handleDocChange = useCallback((text: string) => {
    if (showTokenCount) {
      setTokenCount(estimateTokens(text));
    }
  }, [showTokenCount]);

  const statusInfo = showTokenCount
    ? `${t("editor.approx")} ${formatTokens(tokenCount)} ${t("editor.tokens")}`
    : undefined;

  return (
    <TextEditor
      content={content}
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
  );
}
