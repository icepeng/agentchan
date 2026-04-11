import { useReducer, useRef, useEffect, useCallback, useState } from "react";
import { Check, Plus, Settings, X } from "lucide-react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { Indicator } from "@/client/shared/ui/index.js";
import { fetchTemplates, type TemplateMeta } from "@/client/entities/template/index.js";
import { useProject } from "./useProject.js";

// -- Shared menu styles ---

const MENU_POPUP_CLASS =
  "bg-elevated border border-edge/8 rounded-lg shadow-lg shadow-void/50 py-1 z-50";
const MENU_ITEM_CLASS =
  "px-4 py-1.5 text-sm text-fg-2 cursor-pointer outline-none data-[highlighted]:bg-accent/10 data-[highlighted]:text-accent";

// -- State Machine ---

type TabsMode =
  | { type: "idle" }
  | { type: "creating"; value: string; error: boolean; templateName?: string }
  | { type: "editing"; slug: string; value: string }
  | { type: "confirming"; slug: string }
  | { type: "duplicating"; sourceSlug: string; value: string; error: boolean };

type TabsAction =
  | { type: "START_CREATE"; templateName?: string }
  | { type: "START_EDIT"; slug: string; name: string }
  | { type: "START_CONFIRM"; slug: string }
  | { type: "START_DUPLICATE"; sourceSlug: string }
  | { type: "SET_VALUE"; value: string }
  | { type: "SET_ERROR" }
  | { type: "RESET" };

function tabsReducer(state: TabsMode, action: TabsAction): TabsMode {
  switch (action.type) {
    case "START_CREATE":
      return { type: "creating", value: "", error: false, templateName: action.templateName };
    case "START_EDIT":
      return { type: "editing", slug: action.slug, value: action.name };
    case "START_CONFIRM":
      return { type: "confirming", slug: action.slug };
    case "START_DUPLICATE":
      return { type: "duplicating", sourceSlug: action.sourceSlug, value: "", error: false };
    case "SET_VALUE":
      if (state.type === "creating") return { ...state, value: action.value, error: false };
      if (state.type === "editing") return { ...state, value: action.value };
      if (state.type === "duplicating") return { ...state, value: action.value, error: false };
      return state;
    case "SET_ERROR":
      if (state.type === "creating") return { ...state, error: true };
      if (state.type === "duplicating") return { ...state, error: true };
      return state;
    case "RESET":
      return { type: "idle" };
  }
}

// -- Component ---

export function ProjectTabs() {
  const { t } = useI18n();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { projects, activeProjectSlug, selectProject, createProject, duplicateProject, renameProject, deleteProject } = useProject();
  const [mode, modeDispatch] = useReducer(tabsReducer, { type: "idle" });
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const isCreating = mode.type === "creating";
  const isEditing = mode.type === "editing";
  const isDuplicating = mode.type === "duplicating";

  const loadTemplates = useCallback(() => {
    if (templates !== null) return;
    void fetchTemplates().then(setTemplates);
  }, [templates]);

  useEffect(() => {
    if (isCreating || isDuplicating) createInputRef.current?.focus();
  }, [isCreating, isDuplicating]);

  useEffect(() => {
    if (isEditing) editInputRef.current?.focus();
  }, [isEditing]);

  const handleCreate = useCallback(async () => {
    if (mode.type !== "creating") return;
    if (submittingRef.current) return;
    const name = mode.value.trim();
    if (!name) {
      modeDispatch({ type: "SET_ERROR" });
      createInputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    try {
      await createProject(name, mode.templateName);
      modeDispatch({ type: "RESET" });
    } finally {
      submittingRef.current = false;
    }
  }, [mode, createProject]);

  const handleDuplicate = useCallback(async () => {
    if (mode.type !== "duplicating") return;
    if (submittingRef.current) return;
    const name = mode.value.trim();
    if (!name) {
      modeDispatch({ type: "SET_ERROR" });
      createInputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    try {
      await duplicateProject(mode.sourceSlug, name);
      modeDispatch({ type: "RESET" });
    } finally {
      submittingRef.current = false;
    }
  }, [mode, duplicateProject]);

  const handleRename = async (slug: string) => {
    if (mode.type !== "editing") return;
    if (submittingRef.current) return;
    const name = mode.value.trim();
    if (!name) {
      modeDispatch({ type: "RESET" });
      return;
    }
    submittingRef.current = true;
    try {
      await renameProject(slug, name);
      modeDispatch({ type: "RESET" });
    } finally {
      submittingRef.current = false;
    }
  };

  const handleDelete = async (slug: string) => {
    modeDispatch({ type: "RESET" });
    try {
      await deleteProject(slug);
    } catch (err: unknown) {
      alert(t("project.deleteFailed", { error: err instanceof Error ? err.message : "Unknown error" }));
    }
  };

  const handleOpenSettings = useCallback(
    (slug: string) => {
      if (activeProjectSlug !== slug) {
        void selectProject(slug);
      }
      uiDispatch({
        type: "NAVIGATE",
        route: { page: "project-settings", slug },
      });
    },
    [activeProjectSlug, selectProject, uiDispatch],
  );

  const settingsSlug = ui.currentPage.page === "project-settings" ? ui.currentPage.slug : null;

  return (
    <div className="px-2 py-1 space-y-0.5">
      {projects.map((project) => {
        const isActive = activeProjectSlug === project.slug;

        if (mode.type === "editing" && mode.slug === project.slug) {
          return (
            <input
              key={project.slug}
              ref={editInputRef}
              value={mode.value}
              onChange={(e) => modeDispatch({ type: "SET_VALUE", value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename(project.slug);
                if (e.key === "Escape") modeDispatch({ type: "RESET" });
              }}
              onBlur={() => void handleRename(project.slug)}
              className="w-full px-3 py-2 rounded-xl text-sm font-mono bg-elevated border border-accent/30 text-accent outline-none"
            />
          );
        }

        if (mode.type === "confirming" && mode.slug === project.slug) {
          return (
            <div
              key={project.slug}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-danger/10 border border-danger/20 text-danger"
            >
              <span className="flex-1 truncate">{t("project.deleteConfirm")}</span>
              <span
                onClick={() => handleDelete(project.slug)}
                className="p-0.5 hover:text-fg cursor-pointer transition-colors"
                title={t("project.confirmDelete")}
              >
                <Check size={12} strokeWidth={2} />
              </span>
              <span
                onClick={() => modeDispatch({ type: "RESET" })}
                className="p-0.5 hover:text-fg-2 cursor-pointer transition-colors"
                title={t("project.cancelDelete")}
              >
                <X size={10} strokeWidth={1.5} />
              </span>
            </div>
          );
        }

        return (
          <ContextMenu.Root key={project.slug}>
            <ContextMenu.Trigger
              render={
                <button
                  onClick={() => selectProject(project.slug)}
                  onDoubleClick={() => modeDispatch({ type: "START_EDIT", slug: project.slug, name: project.name })}
                  className={`group relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150 ${
                    isActive
                      ? "bg-elevated text-accent"
                      : "text-fg-2 hover:text-fg hover:bg-elevated/50"
                  }`}
                />
              }
            >
              {isActive && (
                <Indicator />
              )}
              <span className="flex-1 truncate">{project.name}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenSettings(project.slug);
                }}
                className={`${
                  settingsSlug === project.slug
                    ? "opacity-100 text-accent"
                    : "opacity-0 group-hover:opacity-100"
                } p-0.5 hover:text-accent transition-all cursor-pointer`}
                title={t("sidebar.projectSettings")}
              >
                <Settings size={10} strokeWidth={2} />
              </span>
              {isActive && projects.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    modeDispatch({ type: "START_CONFIRM", slug: project.slug });
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-danger transition-all cursor-pointer"
                >
                  <X size={10} strokeWidth={1.5} />
                </span>
              )}
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner sideOffset={4}>
                <ContextMenu.Popup className={MENU_POPUP_CLASS}>
                  <ContextMenu.Item
                    onClick={() => modeDispatch({ type: "START_DUPLICATE", sourceSlug: project.slug })}
                    className={MENU_ITEM_CLASS}
                  >
                    {t("project.duplicate")}
                  </ContextMenu.Item>
                </ContextMenu.Popup>
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}

      {mode.type === "duplicating" && (
        <input
          ref={createInputRef}
          value={mode.value}
          onChange={(e) => modeDispatch({ type: "SET_VALUE", value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleDuplicate();
            if (e.key === "Escape") modeDispatch({ type: "RESET" });
          }}
          onBlur={() => {
            if (mode.type === "duplicating" && !mode.value.trim()) modeDispatch({ type: "RESET" });
            else void handleDuplicate();
          }}
          placeholder={t("project.duplicateNamePlaceholder")}
          className={`w-full px-3 py-2 rounded-xl text-sm font-mono bg-elevated border text-accent outline-none placeholder:text-fg-4 ${mode.error ? "border-danger/60 animate-shake" : "border-accent/30"}`}
        />
      )}

      {mode.type === "creating" ? (
        <input
          ref={createInputRef}
          value={mode.value}
          onChange={(e) => modeDispatch({ type: "SET_VALUE", value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
            if (e.key === "Escape") modeDispatch({ type: "RESET" });
          }}
          onBlur={() => {
            if (mode.type === "creating" && !mode.value.trim()) modeDispatch({ type: "RESET" });
            else void handleCreate();
          }}
          placeholder={t("project.namePlaceholder")}
          className={`w-full px-3 py-2 rounded-xl text-sm font-mono bg-elevated border text-accent outline-none placeholder:text-fg-4 ${mode.error ? "border-danger/60 animate-shake" : "border-accent/30"}`}
        />
      ) : (
        <Menu.Root onOpenChange={(open) => { if (open) loadTemplates(); }}>
          <Menu.Trigger
            render={
              <button
                className="w-full px-3 py-2.5 rounded-xl text-sm border border-dashed border-edge/10 hover:border-accent/30 hover:bg-accent/5 text-fg-3 hover:text-accent transition-all duration-200 flex items-center gap-2"
              />
            }
          >
            <Plus size={12} strokeWidth={2.5} />
            {t("project.new")}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="start">
              <Menu.Popup className={`${MENU_POPUP_CLASS} min-w-[220px]`}>
                <Menu.Item
                  onClick={() => modeDispatch({ type: "START_CREATE" })}
                  className={`${MENU_ITEM_CLASS} flex items-center gap-2`}
                >
                  <Plus size={12} strokeWidth={2.5} />
                  {t("project.newOptionsEmpty")}
                </Menu.Item>
                {templates && templates.length > 0 && (
                  <>
                    <div className="my-1 border-t border-edge/8" role="separator" />
                    <Menu.Group>
                      <Menu.GroupLabel className="px-4 py-1 text-[10px] uppercase tracking-wider text-fg-4">
                        {t("project.newOptionsFromTemplate")}
                      </Menu.GroupLabel>
                      {templates.map((s) => (
                        <Menu.Item
                          key={s.name}
                          onClick={() => modeDispatch({ type: "START_CREATE", templateName: s.name })}
                          className={`${MENU_ITEM_CLASS} truncate`}
                        >
                          {s.name}
                        </Menu.Item>
                      ))}
                    </Menu.Group>
                  </>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  );
}
