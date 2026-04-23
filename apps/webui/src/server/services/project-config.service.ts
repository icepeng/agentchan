import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PUBLIC_SOURCE_DIR } from "../paths.js";

const MANAGED_HEADER = "<!-- MANAGED BY agentchan — DO NOT EDIT -->";

/**
 * Standard tsconfig body for a project's `tsconfig.json`. The `paths` mapping
 * reaches three directories up to `apps/webui/public/types/renderer.d.ts`
 * (same relative shape in dev and the exe sidecar).
 */
const TSCONFIG_BODY = `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "paths": {
      "@agentchan/types": ["../../../public/types/renderer.d.ts"]
    }
  },
  "include": ["renderer/**/*.ts", "renderer/**/*.js"]
}
`;

/**
 * Keeps per-project config files in sync with the agentchan source of truth:
 *
 * - `{slug}/tsconfig.json` — LSP config. Overwritten idempotently on every
 *   open so an agentchan upgrade can drop new compiler options into every
 *   project without bespoke migration.
 * - `{slug}/skills/build-renderer/SKILL.md` — also agentchan-owned. The
 *   source copy lives in `public/skills/build-renderer/SKILL.md` and is
 *   copied into every project (and every template) on open.
 */
export function createProjectConfigService(projectsDir: string) {
  const skillSourcePath = join(
    PUBLIC_SOURCE_DIR,
    "skills",
    "build-renderer",
    "SKILL.md",
  );

  async function syncFile(
    destPath: string,
    expected: string,
  ): Promise<void> {
    try {
      const existing = await readFile(destPath, "utf-8");
      if (existing === expected) return;
    } catch {
      // missing — fall through to write
    }
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, expected, "utf-8");
  }

  return {
    async syncProjectConfig(slug: string): Promise<void> {
      const projectDir = join(projectsDir, slug);
      if (!existsSync(projectDir)) return;

      // tsconfig
      await syncFile(join(projectDir, "tsconfig.json"), TSCONFIG_BODY);

      // build-renderer SKILL.md — only copy if source exists (skip silently
      // during bootstrap before public assets land on disk).
      if (existsSync(skillSourcePath)) {
        const raw = await readFile(skillSourcePath, "utf-8");
        const stamped = raw.startsWith(MANAGED_HEADER)
          ? raw
          : `${MANAGED_HEADER}\n${raw}`;
        await syncFile(
          join(projectDir, "skills", "build-renderer", "SKILL.md"),
          stamped,
        );
      }
    },

    TSCONFIG_BODY,
  };
}

export type ProjectConfigService = ReturnType<typeof createProjectConfigService>;
