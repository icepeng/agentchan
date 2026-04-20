#!/usr/bin/env bun
// One-shot migration: convert template renderer.ts files from
// `export function render` → mount contract via defineRenderer.
//
// Skips tides-of-moonhaven (Phase 4 work — character builder inline IIFE).
//
// Idempotent: re-running on an already-migrated file does nothing.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const TEMPLATES_DIR = join(ROOT, "example_data", "library", "templates");

const TEMPLATES: { name: string; hasTheme: boolean }[] = [
  { name: "character-chat", hasTheme: false },
  { name: "empty", hasTheme: false },
  { name: "impersonate-chat", hasTheme: false },
  { name: "interactive-chat", hasTheme: false },
  { name: "memory-chat", hasTheme: false },
  { name: "novel", hasTheme: false },
  { name: "sentinel", hasTheme: true },
  { name: "three-winds-ledger", hasTheme: true },
];

const IMPORT_LINE = `import { defineRenderer } from "@agentchan/renderer-runtime";`;

for (const { name, hasTheme } of TEMPLATES) {
  const path = join(TEMPLATES_DIR, name, "renderer.ts");
  let src = await readFile(path, "utf8");

  if (src.includes(IMPORT_LINE)) {
    console.log(`skip (already migrated): ${name}`);
    continue;
  }

  src = src.replace(/^export function render\b/m, "function render");
  if (hasTheme) {
    src = src.replace(/^export function theme\b/m, "function theme");
  }

  src = `${IMPORT_LINE}\n\n${src}`;

  if (!src.endsWith("\n")) src += "\n";
  src += hasTheme
    ? `\nexport default defineRenderer(render, { theme });\n`
    : `\nexport default defineRenderer(render);\n`;

  await writeFile(path, src);
  console.log(`migrated: ${name}${hasTheme ? " (with theme)" : ""}`);
}
