import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../../..");

describe("onboarding slice", () => {
  test("exposes its public surface from client/onboarding", () => {
    const indexPath = join(repoRoot, "apps/webui/src/client/onboarding/index.ts");
    const source = readFileSync(indexPath, "utf8");

    expect(source).toContain("OnboardingWizard");
    expect(source).toContain("useOnboarding");
  });

  test("does not keep the old features/onboarding slice", () => {
    expect(
      existsSync(join(repoRoot, "apps/webui/src/client/features/onboarding")),
    ).toBe(false);
  });
});
