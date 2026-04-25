import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const INCLUDE_FILE = ".worktreeinclude";

type Options = {
  dryRun: boolean;
  source?: string;
  target?: string;
};

function runGit(args: string[], cwd = process.cwd()) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (!result.success) {
    const message = result.stderr.toString().trim();
    throw new Error(message || `git ${args.join(" ")} failed`);
  }

  return result.stdout.toString().trim();
}

function isWithin(root: string, value: string) {
  const relative = path.relative(root, value);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveInside(root: string, entry: string) {
  const resolved = path.resolve(root, entry);
  if (!isWithin(root, resolved)) {
    throw new Error(`${entry} escapes ${root}`);
  }
  return resolved;
}

function normalizeEntry(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }
  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
}

async function readIncludeFile(sourceRoot: string) {
  const includePath = path.join(sourceRoot, INCLUDE_FILE);
  const file = Bun.file(includePath);
  if (!(await file.exists())) {
    throw new Error(`${INCLUDE_FILE} not found at ${includePath}`);
  }

  const entries = (await file.text())
    .split(/\r?\n/)
    .map(normalizeEntry)
    .filter((entry): entry is string => Boolean(entry));

  return entries;
}

function defaultSourceRoot(targetRoot: string) {
  const commonDir = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], targetRoot);
  if (path.basename(commonDir) === ".git") {
    return path.dirname(commonDir);
  }
  return runGit(["rev-parse", "--show-toplevel"], targetRoot);
}

async function syncEntry(entry: string, sourceRoot: string, targetRoot: string, dryRun: boolean) {
  const cleanEntry = entry.replace(/\/+$/, "");
  const sourcePath = resolveInside(sourceRoot, cleanEntry);
  const targetPath = resolveInside(targetRoot, cleanEntry);

  let sourceStats;
  try {
    sourceStats = await stat(sourcePath);
  } catch {
    console.warn(`[worktreeinclude] skipped missing ${entry}`);
    return;
  }

  if (dryRun) {
    console.log(`[worktreeinclude] would copy ${entry}`);
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: sourceStats.isDirectory(),
    force: true,
    errorOnExist: false,
  });
  console.log(`[worktreeinclude] copied ${entry}`);
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      source: { type: "string" },
      target: { type: "string" },
    },
  });

  return {
    dryRun: values["dry-run"] ?? false,
    source: values.source,
    target: values.target,
  };
}

async function main() {
  const options = parseOptions();
  const targetRoot = path.resolve(options.target ?? runGit(["rev-parse", "--show-toplevel"]));
  const sourceRoot = path.resolve(options.source ?? process.env.WORKTREE_INCLUDE_SOURCE ?? defaultSourceRoot(targetRoot));

  if (sourceRoot === targetRoot) {
    console.log("[worktreeinclude] source and target are the same; nothing to copy");
    return;
  }

  const entries = await readIncludeFile(sourceRoot);
  for (const entry of entries) {
    await syncEntry(entry, sourceRoot, targetRoot, options.dryRun);
  }
}

main().catch((error) => {
  console.error(`[worktreeinclude] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
