import { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus } from "lucide-react";
import { useI18n } from "@/client/i18n/index.js";
import { useUIDispatch } from "@/client/entities/ui/index.js";
import { fetchTemplates, type TemplateMeta } from "@/client/entities/template/index.js";
import { useProject } from "@/client/features/project/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

export function TemplatesPage() {
  const { t } = useI18n();
  const uiDispatch = useUIDispatch();
  const { createProject } = useProject();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    void fetchTemplates().then(setTemplates);
  }, []);

  const handleCreate = useCallback(async (templateSlug: string) => {
    if (!nameInput.trim()) return;
    setCreating(templateSlug);
    try {
      await createProject(nameInput.trim(), templateSlug);
      uiDispatch({ type: "NAVIGATE", route: { page: "main" } });
    } finally {
      setCreating(null);
      setNameInput("");
    }
  }, [nameInput, createProject, uiDispatch]);

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight mb-2">
            {t("templates.title")}
          </h1>
          <p className="text-sm text-fg-3">
            {t("templates.description")}
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-16 text-fg-4 text-sm">
            <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
            {t("templates.empty")}
          </div>
        ) : (
          <div className="grid gap-3">
            {templates.map((tpl) => (
              <div
                key={tpl.slug}
                className="group border border-edge/8 rounded-xl bg-elevated/50 hover:bg-elevated hover:border-edge/16 transition-all duration-150"
              >
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm tracking-tight">
                      {tpl.name}
                    </h3>
                    {tpl.description && (
                      <p className="text-xs text-fg-3 mt-1 leading-relaxed">
                        {tpl.description}
                      </p>
                    )}
                  </div>

                  {creating === tpl.slug ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreate(tpl.slug);
                          if (e.key === "Escape") { setCreating(null); setNameInput(""); }
                        }}
                        placeholder={t("project.namePlaceholder")}
                        className="w-48 px-3 py-1.5 text-sm bg-base border border-edge/12 rounded-lg outline-none focus:border-accent/40"
                        autoFocus
                      />
                      <button
                        onClick={() => void handleCreate(tpl.slug)}
                        disabled={!nameInput.trim()}
                        className="px-3 py-1.5 text-xs font-medium bg-accent text-void rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-all duration-150"
                      >
                        {t("templates.createProject")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreating(tpl.slug); setNameInput(""); }}
                      className="shrink-0 p-1.5 rounded-lg text-fg-3 opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent/8 transition-all duration-150"
                      title={t("templates.createProject")}
                    >
                      <Plus size={16} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
