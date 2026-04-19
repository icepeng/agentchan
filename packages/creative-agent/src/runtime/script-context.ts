import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { resolveInProject } from "../tools/_paths.js";

/**
 * Capability surface exposed to user scripts. All access to the host
 * environment goes through this object — `fs`, `process`, `Bun`, `fetch`,
 * `require` are not available inside the script function body.
 *
 * `project.*` paths are lexically contained to `projectDir` via
 * `resolveInProject` (same helper the other tools use).
 */
export interface ScriptContext {
  readonly project: {
    readFile(path: string): string;
    writeFile(path: string, content: string): void;
    exists(path: string): boolean;
    listDir(path: string): string[];
  };
  readonly yaml: {
    parse(text: string): unknown;
    stringify(value: unknown): string;
  };
  readonly random: {
    int(minInclusive: number, maxExclusive: number): number;
  };
  readonly util: {
    /**
     * `node:util.parseArgs` 1:1 — same overloads, same type inference from
     * `options` schema. Pass `{args, options, strict, allowPositionals}`.
     */
    parseArgs: typeof parseArgs;
  };
}

export type ScriptResult = string | object | void;

export function createScriptContext(projectDir: string): ScriptContext {
  const join = (p: string) => resolveInProject(projectDir, p);
  return {
    project: {
      readFile: (p) => readFileSync(join(p), "utf-8"),
      writeFile: (p, content) => writeFileSync(join(p), content, "utf-8"),
      exists: (p) => existsSync(join(p)),
      listDir: (p) => readdirSync(join(p)),
    },
    yaml: {
      parse: (text) => Bun.YAML.parse(text),
      stringify: (value) => Bun.YAML.stringify(value),
    },
    random: {
      int: (min, max) => randomInt(min, max),
    },
    util: { parseArgs },
  };
}
