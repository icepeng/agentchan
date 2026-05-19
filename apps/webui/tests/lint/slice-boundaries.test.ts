import { describe, expect, test } from "bun:test";

import {
  classifyClientImport,
  getClientRelativePath,
  shouldReportSliceBoundaryBaseline,
  shouldReportSliceBoundaryNew,
} from "../../../../scripts/oxlint-agentchan-plugin.mjs";

describe("slice boundary lint rule", () => {
  test("allows same-slice internal imports", () => {
    expect(
      classifyClientImport(
        "project/ProjectTabs",
        "./ProjectSettingsModal.js",
      ),
    ).toBeNull();
  });

  test("requires external slice imports to go through index as errors", () => {
    expect(
      classifyClientImport(
        "shell/ProjectView",
        "@/client/renderer-host/presentationMachine.js",
      ),
    ).toMatchObject({
      code: "deep-import",
      level: "error",
      targetPath: "renderer-host/presentationMachine",
    });
  });

  test("allows external slice imports through index", () => {
    expect(
      classifyClientImport(
        "shell/ProjectView",
        "@/client/project/index.js",
      ),
    ).toBeNull();
  });

  test("blocks legacy shared root imports", () => {
    expect(
      classifyClientImport(
        "creative-agent/useAgentEventSubscription",
        "@/client/shared/useLatestRef.js",
      ),
    ).toMatchObject({
      code: "legacy-shared-import",
      level: "error",
    });
  });

  test("treats entity to feature imports as immediate errors", () => {
    expect(
      classifyClientImport(
        "entities/project/useProjects",
        "@/client/features/project/index.js",
      ),
    ).toMatchObject({
      code: "entity-to-feature",
      level: "error",
    });
  });

  test("treats feature to entity imports as immediate errors", () => {
    expect(
      classifyClientImport(
        "features/project/useProject",
        "@/client/entities/project/index.js",
      ),
    ).toMatchObject({
      code: "feature-to-entity",
      level: "error",
    });
  });

  test("treats transitional entity cross-imports as errors", () => {
    expect(
      classifyClientImport(
        "entities/view/ViewContext",
        "@/client/entities/ui/index.js",
      ),
    ).toMatchObject({
      code: "entity-cross-import",
      level: "error",
    });
  });

  test("reports former baseline deep imports as errors", () => {
    const violation = classifyClientImport(
      "shell/ProjectView",
      "@/client/creative-agent/ui/index.js",
    );

    expect(violation).toMatchObject({
      code: "deep-import",
      level: "error",
    });
    expect(shouldReportSliceBoundaryBaseline(violation!)).toBe(false);
    expect(shouldReportSliceBoundaryNew(violation!)).toBe(true);
  });

  test("blocks transitional cross-imports as errors", () => {
    const violation = classifyClientImport(
      "features/new-feature/useNewFeature",
      "@/client/features/project/index.js",
    );

    expect(violation).toMatchObject({
      code: "feature-cross-import",
      level: "error",
    });
    expect(shouldReportSliceBoundaryBaseline(violation!)).toBe(false);
    expect(shouldReportSliceBoundaryNew(violation!)).toBe(true);
  });

  test("enforces the target slice DAG", () => {
    expect(
      classifyClientImport("provider/useProvider", "@/client/creative-agent/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "error",
    });
  });

  test("uses the Phase 4 project to library dependency direction", () => {
    expect(
      classifyClientImport("project/useCreateProjectFromTemplate", "@/client/library/index.js"),
    ).toBeNull();
    expect(
      classifyClientImport("project/SaveAsTemplateModal", "@/client/project-editor/index.js"),
    ).toBeNull();
    expect(
      classifyClientImport("library/LibraryPage", "@/client/project/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "error",
    });
  });

  test("allows the renderer-host to creative-agent input seam through public index", () => {
    expect(
      classifyClientImport("renderer-host/RenderedView", "@/client/creative-agent/index.js"),
    ).toBeNull();
    expect(
      classifyClientImport("renderer-host/RenderedView", "@/client/theme/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "error",
    });
  });

  test("blocks the former creative-agent read-only project list edge after inversion", () => {
    expect(
      classifyClientImport("creative-agent/stream/useStreaming", "@/client/project/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "error",
    });
  });

  test("does not put Phase 5 project and renderer-host imports in a baseline", () => {
    expect(
      shouldReportSliceBoundaryBaseline(
        classifyClientImport("project/useProject", "@/client/creative-agent/session/index.js")!,
      ),
    ).toBe(false);
    expect(
      shouldReportSliceBoundaryBaseline(
        classifyClientImport("entities/renderer/useRendererOutput", "@/client/entities/project/index.js")!,
      ),
    ).toBe(false);
  });

  test("allows provider consumers recorded during Phase 3 grilling", () => {
    expect(
      classifyClientImport("shell/Sidebar", "@/client/provider/index.js"),
    ).toBeNull();
    expect(
      classifyClientImport("creative-agent/ui/BottomInput", "@/client/provider/index.js"),
    ).toBeNull();
  });

  test("keeps app-settings as a composition-only settings container", () => {
    expect(
      classifyClientImport("app-settings/SettingsView", "@/client/provider/index.js", ["ApiKeysTab"]),
    ).toBeNull();
    expect(
      classifyClientImport("app-settings/SettingsView", "@/client/theme/index.js", ["AppearanceTab"]),
    ).toBeNull();
    expect(
      classifyClientImport("app-settings/SettingsView", "@/client/update/index.js", ["AboutSection"]),
    ).toBeNull();
    expect(
      classifyClientImport("app-settings/SettingsView", "@/client/provider/index.js", ["useProviderMutations"]),
    ).toMatchObject({
      code: "app-settings-composition-only",
      level: "error",
    });
  });

  test("does not baseline shell root fallback deep imports", () => {
    const violation = classifyClientImport("main", "@/client/shell/RootErrorFallback.js");

    expect(violation).toMatchObject({
      code: "deep-import",
      level: "error",
    });
    expect(shouldReportSliceBoundaryBaseline(violation!)).toBe(false);
    expect(shouldReportSliceBoundaryNew(violation!)).toBe(true);
  });

  test("extracts client-relative paths from repo filenames", () => {
    expect(
      getClientRelativePath(
        "C:/repo/apps/webui/src/client/features/project/ProjectTabs.tsx",
      ),
    ).toBe("features/project/ProjectTabs");
  });
});
