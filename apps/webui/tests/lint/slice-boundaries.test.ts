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

  test("requires external slice imports to go through index", () => {
    expect(
      classifyClientImport(
        "pages/ProjectPage",
        "@/client/renderer-host/presentationMachine.js",
      ),
    ).toMatchObject({
      code: "deep-import",
      level: "baseline",
      targetPath: "renderer-host/presentationMachine",
    });
  });

  test("allows external slice imports through index", () => {
    expect(
      classifyClientImport(
        "pages/ProjectPage",
        "@/client/project/index.js",
      ),
    ).toBeNull();
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

  test("warns on transitional entity cross-imports", () => {
    expect(
      classifyClientImport(
        "entities/view/ViewContext",
        "@/client/entities/ui/index.js",
      ),
    ).toMatchObject({
      code: "entity-cross-import",
      level: "warn",
    });
  });

  test("keeps existing transitional deep imports in the warning baseline", () => {
    const violation = classifyClientImport(
      "pages/ProjectPage",
      "@/client/session/ui/index.js",
    );

    expect(violation).toMatchObject({
      code: "deep-import",
      level: "baseline",
    });
    expect(shouldReportSliceBoundaryBaseline(violation!)).toBe(true);
    expect(shouldReportSliceBoundaryNew(violation!)).toBe(false);
  });

  test("blocks new transitional cross-imports outside the warning baseline", () => {
    const violation = classifyClientImport(
      "features/new-feature/useNewFeature",
      "@/client/features/project/index.js",
    );

    expect(violation).toMatchObject({
      code: "feature-cross-import",
      level: "warn",
    });
    expect(shouldReportSliceBoundaryBaseline(violation!)).toBe(false);
    expect(shouldReportSliceBoundaryNew(violation!)).toBe(true);
  });

  test("enforces the target slice DAG", () => {
    expect(
      classifyClientImport("provider/useProvider", "@/client/session/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "baseline",
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
      level: "baseline",
    });
  });

  test("allows the Phase 5 renderer-host to session input seam through public index", () => {
    expect(
      classifyClientImport("renderer-host/RenderedView", "@/client/session/index.js"),
    ).toBeNull();
    expect(
      classifyClientImport("renderer-host/RenderedView", "@/client/theme/index.js"),
    ).toMatchObject({
      code: "disallowed-slice-dependency",
      level: "baseline",
    });
  });

  test("allows the Phase 5 session read-only project list edge", () => {
    expect(
      classifyClientImport("session/stream/useStreaming", "@/client/project/index.js"),
    ).toBeNull();
  });

  test("keeps Phase 5 project and renderer-host baseline clean", () => {
    expect(
      shouldReportSliceBoundaryBaseline(
        classifyClientImport("project/useProject", "@/client/session/data/index.js")!,
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
      classifyClientImport("session/ui/BottomInput", "@/client/provider/index.js"),
    ).toBeNull();
  });

  test("extracts client-relative paths from repo filenames", () => {
    expect(
      getClientRelativePath(
        "C:/repo/apps/webui/src/client/features/project/ProjectTabs.tsx",
      ),
    ).toBe("features/project/ProjectTabs");
  });
});
