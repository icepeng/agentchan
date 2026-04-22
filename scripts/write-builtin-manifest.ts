#!/usr/bin/env bun
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleDir = join(repoRoot, "example_data");
const manifestPath = join(repoRoot, "apps/webui/src/server/builtin-templates.json");

const slugs = readdirSync(join(exampleDir, "library/templates"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

await Bun.write(manifestPath, `${JSON.stringify(slugs, null, 2)}\n`);

console.log(`[builtin-manifest] Wrote ${slugs.length} templates to ${manifestPath}`);
console.log(slugs.map((s) => `  - ${s}`).join("\n"));
