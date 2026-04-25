import { useState } from "react";
import { Dialog } from "@/client/shared/ui/Dialog.js";
import { Button, TextInput } from "@/client/shared/ui/index.js";
import { useProjects, useProjectMutations, type Project } from "@/client/entities/project/index.js";
import { useI18n } from "@/client/i18n/index.js";

interface ProjectSettingsModalProps {
  slug: string | null;
  onClose: () => void;
}

export function ProjectSettingsModal({ slug, onClose }: ProjectSettingsModalProps) {
  const { data: projects = [] } = useProjects();

  const project = slug ? projects.find((p) => p.slug === slug) : null;

  return (
    <Dialog open={slug !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {project ? <ProjectSettingsForm key={project.slug} project={project} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ProjectSettingsForm({ project, onClose }: { project: Project; onClose: () => void }) {
  const { update } = useProjectMutations();
  const { t } = useI18n();

  const [name, setName] = useState(project.name);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(project.slug, { name: name.trim() || undefined, notes });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
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
  );
}
