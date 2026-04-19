import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";

/**
 * Capability surface exposed to user scripts. All access to the host
 * environment goes through this object — `fs`, `process`, `Bun`, `fetch`,
 * `require` are not available inside the script function body.
 *
 * Path containment for `project.*` will be applied by Phase 1 Layer A
 * (`resolveInProject`) once that lands; until then the host fs APIs are
 * used directly.
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
  const join = (p: string) => resolve(projectDir, p);
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
