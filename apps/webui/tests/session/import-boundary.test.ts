import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CLIENT_DIR = join(import.meta.dir, "../../src/client");

function clientSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...clientSourceFiles(path));
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("Web UI creative-agent import boundary", () => {
  test("client code does not value-import the server-only root package", () => {
    const offenders: string[] = [];

    for (const file of clientSourceFiles(CLIENT_DIR)) {
      const source = readFileSync(file, "utf8");
      const dynamicImport = /import\(\s*["']@agentchan\/creative-agent["']\s*\)/g;
      const rootValueImport = importExportStatements(source).some(
        (statement) =>
          /\bfrom\s+["']@agentchan\/creative-agent["']/.test(statement) &&
          !/^\s*(?:import|export)\s+type\b/.test(statement),
      );
      if (rootValueImport || dynamicImport.test(source)) {
        offenders.push(relative(CLIENT_DIR, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});

function importExportStatements(source: string): string[] {
  const statements: string[] = [];
  let current: string | null = null;

  for (const line of source.split(/\r?\n/)) {
    if (current === null) {
      if (!/^\s*(?:import|export)\b/.test(line)) continue;
      current = line;
    } else {
      current += `\n${line}`;
    }

    if (line.includes(";")) {
      statements.push(current);
      current = null;
    }
  }

  if (current !== null) statements.push(current);
  return statements;
}
