import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useUIDispatch } from "@/client/app/context/UIContext.js";
import { useI18n } from "@/client/i18n/index.js";
import { IconButton, TabBar } from "@/client/shared/ui/index.js";
import { LibraryEditorView, type LibraryEditorConfig } from "./LibraryEditorView.js";
import {
  fetchLibrarySkills,
  fetchLibrarySkill,
  createLibrarySkill,
  updateLibrarySkill,
  deleteLibrarySkill,
  fetchLibraryRenderers,
  fetchLibraryRenderer,
  createLibraryRenderer,
  updateLibraryRenderer,
  deleteLibraryRenderer,
} from "@/client/entities/skill/index.js";

type Tab = "skills" | "renderers";

interface SkillItem {
  name: string;
  description: string;
}

interface RendererItem {
  name: string;
}

// -- Config objects ---

const skillsConfig: LibraryEditorConfig<SkillItem> = {
  fetchList: fetchLibrarySkills,
  fetchItem: (name) => fetchLibrarySkill(name).then((d) => d.content),
  createItem: createLibrarySkill,
  updateItem: updateLibrarySkill,
  deleteItem: deleteLibrarySkill,
  getTemplate: (name) => `---\nname: ${name}\ndescription: ""\n---\n\n`,
  getName: (item) => item.name,
  language: "markdown",
  showTokenCount: true,
  enableSkillToggles: true,
  labels: {
    newButton: "library.newSkill",
    newTitle: "library.newSkillTitle",
    namePlaceholder: "library.skillNamePlaceholder",
    selectToEdit: "library.selectSkillToEdit",
  },
};

const renderersConfig: LibraryEditorConfig<RendererItem> = {
  fetchList: fetchLibraryRenderers,
  fetchItem: (name) => fetchLibraryRenderer(name).then((d) => d.source),
  createItem: createLibraryRenderer,
  updateItem: updateLibraryRenderer,
  deleteItem: deleteLibraryRenderer,
  getTemplate: () => `interface RenderContext {
  outputFiles: { path: string; content: string; modifiedAt: number }[];
  skills: { name: string; description: string; metadata?: Record<string, string> }[];
  baseUrl: string;
}

export function render(ctx: RenderContext): string {
  return ctx.outputFiles.map(f => \`<pre>\${f.content}</pre>\`).join("\\n");
}
`,
  getName: (item) => item.name,
  language: "typescript",
  labels: {
    newButton: "library.newRenderer",
    newTitle: "library.newRendererTitle",
    namePlaceholder: "library.rendererNamePlaceholder",
    selectToEdit: "library.selectRendererToEdit",
  },
};

// -- Views ---

function SkillsView() {
  return (
    <LibraryEditorView
      config={skillsConfig}
      renderItem={(skill) => (
        <>
          <div className="font-medium truncate">{skill.name}</div>
          {skill.description && (
            <div className="text-xs text-fg-3 mt-0.5 truncate">{skill.description}</div>
          )}
        </>
      )}
    />
  );
}

function RenderersView() {
  return (
    <LibraryEditorView
      config={renderersConfig}
      renderItem={(renderer) => (
        <div className="font-medium truncate">{renderer.name}.ts</div>
      )}
    />
  );
}

// -- Main ---

export function LibraryView() {
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("skills");

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
        <h2 className="font-display text-lg font-bold tracking-tight">{t("library.title")}</h2>
        <TabBar
          tabs={[
            { key: "skills" as Tab, label: t("library.skillsTab") },
            { key: "renderers" as Tab, label: t("library.renderersTab") },
          ]}
          active={tab}
          onChange={setTab}
          className="ml-4"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "skills" ? <SkillsView /> : <RenderersView />}
      </div>
    </div>
  );
}
