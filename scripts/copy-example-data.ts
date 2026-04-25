import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type Options = {
  force: boolean;
  root?: string;
};

async function exists(value: string) {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}

export async function copyExampleData(root: string, force: boolean) {
  const dataDir = path.join(root, "apps", "webui", "data");
  const libraryDir = path.join(dataDir, "library");
  const templatesDir = path.join(libraryDir, "templates");
  const exampleDir = path.join(root, "example_data");

  if (force) {
    await rm(libraryDir, { recursive: true, force: true });
  }

  if (await exists(templatesDir)) {
    console.log("[copy-example-data] Data already exists (use --force to overwrite)");
    return;
  }

  await mkdir(dataDir, { recursive: true });
  for (const entry of await readdir(exampleDir)) {
    await cp(path.join(exampleDir, entry), path.join(dataDir, entry), {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
  }
  console.log("[copy-example-data] Copied example_data to apps/webui/data");
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      force: { type: "boolean", default: false },
      root: { type: "string" },
    },
  });

  return {
    force: values.force ?? false,
    root: values.root,
  };
}

function defaultRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..");
}

if (import.meta.main) {
  const options = parseOptions();
  copyExampleData(path.resolve(options.root ?? defaultRoot()), options.force).catch((error) => {
    console.error(`[copy-example-data] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
