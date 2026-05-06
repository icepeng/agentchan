#!/usr/bin/env bun
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleDir = join(repoRoot, "example_data");
const manifestPath = join(repoRoot, "apps/webui/src/server/builtin-templates.json");
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    check: { type: "boolean", default: false },
  },
});

const slugs = readdirSync(join(exampleDir, "library/templates"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const expected = `${JSON.stringify(slugs, null, 2)}\n`;

if (values.check) {
  const current = readFileSync(manifestPath, "utf-8");
  if (current !== expected) {
    console.error("[builtin-manifest] apps/webui/src/server/builtin-templates.json is out of sync.");
    console.error("[builtin-manifest] Run `bun run sync-builtins` and commit the result.");
    process.exit(1);
  }
  console.log(`[builtin-manifest] OK — ${slugs.length} templates in sync.`);
  process.exit(0);
}

await Bun.write(manifestPath, expected);

console.log(`[builtin-manifest] Wrote ${slugs.length} templates to ${manifestPath}`);
console.log(slugs.map((s) => `  - ${s}`).join("\n"));
