import { useState, useEffect } from "react";
import { Dialog } from "@/client/shared/ui/Dialog.js";
import { Button, TextInput } from "@/client/shared/ui/index.js";
import { useProjectState, useProjectDispatch, updateProject } from "@/client/entities/project/index.js";
import { useI18n } from "@/client/i18n/index.js";

interface ProjectSettingsModalProps {
  slug: string | null;
  onClose: () => void;
}

export function ProjectSettingsModal({ slug, onClose }: ProjectSettingsModalProps) {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();
  const { t } = useI18n();

  const project = slug ? projectState.projects.find((p) => p.slug === slug) : null;

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setNotes(project.notes ?? "");
    }
  }, [project]);

  const handleSave = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const updated = await updateProject(slug, { name: name.trim() || undefined, notes });
      projectDispatch({ type: "UPDATE_PROJECT", oldSlug: slug, project: updated });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={slug !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <div className="p-6 space-y-6">
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">
          {t("projectModal.title")}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2">
              {t("settings.name")}
            </label>
            <TextInput size="md" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2">
              {t("settings.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-xl text-sm bg-elevated border border-edge/8 text-fg outline-none focus:border-accent/30 resize-y min-h-[100px] transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t("editMode.cancel")}
          </Button>
          <Button variant="accent" onClick={handleSave} disabled={saving}>
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
