import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Code, FileText, Plus } from "lucide-react";
import { useUIState, useUIDispatch, type PageRoute } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { Button, IconButton, SectionHeader, TabBar, TextInput } from "@/client/shared/ui/index.js";
import { SkillEditor } from "@/client/features/library/index.js";
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
  fetchProjectSystem,
  saveProjectSystem,
} from "@/client/entities/skill/index.js";

type SettingsTab = "general" | "system" | "skills" | "renderer";

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
    system: t("settings.system"),
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
          <ArrowLeft size={16} strokeWidth={2} />
        </IconButton>
        <h2 className="font-display text-lg font-bold tracking-tight">{project.name}</h2>
        <TabBar
          tabs={[
            { key: "general", label: tabLabels.general },
            { key: "system", label: tabLabels.system },
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
        {tab === "system" && <SystemTab slug={slug} />}
        {tab === "skills" && <SkillsTab slug={slug} />}
        {tab === "renderer" && <RendererTab slug={slug} />}
      </div>
    </div>
  );
}

// --- General Tab ---

function GeneralTab({ slug, project }: { slug: string; project: { name: string; notes?: string } }) {
  const projectDispatch = useProjectDispatch();
  const { t } = useI18n();
  const [name, setName] = useState(project.name);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProject(slug, { name: name.trim() || undefined, notes });
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

  return (
    <div className="flex h-full">
      {/* Left: List */}
      <div className="w-72 flex-shrink-0 border-r border-edge/6 flex flex-col bg-base/40">
        <div className="p-3 space-y-1">
          <button
            onClick={() => {
              setCreating(true);
              setSelected(null);
            }}
            className="w-full px-3 py-2 rounded-xl text-sm border border-dashed border-edge/10 hover:border-accent/30 hover:bg-accent/5 text-fg-3 hover:text-accent transition-all flex items-center gap-2"
          >
            <Plus size={12} strokeWidth={2.5} />
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

function FileEditorTab({ slug, fetchContent, saveContent, language, showTokenCount, emptyIcon, emptyText }: {
  slug: string;
  fetchContent: (slug: string) => Promise<string | null>;
  saveContent: (slug: string, content: string) => Promise<void>;
  language: "markdown" | "typescript";
  showTokenCount?: boolean;
  emptyIcon: React.ReactNode;
  emptyText: string;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchContent(slug)
      .then((c) => { if (!cancelled) setContent(c); })
      .catch(() => { if (!cancelled) setContent(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, fetchContent]);

  const handleSave = async (newContent: string) => {
    await saveContent(slug, newContent);
    setContent(newContent);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-fg-3 text-sm">{t("settings.loading")}</div>;
  }

  return (
    <div className="flex-1 p-4 h-full">
      {content !== null ? (
        <SkillEditor key={`${language}-${slug}`} content={content} onSave={handleSave} language={language} showTokenCount={showTokenCount} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          {emptyIcon}
          <div className="text-fg-3 text-sm">{emptyText}</div>
        </div>
      )}
    </div>
  );
}

const fetchSystem = (slug: string) => fetchProjectSystem(slug).then((d) => d.content || null);
const fetchRenderer = (slug: string) => fetchRendererSource(slug).then((d) => d.source);

function SystemTab({ slug }: { slug: string }) {
  const { t } = useI18n();
  return (
    <FileEditorTab
      slug={slug} fetchContent={fetchSystem} saveContent={saveProjectSystem}
      language="markdown" showTokenCount
      emptyIcon={<FileText size={32} strokeWidth={1.5} className="text-fg-3" />}
      emptyText={t("settings.noSystemYet")}
    />
  );
}

function RendererTab({ slug }: { slug: string }) {
  const { t } = useI18n();
  return (
    <FileEditorTab
      slug={slug} fetchContent={fetchRenderer} saveContent={saveRendererSource}
      language="typescript"
      emptyIcon={<Code size={32} strokeWidth={1.5} className="text-fg-3" />}
      emptyText={t("settings.noRendererYet")}
    />
  );
}
