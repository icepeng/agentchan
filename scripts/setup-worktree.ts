import { stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { copyExampleData } from "./copy-example-data.ts";

type Options = {
  forceExampleData: boolean;
  root?: string;
};

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync(command, {
    cwd,
    stderr: "inherit",
    stdout: "inherit",
  });

  if (!result.success) {
    process.exit(result.exitCode || 1);
  }
}

async function exists(value: string) {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}

async function isFile(value: string) {
  try {
    return (await stat(value)).isFile();
  } catch {
    return false;
  }
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "force-example-data": { type: "boolean", default: false },
      root: { type: "string" },
    },
  });

  return {
    forceExampleData: values["force-example-data"] ?? false,
    root: values.root,
  };
}

async function main() {
  const options = parseOptions();
  const root = path.resolve(options.root ?? process.env.CLAUDE_PROJECT_DIR ?? ".");

  if (!(await isFile(path.join(root, ".git")))) {
    return;
  }

  run(["bun", "scripts/sync-worktree-includes.ts"], root);
  await copyExampleData(root, options.forceExampleData);

  if (!(await exists(path.join(root, "node_modules")))) {
    run(["bun", "install", "--frozen-lockfile"], root);
    console.log("[worktree] Dependencies installed");
  }

  console.log("[worktree] Ready. Start server with: bun run dev");
}

main().catch((error) => {
  console.error(`[worktree] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
