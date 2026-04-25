import { copyExampleData } from "./copy-example-data.ts";

function runGit(args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });

  return result.success;
}

async function main() {
  if (!runGit(["rev-parse", "--verify", "--quiet", "ORIG_HEAD"])) {
    return;
  }

  if (runGit(["diff", "--quiet", "ORIG_HEAD", "HEAD", "--", "example_data/"])) {
    return;
  }

  await copyExampleData(process.cwd(), true);
}

main().catch((error) => {
  console.error(`[sync-example-data] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
