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
    const stagingFile = join(stagingDir, "vendor.js");
    const buildResult = await Bun.build({
      entrypoints: [entryPath],
      target: "browser",
      format: "esm",
      define: { "process.env.NODE_ENV": JSON.stringify(mode) },
      outdir: stagingDir,
      naming: "vendor.js",
    });
    if (!buildResult.success) {
      const message = buildResult.logs.map((log) => log.message).join("\n").trim();
      throw new Error(
        `Renderer vendor build failed for ${spec.specifier}: ${message || "no diagnostic"}`,
      );
    }
    const stagingSource = await readFile(stagingFile, "utf-8");
    const stagingMod = await import(`${pathToFileURL(stagingFile).href}?v=${crypto.randomUUID()}`);
    const defaultExport = (stagingMod as { default?: unknown }).default;
    if (defaultExport == null || typeof defaultExport !== "object") {
      throw new Error(
        `Renderer vendor entry ${spec.specifier} did not yield a default-exported namespace.`,
      );
    }
    const exportNames = collectExportNames(defaultExport as Record<string, unknown>);
    const facade = appendNamedExports(stagingSource, exportNames, spec.specifier);
    const outPath = join(outDir, spec.filename);
    await writeFile(outPath, facade, "utf-8");
    return { ...spec, outPath, exportNames };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
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
