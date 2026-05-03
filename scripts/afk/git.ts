export async function runGit(
  args: string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  if (exit !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${exit}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

export async function commitsOnBranch(
  branch: string,
  base: string,
): Promise<string[]> {
  const out = await runGit(["log", `${base}..${branch}`, "--format=%H"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

export async function listAfkIssueBranches(): Promise<string[]> {
  const out = await runGit([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/afk/issue-",
  ]);
  return out ? out.split("\n").filter(Boolean) : [];
}
