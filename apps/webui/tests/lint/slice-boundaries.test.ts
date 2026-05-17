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
        "features/project/ProjectTabs",
        "./ProjectSettingsModal.js",
      ),
    ).toBeNull();
  });

  test("requires external slice imports to go through index", () => {
    expect(
      classifyClientImport(
        "pages/TemplatesPage",
        "@/client/features/project/TrustTemplateDialog.js",
      ),
    ).toMatchObject({
      code: "deep-import",
      level: "baseline",
      targetPath: "features/project/TrustTemplateDialog",
    });
  });

  test("allows external slice imports through index", () => {
    expect(
      classifyClientImport(
        "pages/ProjectPage",
        "@/client/features/project/index.js",
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
        "entities/renderer/useRendererOutput",
        "@/client/entities/project/index.js",
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

  test("extracts client-relative paths from repo filenames", () => {
    expect(
      getClientRelativePath(
        "C:/repo/apps/webui/src/client/features/project/ProjectTabs.tsx",
      ),
    ).toBe("features/project/ProjectTabs");
  });
});
