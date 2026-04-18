import { X } from "lucide-react";
import { Dialog, IconButton, ScrollArea } from "@/client/shared/ui/index.js";
import { ReadmeView } from "@/client/shared/ReadmeView.js";
import { useI18n } from "@/client/i18n/index.js";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useProject } from "./useProject.js";
import { useProjectReadme } from "@/client/entities/project/index.js";

/**
 * In-project README viewer invoked by the `/readme` slash command. Pure client
 * widget — no agent round-trip, no session noise.
 */
export function ProjectReadmeModal() {
  const { t } = useI18n();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { activeProjectSlug, projects } = useProject();

  // Only fetch once the modal is open; otherwise every project switch would
  // eagerly pull a README the user may never view.
  const slug = ui.readmeOpen ? activeProjectSlug : null;
  const { data: doc, isLoading } = useProjectReadme(slug);
  const activeProject = projects.find((p) => p.slug === activeProjectSlug) ?? null;

  const handleClose = () => uiDispatch({ type: "CLOSE_README" });
  const hasContent = doc && (doc.frontmatter.name || doc.body.trim());

  return (
    <Dialog open={ui.readmeOpen} onOpenChange={(open) => { if (!open) handleClose(); }} size="lg">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-edge/6">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-fg-4">
            {t("readme.modalTitle")}
          </span>
          {activeProject && (
            <span className="font-display text-sm text-fg-2 truncate">
              {activeProject.name}
            </span>
          )}
        </div>
        <IconButton onClick={handleClose} title={t("readme.close")}>
          <X size={14} strokeWidth={2} />
        </IconButton>
      </div>
      <ScrollArea className="max-h-[70vh]" viewportClassName="px-8 py-6">
        {isLoading ? (
          <div className="text-fg-4 text-sm">{t("templates.loading")}</div>
        ) : hasContent ? (
          <ReadmeView
            doc={doc}
            variant="compact"
            fallbackName={activeProject?.name}
          />
        ) : (
          <div className="text-fg-4 text-sm">{t("templates.noReadme")}</div>
        )}
      </ScrollArea>
    </Dialog>
  );
}
