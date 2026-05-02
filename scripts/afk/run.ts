#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliArgs = process.argv.slice(2);
const isInit = cliArgs.includes("--init");
const forceReset = cliArgs.includes("--force-reset");

const PARALLEL = Number(process.env.PARALLEL ?? 1);
const RATE_LIMIT_MAX_RETRIES = Number(process.env.RATE_LIMIT_MAX_RETRIES ?? 3);
const RATE_LIMIT_BACKOFF_MS = Number(process.env.RATE_LIMIT_BACKOFF_MS ?? 60_000);
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? 10);
const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-opus-4-7";
const SHELL_TIMEOUT_MS = 30_000;
const MAIN_BRANCH = process.env.MAIN_BRANCH ?? "main";
const AFK_BRANCH = "afk/integration";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = await runGit(["rev-parse", "--show-toplevel"]);
const GIT_DIR = await runGit(["rev-parse", "--git-dir"]);
const GIT_COMMON_DIR = await runGit(["rev-parse", "--git-common-dir"]);
const IS_MAIN_CHECKOUT = GIT_DIR === GIT_COMMON_DIR;
const WORKTREES_DIR = join(dirname(REPO_ROOT), `${basename(REPO_ROOT)}-wt`);
const LOGS_DIR = join(REPO_ROOT, ".claude", "automate", "logs");
const ISSUE_BRANCH_PREFIX = "afk/issue-";
const ISSUE_DIR_PREFIX = "issue-";

interface PlannedIssue {
  number: number;
  title: string;
  branch: string;
  worktreeDir: string;
}

const inflight: Set<Bun.Subprocess> = new Set();
let shuttingDown = false;

async function runGit(
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

async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  const shellPromise = $`${{ raw: cmd }}`.cwd(cwd).quiet().nothrow();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`shell \`${cmd}\` timed out after ${timeoutMs}ms`)),
      timeoutMs,
    ),
  );
  const result = await Promise.race([shellPromise, timeoutPromise]);
  if (result.exitCode !== 0) {
    throw new Error(
      `shell \`${cmd}\` failed (${result.exitCode}): ${result.stderr
        .toString()
        .trim()}`,
    );
  }
  return result.stdout.toString().trim();
}

async function preprocessPrompt(
  filePath: string,
  args: Record<string, string>,
): Promise<string> {
  let content = await readFile(filePath, "utf8");

  content = content.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (_, key: string) => {
      if (!(key in args)) {
        throw new Error(`Missing prompt arg "${key}" for ${filePath}`);
      }
      return args[key]!;
    },
  );

  const shellMatches = [...content.matchAll(/!`([^`]+)`/g)];
  const shellResults = await Promise.all(
    shellMatches.map((m) => runShell(m[1]!, REPO_ROOT, SHELL_TIMEOUT_MS)),
  );
  for (let i = shellMatches.length - 1; i >= 0; i--) {
    const m = shellMatches[i]!;
    content =
      content.slice(0, m.index) +
      shellResults[i] +
      content.slice(m.index! + m[0].length);
  }

  return content;
}

interface StreamEvent {
  type: "text" | "result";
  text: string;
}

function parseStreamLine(line: string): StreamEvent[] {
  if (!line.trim()) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return [];
  }
  const events: StreamEvent[] = [];
  const o = obj as Record<string, unknown>;
  if (o.type === "assistant") {
    const message = o.message as
      | { content?: Array<{ type: string; text?: string }> }
      | undefined;
    for (const block of message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        events.push({ type: "text", text: block.text });
      }
    }
  } else if (o.type === "result" && typeof o.result === "string") {
    events.push({ type: "result", text: o.result });
  }
  return events;
}

interface AgentResult {
  combinedText: string;
  exitCode: number;
}

async function runAgent(opts: {
  name: string;
  promptFile: string;
  promptArgs: Record<string, string>;
  cwd: string;
  logFile: string;
}): Promise<AgentResult> {
  const promptText = await preprocessPrompt(opts.promptFile, opts.promptArgs);

  await mkdir(dirname(opts.logFile), { recursive: true });
  const logSink = Bun.file(opts.logFile).writer();

  const proc = Bun.spawn(
    [
      "claude",
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--model",
      AGENT_MODEL,
      "-p",
      "-",
    ],
    {
      cwd: opts.cwd,
      stdin: new TextEncoder().encode(promptText),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  inflight.add(proc);

  const decoder = new TextDecoder();
  let buf = "";
  let combinedText = "";

  process.stdout.write(`[${opts.name}] ▶ started (cwd=${opts.cwd})\n`);

  try {
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      const str = decoder.decode(chunk, { stream: true });
      logSink.write(str);
      buf += str;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        for (const evt of parseStreamLine(line)) {
          if (evt.type === "text") {
            const trimmed = evt.text.trim();
            if (trimmed) {
              const firstLine = trimmed.split("\n")[0]!.slice(0, 200);
              process.stdout.write(`[${opts.name}] ${firstLine}\n`);
            }
            combinedText += evt.text;
          } else if (evt.type === "result") {
            combinedText += evt.text;
          }
        }
      }
    }
  } finally {
    inflight.delete(proc);
    await logSink.flush();
    logSink.end();
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0 && !shuttingDown) {
    const stderr = await new Response(proc.stderr).text();
    const outputTail = combinedText.trim().slice(-500);
    throw new Error(
      `[${opts.name}] claude exited ${exitCode}: stderr=${stderr.trim().slice(0, 300)} | output_tail=${outputTail}`,
    );
  }
  process.stdout.write(`[${opts.name}] ◀ done (exit=${exitCode})\n`);
  return { combinedText, exitCode };
}

function isRateLimitError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  );
}

async function runAgentWithRetry(opts: {
  name: string;
  promptFile: string;
  promptArgs: Record<string, string>;
  cwd: string;
  logFile: string;
}): Promise<AgentResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      return await runAgent(opts);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt === RATE_LIMIT_MAX_RETRIES) {
        throw err;
      }
      const jitter = Math.random() * 30_000;
      const delay = RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt) + jitter;
      console.log(
        `[${opts.name}] rate limited, retry in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function createWorktree(
  branch: string,
  worktreeDir: string,
  baseBranch: string,
): Promise<string> {
  await mkdir(WORKTREES_DIR, { recursive: true });
  const path = join(WORKTREES_DIR, worktreeDir);
  try {
    await runGit(["worktree", "add", "-b", branch, path, baseBranch]);
  } catch {
    await runGit(["worktree", "add", path, branch]);
  }
  return path;
}

async function isWorktreeDirty(path: string): Promise<boolean> {
  const out = await runGit(["status", "--porcelain"], path);
  return out.length > 0;
}

async function removeWorktree(path: string): Promise<void> {
  await runGit(["worktree", "remove", "--force", path]);
}

async function commitsOnBranch(
  branch: string,
  base: string,
): Promise<string[]> {
  const out = await runGit(["log", `${base}..${branch}`, "--format=%H"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

async function listExistingAutomateDirs(): Promise<Set<string>> {
  if (!existsSync(WORKTREES_DIR)) return new Set();
  const entries = await readdir(WORKTREES_DIR);
  return new Set(entries.filter((e) => e.startsWith(ISSUE_DIR_PREFIX)));
}

function makeSemaphore(max: number): {
  acquire: () => Promise<void>;
  release: () => void;
} {
  let running = 0;
  const queue: Array<() => void> = [];
  return {
    acquire(): Promise<void> {
      if (running < max) {
        running++;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => queue.push(resolve));
    },
    release(): void {
      running--;
      const next = queue.shift();
      if (next) {
        running++;
        next();
      }
    },
  };
}

async function initMode(): Promise<void> {
  if (!IS_MAIN_CHECKOUT) {
    throw new Error(
      `--init must run from the main checkout, not from a worktree.\n` +
        `Current toplevel: ${REPO_ROOT}\n` +
        `git-dir:          ${GIT_DIR}`,
    );
  }

  const afkPath = join(dirname(REPO_ROOT), `${basename(REPO_ROOT)}-afk`);
  if (existsSync(afkPath)) {
    throw new Error(
      `AFK worktree path already exists: ${afkPath}\n` +
        `Remove the directory and run \`git worktree prune\` if you want to recreate it,\n` +
        `or just \`cd ${afkPath}\` and \`bun scripts/afk/run.ts\` to use it.`,
    );
  }

  await runGit(["rev-parse", "--verify", MAIN_BRANCH]);

  try {
    await runGit(["worktree", "add", "-b", AFK_BRANCH, afkPath, MAIN_BRANCH]);
  } catch {
    await runGit(["worktree", "add", afkPath, AFK_BRANCH]);
  }

  console.log(`Running bun install in ${afkPath} ...`);
  const installProc = Bun.spawn(["bun", "install"], {
    cwd: afkPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await installProc.exited) !== 0) {
    throw new Error(`bun install failed in ${afkPath}`);
  }

  console.log("");
  console.log("AFK worktree initialized.");
  console.log(`  path:   ${afkPath}`);
  console.log(`  branch: ${AFK_BRANCH} (forked from ${MAIN_BRANCH})`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${afkPath}`);
  console.log("  bun scripts/afk/run.ts");
}

async function preflight(): Promise<{ baseBranch: string }> {
  if (IS_MAIN_CHECKOUT) {
    throw new Error(
      `Refusing to run from the main checkout. AFK pipeline must run from its dedicated worktree.\n` +
        `Bootstrap with \`bun scripts/afk/run.ts --init\` from the main checkout, then run from the AFK worktree.\n` +
        `Current toplevel: ${REPO_ROOT}`,
    );
  }

  const currentBranch = await runGit(["symbolic-ref", "--short", "HEAD"]);
  if (currentBranch !== AFK_BRANCH) {
    throw new Error(
      `Current branch is "${currentBranch}", expected "${AFK_BRANCH}". AFK pipeline only runs on the integration branch.`,
    );
  }

  const dirty = await runGit(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    throw new Error(
      `AFK worktree has uncommitted changes on ${AFK_BRANCH}. Stash or commit before running.`,
    );
  }

  const ghProc = Bun.spawn(["gh", "auth", "status"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if ((await ghProc.exited) !== 0) {
    throw new Error("gh CLI not authenticated. Run `gh auth login`.");
  }

  await runGit(["rev-parse", "--verify", MAIN_BRANCH]);

  const ahead = await runGit(["log", `${MAIN_BRANCH}..HEAD`, "--format=%H"]);
  const aheadCount = ahead ? ahead.split("\n").filter(Boolean).length : 0;
  if (aheadCount > 0 && !forceReset) {
    throw new Error(
      `${AFK_BRANCH} has ${aheadCount} commit(s) not in ${MAIN_BRANCH}.\n` +
        `These may be unreviewed work, or commits you discarded after squash-merging selected ones.\n` +
        `If you've reviewed and merged what you wanted, pass --force-reset to discard the rest:\n` +
        `  bun scripts/afk/run.ts --force-reset\n\n` +
        `Unmerged commits (${MAIN_BRANCH}..${AFK_BRANCH}):\n${ahead}`,
    );
  }
  if (aheadCount > 0) {
    console.log(
      `Discarding ${aheadCount} commit(s) on ${AFK_BRANCH} (--force-reset).`,
    );
  }

  await runGit(["reset", "--hard", MAIN_BRANCH]);
  console.log(`Reset ${AFK_BRANCH} to ${MAIN_BRANCH}.`);

  return { baseBranch: AFK_BRANCH };
}

async function main(): Promise<void> {
  const { baseBranch } = await preflight();

  console.log(`Base branch: ${baseBranch}`);
  console.log(`Model: ${AGENT_MODEL}`);
  console.log(`Parallel: ${PARALLEL} | Max iterations: ${MAX_ITERATIONS}`);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    if (shuttingDown) break;

    console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

    const planResult = await runAgentWithRetry({
      name: `plan/${iteration}`,
      promptFile: join(SCRIPT_DIR, "plan-prompt.md"),
      promptArgs: {},
      cwd: REPO_ROOT,
      logFile: join(LOGS_DIR, `iteration-${iteration}__plan.jsonl`),
    });

    const planMatch = planResult.combinedText.match(/<plan>([\s\S]*?)<\/plan>/);
    if (!planMatch) {
      throw new Error(
        `Planner produced no <plan> tag.\n\n${planResult.combinedText.slice(-2000)}`,
      );
    }

    const parsed = JSON.parse(planMatch[1]!) as {
      issues: Array<{ number: number; title: string; branch: string }>;
    };
    if (parsed.issues.length === 0) {
      console.log("No issues to work on. Exiting.");
      break;
    }

    const existing = await listExistingAutomateDirs();
    const todo: PlannedIssue[] = parsed.issues
      .map((i) => {
        const expectedPrefix = `${ISSUE_BRANCH_PREFIX}${i.number}-`;
        if (!i.branch || !i.branch.startsWith(expectedPrefix)) {
          throw new Error(
            `Planner returned invalid branch name for issue #${i.number}: ${JSON.stringify(i.branch)}. Expected to start with "${expectedPrefix}".`,
          );
        }
        if (!/^afk\/issue-\d+-[a-z0-9-]+$/.test(i.branch)) {
          throw new Error(
            `Planner returned non-conforming branch name: ${i.branch}. Must match /^afk\\/issue-\\d+-[a-z0-9-]+$/.`,
          );
        }
        return {
          number: i.number,
          title: i.title,
          branch: i.branch,
          worktreeDir: `${ISSUE_DIR_PREFIX}${i.number}`,
        };
      })
      .filter((i) => !existing.has(i.worktreeDir));

    if (todo.length === 0) {
      console.log(
        "All planned issues already have preserved worktrees. Skipping iteration.",
      );
      continue;
    }

    console.log(`${todo.length} issue(s) to work in parallel:`);
    for (const i of todo)
      console.log(`  #${i.number}: ${i.title} → ${i.branch}`);

    const sem = makeSemaphore(PARALLEL);
    const settled = await Promise.allSettled(
      todo.map(async (issue): Promise<PlannedIssue & { commits: number }> => {
        await sem.acquire();
        let wtPath: string | undefined;
        try {
          wtPath = await createWorktree(
            issue.branch,
            issue.worktreeDir,
            baseBranch,
          );

          const installProc = Bun.spawn(["bun", "install"], {
            cwd: wtPath,
            stdout: "ignore",
            stderr: "pipe",
          });
          if ((await installProc.exited) !== 0) {
            const stderr = await new Response(installProc.stderr).text();
            throw new Error(
              `bun install failed in ${issue.branch}: ${stderr.trim().slice(0, 500)}`,
            );
          }

          await runAgentWithRetry({
            name: `impl/#${issue.number}`,
            promptFile: join(SCRIPT_DIR, "implement-prompt.md"),
            promptArgs: {
              ISSUE_NUMBER: String(issue.number),
              ISSUE_TITLE: issue.title,
              BRANCH: issue.branch,
            },
            cwd: wtPath,
            logFile: join(LOGS_DIR, `${issue.worktreeDir}__implement.jsonl`),
          });

          const afterImpl = await commitsOnBranch(issue.branch, baseBranch);
          if (afterImpl.length > 0) {
            try {
              await runAgentWithRetry({
                name: `review/#${issue.number}`,
                promptFile: join(SCRIPT_DIR, "review-prompt.md"),
                promptArgs: {
                  ISSUE_NUMBER: String(issue.number),
                  ISSUE_TITLE: issue.title,
                  BRANCH: issue.branch,
                  BASE_BRANCH: baseBranch,
                },
                cwd: wtPath,
                logFile: join(LOGS_DIR, `${issue.worktreeDir}__review.jsonl`),
              });
            } catch (err) {
              console.error(
                `[review/#${issue.number}] failed (continuing to merge): ${err}`,
              );
            }
          }

          const finalCommits = await commitsOnBranch(issue.branch, baseBranch);
          return { ...issue, commits: finalCommits.length };
        } finally {
          if (wtPath) {
            try {
              if (await isWorktreeDirty(wtPath)) {
                console.log(`[${issue.branch}] preserved (dirty)`);
              } else {
                await removeWorktree(wtPath);
              }
            } catch (err) {
              console.error(`[${issue.branch}] cleanup failed: ${err}`);
            }
          }
          sem.release();
        }
      }),
    );

    const completed: PlannedIssue[] = [];
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]!;
      const issue = todo[i]!;
      if (outcome.status === "rejected") {
        console.error(
          `  ✗ #${issue.number} (${issue.branch}): ${outcome.reason}`,
        );
      } else if (outcome.value.commits > 0) {
        completed.push(issue);
      }
    }

    console.log(
      `\nExecution complete. ${completed.length} branch(es) with commits:`,
    );
    for (const c of completed) console.log(`  ${c.branch}`);

    if (completed.length === 0) {
      console.log("No commits produced. Skipping merge.");
      continue;
    }

    await runAgentWithRetry({
      name: `merge/${iteration}`,
      promptFile: join(SCRIPT_DIR, "merge-prompt.md"),
      promptArgs: {
        BRANCHES: completed.map((c) => `- ${c.branch}`).join("\n"),
        ISSUES: completed.map((c) => `- #${c.number}: ${c.title}`).join("\n"),
      },
      cwd: REPO_ROOT,
      logFile: join(LOGS_DIR, `iteration-${iteration}__merge.jsonl`),
    });

    console.log("\nBranches merged.");
  }

  console.log("\nAll done.");
}

process.on("SIGINT", () => {
  if (shuttingDown) {
    console.error("\nForce exiting.");
    process.exit(130);
  }
  shuttingDown = true;
  console.error(
    "\nSIGINT — terminating in-flight agents (Ctrl-C again to force exit)...",
  );
  for (const proc of inflight) {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(130), 2000);
});

const entrypoint = isInit ? initMode : main;
entrypoint().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
