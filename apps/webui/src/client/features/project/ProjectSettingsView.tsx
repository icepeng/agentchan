import { useState, useEffect, useCallback, useMemo } from "react";
import { useUIState, useUIDispatch } from "@/client/app/context/UIContext.js";
import type { PageRoute } from "@/client/app/context/UIContext.js";
import { useI18n } from "@/client/i18n/index.js";
import { Button, IconButton, SectionHeader, TabBar, TextInput, Badge } from "@/client/shared/ui/index.js";
import { SkillEditor, LibraryBrowser } from "@/client/features/library/index.js";
import {
  useProjectState,
  useProjectDispatch,
  updateProject,
  fetchRendererSource,
  saveRendererSource,
} from "@/client/entities/project/index.js";
import {
  useSkillState,
  useSkillDispatch,
  fetchSkills,
  fetchProjectSkill,
  createProjectSkill,
  updateProjectSkill,
  deleteProjectSkill,
  fetchLibraryRenderers,
  fetchLibraryRenderer,
} from "@/client/entities/skill/index.js";

type SettingsTab = "general" | "skills" | "renderer";

export function ProjectSettingsView() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const projectState = useProjectState();
  const { t } = useI18n();
  const route = ui.currentPage as Extract<PageRoute, { page: "project-settings" }>;
  const slug = route.slug;
  const [tab, setTab] = useState<SettingsTab>(route.tab ?? "general");
  const activeSlug = projectState.activeProjectSlug;

  useEffect(() => {
    if (activeSlug && activeSlug !== slug && ui.currentPage.page === "project-settings") {
      uiDispatch({
        type: "NAVIGATE",
        route: { page: "project-settings", slug: activeSlug, tab },
      });
    }
  }, [activeSlug, slug, tab, ui.currentPage.page, uiDispatch]);

  const project = projectState.projects.find((p) => p.slug === slug);

  if (!project) return null;

  const tabLabels: Record<SettingsTab, string> = {
    general: t("settings.general"),
    skills: t("settings.skills"),
    renderer: t("settings.renderer"),
  };

  return (
    <div className="flex flex-col h-full bg-void">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/60">
        <IconButton
          onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "main" } })}
          title={t("settings.back")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <h2 className="font-display text-lg font-bold tracking-tight">{project.name}</h2>
        <TabBar
          tabs={[
            { key: "general", label: tabLabels.general },
            { key: "skills", label: tabLabels.skills },
            { key: "renderer", label: tabLabels.renderer },
          ]}
          active={tab}
          onChange={setTab}
          className="ml-4"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "general" && <GeneralTab slug={slug} project={project} />}
        {tab === "skills" && <SkillsTab slug={slug} />}
        {tab === "renderer" && <RendererTab slug={slug} />}
      </div>
    </div>
  );
}

// --- General Tab ---

function GeneralTab({ slug, project }: { slug: string; project: { name: string; outputDir?: string; notes?: string } }) {
  const projectDispatch = useProjectDispatch();
  const { t } = useI18n();
  const [name, setName] = useState(project.name);
  const [outputDir, setOutputDir] = useState(project.outputDir ?? "output");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProject(slug, { name: name.trim() || undefined, outputDir, notes });
      projectDispatch({ type: "UPDATE_PROJECT", oldSlug: slug, project: updated });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-8 animate-fade-slide">
        <SectionHeader title={t("settings.projectConfig")} />

        <div className="space-y-6">
          <div>
            <label className="block text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2">
              {t("settings.name")}
            </label>
            <TextInput size="md" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2">
              {t("settings.outputDir")}
            </label>
            <TextInput size="md" mono value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2">
              {t("settings.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 rounded-xl text-sm bg-elevated border border-edge/8 text-fg outline-none focus:border-accent/30 resize-y min-h-[200px] transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="h-px bg-gradient-to-r from-transparent via-edge/10 to-transparent mb-6" />
          <Button
            variant="accent"
            size="md"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Skills Tab ---

function SkillsTab({ slug }: { slug: string }) {
  const skillState = useSkillState();
  const skillDispatch = useSkillDispatch();
  const { t } = useI18n();
  const skills = skillState.skills;
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadSkills = useCallback(async () => {
    const list = await fetchSkills(slug);
    skillDispatch({ type: "SET_SKILLS", skills: list });
  }, [slug, skillDispatch]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleSelect = async (name: string) => {
    const data = await fetchProjectSkill(slug, name);
    setSelected(name);
    setContent(data.content);
    setBrowsing(false);
    setCreating(false);
  };

  const handleSave = async (newContent: string) => {
    if (!selected) return;
    await updateProjectSkill(slug, selected, newContent);
    await loadSkills();
  };

  const handleDelete = async () => {
    if (!selected) return;
    await deleteProjectSkill(slug, selected);
    setSelected(null);
    setContent("");
    await loadSkills();
  };

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    const template = `---\nname: ${name}\ndescription: ""\n---\n\n`;
    await createProjectSkill(slug, name, template);
    setCreating(false);
    setNewName("");
    await loadSkills();
    await handleSelect(name);
  };

  const handleCopied = async () => {
    await loadSkills();
  };

  if (browsing) {
    return (
      <div className="h-full">
        <LibraryBrowser
          projectSlug={slug}
          existingSkills={skills.map((s) => s.name)}
          onCopied={handleCopied}
          onClose={() => setBrowsing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: List */}
      <div className="w-72 flex-shrink-0 border-r border-edge/6 flex flex-col bg-base/40">
        <div className="p-3 space-y-1">
          <button
            onClick={() => setBrowsing(true)}
            className="w-full px-3 py-2 rounded-xl text-sm border border-dashed border-accent/20 hover:border-accent/40 hover:bg-accent/5 text-accent transition-all flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            {t("settings.fromLibrary")}
          </button>
          <button
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setBrowsing(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-sm border border-dashed border-edge/10 hover:border-accent/30 hover:bg-accent/5 text-fg-3 hover:text-accent transition-all flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
            </svg>
            {t("settings.newSkill")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {skills.map((s) => (
            <button
              key={s.name}
              onClick={() => handleSelect(s.name)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                selected === s.name
                  ? "bg-elevated text-accent"
                  : "text-fg-2 hover:text-fg hover:bg-elevated/50"
              }`}
            >
              <div className="font-medium truncate">{s.name}</div>
              {s.description && (
                <div className="text-xs text-fg-3 mt-0.5 truncate">{s.description}</div>
              )}
            </button>
          ))}
          {skills.length === 0 && (
            <div className="text-center text-fg-3 text-sm py-4">{t("settings.noSkills")}</div>
          )}
        </div>
      </div>

      {/* Right: Editor */}
      <div className="flex-1 p-4">
        {creating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <h3 className="text-sm font-medium text-fg-2">{t("common.newSkillTitle")}</h3>
            <TextInput
              mono
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder={t("common.skillNamePlaceholder")}
              autoFocus
              className="w-64"
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="accent"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                {t("common.create")}
              </Button>
            </div>
          </div>
        ) : selected ? (
          <SkillEditor
            key={selected}
            content={content}
            onSave={handleSave}
            onDelete={handleDelete}
            language="markdown"
            showTokenCount
          />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-3 text-sm">
            {t("settings.selectSkillToEdit")}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Renderer Tab ---

function RendererTab({ slug }: { slug: string }) {
  const { t } = useI18n();
  const skillState = useSkillState();
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryRenderers, setLibraryRenderers] = useState<{ name: string }[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const recommendedRenderers = useMemo(() => {
    const set = new Set<string>();
    for (const s of skillState.skills) {
      const rec = s.metadata?.["recommended-renderer"];
      if (rec) set.add(rec);
    }
    return set;
  }, [skillState.skills]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      fetchRendererSource(slug).then((data) => data.source).catch(() => null),
      fetchLibraryRenderers().catch(() => [] as { name: string }[]),
    ]).then(([src, renderers]) => {
      setSource(src);
      setLibraryRenderers(renderers);
      setLoading(false);
    });
  }, [slug]);

  const handleSave = async (newSource: string) => {
    await saveRendererSource(slug, newSource);
    setSource(newSource);
  };

  const handlePreview = async (name: string) => {
    setPreviewing(name);
    setPreviewSource(null);
    try {
      const data = await fetchLibraryRenderer(name);
      setPreviewSource(data.source);
    } catch {
      setPreviewing(null);
    }
  };

  const handleApply = async () => {
    if (!previewSource || !previewing) return;
    setApplying(true);
    try {
      await saveRendererSource(slug, previewSource);
      setSource(previewSource);
      setPreviewing(null);
      setPreviewSource(null);
    } finally {
      setApplying(false);
    }
  };

  const handleBackToCurrent = () => {
    setPreviewing(null);
    setPreviewSource(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-fg-3 text-sm">{t("settings.loading")}</div>;
  }

  return (
    <div className="flex h-full">
      {/* Left: Current + Library renderers */}
      <div className="w-72 flex-shrink-0 border-r border-edge/6 flex flex-col bg-base/40">
        {/* Current renderer */}
        <div className="p-3">
          <button
            onClick={handleBackToCurrent}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
              !previewing
                ? "bg-elevated text-accent"
                : "text-fg-2 hover:text-fg hover:bg-elevated/50"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              {t("settings.rendererTs")}
            </div>
            <div className="text-xs text-fg-3 mt-0.5">
              {source !== null ? t("settings.projectRenderer") : t("settings.notCreatedYet")}
            </div>
          </button>
        </div>

        {/* Library section */}
        {libraryRenderers.length > 0 && (
          <>
            <div className="px-4 pt-2 pb-1.5">
              <div className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
                {t("settings.rendererLibrary")}
              </div>
              <div className="mt-1.5 h-px bg-gradient-to-r from-edge/8 to-transparent" />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {libraryRenderers.map((r) => (
                <button
                  key={r.name}
                  onClick={() => handlePreview(r.name)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                    previewing === r.name
                      ? "bg-elevated text-accent"
                      : "text-fg-2 hover:text-fg hover:bg-elevated/50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium truncate">
                    <span className="truncate">{r.name}.ts</span>
                    {recommendedRenderers.has(r.name) && (
                      <Badge variant="accent">{t("settings.recommended")}</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {libraryRenderers.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-fg-3 text-xs px-4 text-center">
            {t("settings.noLibraryRenderers")}
          </div>
        )}
      </div>

      {/* Right: Editor or Preview */}
      <div className="flex-1 p-4 flex flex-col min-h-0">
        {previewing ? (
          /* Library renderer preview */
          previewSource !== null ? (
            <>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-fg-2">{previewing}.ts</span>
                  <span className="text-[11px] text-fg-3 px-1.5 py-0.5 rounded bg-elevated border border-edge/6">{t("settings.preview")}</span>
                </div>
                <Button
                  variant="accent"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? t("settings.applying") : t("settings.applyToProject")}
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <SkillEditor
                  key={previewing}
                  content={previewSource}
                  language="typescript"
                  readOnly
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-fg-3 text-sm">{t("settings.loading")}</div>
          )
        ) : source !== null ? (
          /* Current renderer editor */
          <SkillEditor
            key={slug}
            content={source}
            onSave={handleSave}
            language="typescript"
          />
        ) : (
          /* No renderer yet */
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-3">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <div className="text-fg-3 text-sm">{t("settings.noRendererYet")}</div>
            <div className="text-fg-3 text-xs">
              {libraryRenderers.length > 0
                ? t("settings.selectRendererToPreview")
                : t("settings.createInLibraryFirst")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
