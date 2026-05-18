import { useEffect, useState } from "react";
import { Dialog, Button, TextInput, FormField } from "@/client/design-system/index.js";
import { useI18n } from "@/client/platform/index.js";
import { ProjectFilePicker } from "@/client/project-editor/index.js";
import { saveProjectAsTemplate } from "@/client/library/index.js";

interface SaveAsTemplateModalProps {
  slug: string | null;
  onClose: () => void;
}

export function SaveAsTemplateModal({ slug, onClose }: SaveAsTemplateModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [overwritePrompt, setOverwritePrompt] = useState(false);

  useEffect(() => {
    if (!slug) return;
    // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- Dialog는 유지한 채 slug 변경 시 폼 상태를 리셋한다.
    setName("");
    setDescription("");
    setExcluded(new Set());
    setSelectedPreview(null);
    setSaving(false);
    setNameError(false);
    setOverwritePrompt(false);
  }, [slug]);

  const toggleExcluded = (paths: string[]) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      const allExcluded = paths.every((path) => next.has(path));
      if (allExcluded) {
        for (const path of paths) next.delete(path);
      } else {
        for (const path of paths) next.add(path);
      }
      return next;
    });
  };

  const doSave = async (overwrite: boolean) => {
    if (!slug) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    setSaving(true);
    try {
      const result = await saveProjectAsTemplate(slug, {
        name: trimmedName,
        description: description.trim() || undefined,
        excludeFiles: [...excluded],
        overwrite,
      });

      if (result.conflict) {
        setOverwritePrompt(true);
        setSaving(false);
        return;
      }

      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Dialog open={slug !== null} onOpenChange={(open) => { if (!open) onClose(); }} size="xl">
      <div className="p-6 space-y-5">
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">
          {t("template.saveTitle")}
        </h2>

        <div className="space-y-3">
          <FormField label={t("template.name")}>
            <TextInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(false);
                setOverwritePrompt(false);
              }}
              placeholder={t("template.namePlaceholder")}
              className={nameError ? "!border-danger/60" : ""}
              autoFocus
            />
          </FormField>
          <FormField label={t("template.templateDescription")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("template.descriptionPlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-edge/8 bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-4 outline-none focus:border-accent/30 resize-none"
            />
          </FormField>
        </div>

        {slug && (
          <ProjectFilePicker
            slug={slug}
            excludedFiles={excluded}
            previewSelected={selectedPreview}
            onToggle={toggleExcluded}
            onSelectPreview={setSelectedPreview}
          />
        )}

        <div className="flex items-center justify-end gap-2">
          {overwritePrompt ? (
            <>
              <span className="text-sm text-fg-3 mr-auto">
                {t("template.overwriteConfirm", { name: name.trim() })}
              </span>
              <Button variant="ghost" onClick={() => setOverwritePrompt(false)}>
                {t("editMode.cancel")}
              </Button>
              <Button variant="danger" onClick={() => doSave(true)} disabled={saving}>
                {t("template.overwrite")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t("editMode.cancel")}
              </Button>
              <Button variant="accent" onClick={() => doSave(false)} disabled={saving}>
                {saving ? t("template.saving") : t("template.save")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
