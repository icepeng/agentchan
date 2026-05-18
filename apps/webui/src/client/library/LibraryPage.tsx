import { ArrowLeft, BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/client/design-system/index.js";
import { useI18n } from "@/client/platform/index.js";
import { TemplateDetailPanel } from "./TemplateDetailPanel.js";
import { TemplateListPanel } from "./TemplateListPanel.js";
import { useTemplateReadme, useTemplates } from "./useTemplates.js";
import { useTemplateSelection } from "./useTemplateSelection.js";

interface LibraryPageProps {
  canGoBack: boolean;
  onBack: () => void;
  createFromTemplate: (projectName: string, templateSlug: string) => Promise<unknown>;
  trustDialog: ReactNode;
}

export function LibraryPage({
  canGoBack,
  onBack,
  createFromTemplate,
  trustDialog,
}: LibraryPageProps) {
  const { t } = useI18n();
  const { data: templates, isLoading } = useTemplates();
  const {
    effectiveSelectedSlug,
    handleKeyNav,
    selectedIndex,
    selectedTemplate,
    setSelectedSlug,
  } = useTemplateSelection(templates);
  const { data: readme } = useTemplateReadme(effectiveSelectedSlug);

  return (
    <div
      className="relative flex flex-col h-full bg-void"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top right, color-mix(in srgb, var(--color-accent) 7%, transparent), transparent 55%)",
      }}
    >
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/40 backdrop-blur-sm shrink-0">
        {canGoBack && (
          <IconButton onClick={onBack} title={t("settings.back")}>
            <ArrowLeft size={16} strokeWidth={2} />
          </IconButton>
        )}
        <h2 className="font-display text-lg font-bold tracking-tight">
          {t("templates.title")}
        </h2>
        <span
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.28em] text-fg-4"
          aria-hidden
        >
          {t("templates.label")}
        </span>
      </div>

      {!templates || isLoading ? (
        <div className="flex-1 flex items-center justify-center text-fg-4 text-sm">
          {t("templates.loading")}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-fg-4 text-sm flex-col gap-3">
          <BookOpen size={32} className="opacity-40" />
          {t("templates.empty")}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0" onKeyDown={handleKeyNav} tabIndex={-1}>
          <TemplateListPanel
            templates={templates}
            selectedSlug={effectiveSelectedSlug}
            onSelect={setSelectedSlug}
            titleLabel={t("templates.title")}
            dragHandleLabel={t("templates.dragHandle")}
            externalLabel={t("templates.externalLabel")}
          />
          <TemplateDetailPanel
            selectedIndex={selectedIndex}
            selectedTemplate={selectedTemplate}
            readme={readme}
            createFromTemplate={createFromTemplate}
            placeholder={t("templates.heroPlaceholder")}
          />
        </div>
      )}

      {trustDialog}
    </div>
  );
}
