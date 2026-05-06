import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type VendorMode = "development" | "production";

export interface VendorSpecifier {
  /** Bare specifier as it appears in importmap and renderer source. */
  specifier: string;
  /** Filename emitted into outDir. The fixture is served at `${urlPrefix}/${filename}`. */
  filename: string;
}

export const VENDOR_SPECIFIERS: readonly VendorSpecifier[] = [
  { specifier: "react", filename: "react.js" },
  { specifier: "react-dom/client", filename: "react-dom-client.js" },
  { specifier: "react/jsx-runtime", filename: "react-jsx-runtime.js" },
  { specifier: "react/jsx-dev-runtime", filename: "react-jsx-dev-runtime.js" },
  { specifier: "scheduler", filename: "scheduler.js" },
];

export interface VendorBuildOptions {
  outDir: string;
  mode: VendorMode;
}

export interface VendorFixtureBuildResult extends VendorSpecifier {
  outPath: string;
  exportNames: string[];
}

export interface VendorBuildResult {
  outDir: string;
  mode: VendorMode;
  fixtures: VendorFixtureBuildResult[];
}

export async function buildVendorFixtures(
  options: VendorBuildOptions,
): Promise<VendorBuildResult> {
  await mkdir(options.outDir, { recursive: true });
  const fixtures: VendorFixtureBuildResult[] = [];
  for (const spec of VENDOR_SPECIFIERS) {
    const result = await buildVendorFixture(spec, options);
    fixtures.push(result);
  }
  return { outDir: options.outDir, mode: options.mode, fixtures };
}

async function buildVendorFixture(
  spec: VendorSpecifier,
  { outDir, mode }: VendorBuildOptions,
): Promise<VendorFixtureBuildResult> {
  const entryPath = import.meta.resolveSync(spec.specifier);
  const stagingDir = await mkdtemp(join(tmpdir(), "renderer-vendor-"));
  try {
    // Pass 1 (introspection): self-contained build with no externals so we
    // can `await import()` the result and enumerate the default-exported
    // namespace's keys. The emission build externalizes peer specifiers,
    // which would leave bare `import "react"` statements that Node cannot
    // resolve from the staging tmpdir — hence the separate pass.
    const introspectFile = join(stagingDir, "introspect.js");
    const introspectResult = await Bun.build({
      entrypoints: [entryPath],
      target: "browser",
      format: "esm",
      define: { "process.env.NODE_ENV": JSON.stringify(mode) },
      outdir: stagingDir,
      naming: "introspect.js",
    });
    assertBuildSucceeded(introspectResult, spec.specifier, "introspection");
    const introspectMod = await import(
      `${pathToFileURL(introspectFile).href}?v=${crypto.randomUUID()}`
    );
    const defaultExport = (introspectMod as { default?: unknown }).default;
    if (defaultExport == null || typeof defaultExport !== "object") {
      throw new Error(
        `Renderer vendor entry ${spec.specifier} did not yield a default-exported namespace.`,
      );
    }
    const exportNames = collectExportNames(defaultExport as Record<string, unknown>);

    // Pass 2 (emission): externalize every other vendor specifier so the
    // browser importmap collapses them all onto the same `react.js` and
    // `scheduler.js` modules. Without this, react-dom/client (and the jsx
    // runtimes) inline their own copy of React, end up with a separate
    // ReactSharedInternals object, and `useState` reads a null dispatcher
    // set by a different React instance — "Invalid hook call" on first render.
    const peerExternals = VENDOR_SPECIFIERS
      .filter((other) => other.specifier !== spec.specifier)
      .map((other) => other.specifier);
    const emissionFile = join(stagingDir, "vendor.js");
    const emissionResult = await Bun.build({
      entrypoints: [entryPath],
      target: "browser",
      format: "esm",
      define: { "process.env.NODE_ENV": JSON.stringify(mode) },
      outdir: stagingDir,
      naming: "vendor.js",
      external: peerExternals,
    });
    assertBuildSucceeded(emissionResult, spec.specifier, "emission");
    const emissionSource = await readFile(emissionFile, "utf-8");
    const mutable = aliasExternalImportsAsMutable(emissionSource, peerExternals);
    const facade = appendNamedExports(mutable, exportNames, spec.specifier);
    const outPath = join(outDir, spec.filename);
    await writeFile(outPath, facade, "utf-8");
    return { ...spec, outPath, exportNames };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

/**
 * Bun emits externalized peers as `import * as X from "specifier"`. ESM
 * import bindings are immutable, but the underlying CJS source — e.g.
 * `react/cjs/react-jsx-dev-runtime.development.js` — does
 * `var React = require("react"); ...; React = { react_stack_bottom_frame: ... };`
 * to install dev-only stack-tracing helpers. With the source untouched,
 * that reassignment throws "Cannot assign to import 'React'" the first time
 * the module evaluates, blocking every renderer that pulls in jsx-runtime.
 *
 * Restore CJS-compatible mutability by renaming each external import to a
 * private alias and shadowing it with a `var` of the original name. The
 * downstream code keeps `React` as a writable namespace; the importmap
 * still resolves the underlying module to the shared vendor fixture, so
 * React identity is preserved.
 */
function aliasExternalImportsAsMutable(source: string, externals: string[]): string {
  const externalSet = new Set(externals);
  const importRe =
    /^(import\s*\*\s*as\s+)([A-Za-z_$][\w$]*)(\s+from\s+["'])([^"']+)(["'];?)$/gm;
  let aliasIndex = 0;
  return source.replace(importRe, (match, prefix, localName, middle, specifier, suffix) => {
    if (!externalSet.has(specifier)) return match;
    const alias = `__vendor_external_${aliasIndex++}`;
    return `${prefix}${alias}${middle}${specifier}${suffix}\nvar ${localName} = ${alias};`;
  });
}

function assertBuildSucceeded(
  result: { success: boolean; logs: { message: string }[] },
  specifier: string,
  pass: string,
): void {
  if (result.success) return;
  const message = result.logs.map((log) => log.message).join("\n").trim();
  throw new Error(
    `Renderer vendor ${pass} build failed for ${specifier}: ${message || "no diagnostic"}`,
  );
}

const RESERVED_NAMES = new Set([
  "default",
  "import",
  "export",
  "var",
  "let",
  "const",
  "function",
  "class",
  "if",
  "else",
  "return",
  "for",
  "while",
  "switch",
  "case",
  "break",
  "continue",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "in",
  "of",
  "void",
  "this",
  "super",
  "yield",
  "await",
  "true",
  "false",
  "null",
  "undefined",
]);

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

function collectExportNames(namespace: Record<string, unknown>): string[] {
  return Object.keys(namespace)
    .filter((key) => IDENTIFIER_RE.test(key) && !RESERVED_NAMES.has(key))
    .sort();
}

const TRAILING_DEFAULT_RE = /export\s+default\s+([\s\S]+?);\s*$/;

function appendNamedExports(
  source: string,
  exportNames: string[],
  specifier: string,
): string {
  const trimmed = source.replace(/\s+$/u, "");
  const match = trimmed.match(TRAILING_DEFAULT_RE);
  if (!match) {
    throw new Error(
      `Renderer vendor build for ${specifier} did not end with \`export default <expr>;\` — Bun output shape changed.`,
    );
  }
  const expr = match[1];
  const before = trimmed.slice(0, match.index);
  const namedDecls = exportNames
    .map((name) => `export const ${name} = __vendor_default.${name};`)
    .join("\n");
  return [
    before,
    `const __vendor_default = (${expr});`,
    `export default __vendor_default;`,
    namedDecls,
    "",
  ].join("\n");
}
