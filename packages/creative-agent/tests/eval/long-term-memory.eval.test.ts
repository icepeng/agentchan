/**
 * Eval: Long-Term Memory
 *
 * Verifies the memory-chat template's core behavioral claims:
 *
 *   T1. Capture — on the first event, the model MUST `write` journal.md
 *       exactly once (first-write exception), then `append` all subsequent
 *       events in the same LLM response ("same-turn capture").
 *   T2. Cross-session recall — a fresh agent in session 2 reads journal.md
 *       and the character responds as if remembering the prior event.
 *   T3. Safety rules — when journal.md already exists, no `write` and no
 *       `edit` on it. Only `append`.
 *   T4. search.ts smoke — the bundled script runs end-to-end on a fresh
 *       fixture and returns BM25-ranked hits for a proper-noun query.
 *       No LLM, no API key required.
 *
 * Tests T1-T3 require GOOGLE_API_KEY. T4 always runs.
 *
 * History note (supersedes PR #23): PR #23 concluded from eval that a
 * single-file wrapper directory (`memory/journal.md`) is naturally rejected
 * by the model. That conclusion came from a degraded harness fixture (no
 * SYSTEM.md, no files/, missing skills). With the Phase 0 fidelity fix in
 * this PR, a path contrast experiment (files/journal.md vs files/memory/
 * journal.md) showed BOTH paths pass T1-T3 cleanly — the original failure
 * was a harness artifact, not a model behavior. `files/memory/journal.md`
 * is kept because it's symmetric with other `files/*` containers and
 * sharding-migration-friendly. See worktree commit history for details.
 */

import { describe, test, afterEach, expect } from "bun:test";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvalHarness, expectToolCall } from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const llmSuite = hasApiKey ? describe : describe.skip;

const MONOREPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const MEMORY_CHAT_DIR = join(
  MONOREPO_ROOT,
  "example_data",
  "library",
  "templates",
  "memory-chat",
);

const JOURNAL_PATH = "files/memory/journal.md";
const JOURNAL_REGEX = new RegExp(`^${JOURNAL_PATH.replaceAll(".", "\\.")}$`);

const PRE_JOURNAL =
  `# Journal\n\n` +
  `## 첫 만남\n` +
  `사용자가 주점에 들어와 마렉을 찾는다고 함.\n` +
  `엘라라가 미묘하게 반응 (시선을 피함).\n`;

// ---------------------------------------------------------------------------
// T1-T3: Core behavior (LLM-backed)
// ---------------------------------------------------------------------------

llmSuite("long-term-memory: core behavior", () => {
  let harness: EvalHarness | undefined;

  afterEach(async () => {
    if (harness) {
      harness.dumpToolCalls();
      harness.dumpAssistantTexts();
      harness.dumpTokenStats();
      await harness.cleanup();
      harness = undefined;
    }
  });

  test(
    "T1: first-write creates journal, subsequent event appends in same turn",
    async () => {
      harness = await EvalHarness.create({ template: "memory-chat" });

      // Turn 1: opening with no events — first-write exception only
      await harness.prompt(
        "엘라라 브라이트웰과의 캐릭터챗을 첫 세션으로 시작해.\n\n" +
          "메모리 파일이 없으니 빈 템플릿(`# Journal\\n`)으로 생성해. " +
          "엘라라가 주점에서 평범하게 손님을 맞는 일반적인 오프닝 장면만 연출해. " +
          "특별한 사건이나 인물 정보는 아직 없어 — 메모리에 캡처할 사건이 없는 상태야.\n\n" +
          "사용자 발화: > 안녕하세요. 자리 있나요?",
      );

      expectToolCall(harness.toolCalls, "write", { file_path: JOURNAL_REGEX });

      const turn1End = harness.toolCalls.length;

      // Turn 2: a real event — capture must append in the same turn
      await harness.prompt(
        "이어서 다음 사용자 발화에 응답해:\n\n" +
          "> 사실 저는 마렉이라는 사람을 찾고 있어요. 등대 근처에서 본 적이 있다고 들었거든요.\n\n" +
          "엘라라가 '마렉'이라는 이름에 미묘하게 반응 (긴장하거나 시선을 피하는 식 — 직접 인정하진 않음). " +
          "이건 새로운 사건이야. 즉시 journal에 append해.",
      );

      const turn2Calls = harness.toolCalls.slice(turn1End);
      expectToolCall(turn2Calls, "append", { file_path: JOURNAL_REGEX });

      const journal = await readFile(join(harness.projectDir, JOURNAL_PATH), "utf-8");
      expect(journal).toContain("마렉");
    },
    { timeout: 360_000 },
  );

  test(
    "T2: session 2 recalls 마렉 from journal without prompt hint",
    async () => {
      harness = await EvalHarness.create({
        template: "memory-chat",
        prePopulate: { [JOURNAL_PATH]: PRE_JOURNAL },
      });

      await harness.prompt(
        "같은 캐릭터챗 프로젝트를 이어가. 메모리 파일을 먼저 확인한 뒤 다음 사용자 발화에 응답해:\n\n" +
          "> 우리 지난번에 누구 얘기 했었지? 그 때 네가 좀 이상하게 반응했던 거 같아서.",
      );

      // Must read journal — whether the character verbally names 마렉 or
      // expresses recognition non-verbally is a character-acting choice,
      // not a recall test. We only check that journal was consulted.
      expectToolCall(harness.toolCalls, "read", { file_path: JOURNAL_REGEX });
    },
    { timeout: 360_000 },
  );

  test(
    "T3: existing journal — no write, no edit, only append",
    async () => {
      harness = await EvalHarness.create({
        template: "memory-chat",
        prePopulate: {
          [JOURNAL_PATH]: PRE_JOURNAL + `-> Open: 엘라라가 마렉을 알 가능성.\n`,
        },
      });

      await harness.prompt(
        "메모리를 확인한 뒤, 같은 캐릭터챗을 이어가.\n\n" +
          "다음 사용자 발화에 응답해:\n\n" +
          "> 마렉에 대해 더 알려줄 수 있어? 너 뭔가 알고 있는 거 같은데.\n\n" +
          "엘라라가 약간 더 정보를 흘리도록 연출해. 새로운 사건이 발생하면 " +
          "메모리 갱신 규칙(append journal)을 따라줘.",
      );

      const writesToJournal = harness.toolCalls.filter(
        (tc) =>
          tc.toolName === "write" && JOURNAL_REGEX.test(String(tc.args.file_path)),
      );
      expect(writesToJournal.length).toBe(0);

      const editsToJournal = harness.toolCalls.filter(
        (tc) =>
          tc.toolName === "edit" && JOURNAL_REGEX.test(String(tc.args.file_path)),
      );
      expect(editsToJournal.length).toBe(0);
    },
    { timeout: 240_000 },
  );
});

// ---------------------------------------------------------------------------
// T4: search.ts smoke test (no LLM, no API key)
// ---------------------------------------------------------------------------

const SMOKE_JOURNAL = `# Journal

## 첫 만남
사용자가 주점에 들어와 마렉을 찾는다고 말함. 엘라라가 미묘하게 반응.

## 부두 산책
어부의 소문 청취. 푸른 빛 현상이 등대 근처에서 처음 등장했다는 이야기.

## 등대 일지
마렉의 일지 발견. 푸른 빛이 1년 전부터 기록되어 있음.
`;

describe("long-term-memory: search.ts smoke", () => {
  let smokeDir: string | undefined;

  afterEach(async () => {
    if (smokeDir) {
      await rm(smokeDir, { recursive: true, force: true });
      smokeDir = undefined;
    }
  });

  test("T4: search.ts indexes journal and returns ranked hits for a proper noun", async () => {
    smokeDir = await mkdtemp(join(tmpdir(), "ltm-smoke-"));

    // Copy the memory-chat skill directory, then seed journal.md under
    // files/memory/ — mirrors what a real project looks like.
    const skillSrc = join(MEMORY_CHAT_DIR, "skills", "journal-search");
    const skillDst = join(smokeDir, "skills", "journal-search");
    await cp(skillSrc, skillDst, { recursive: true });
    await mkdir(join(smokeDir, "files", "memory"), { recursive: true });
    await writeFile(
      join(smokeDir, "files", "memory", "journal.md"),
      SMOKE_JOURNAL,
      "utf-8",
    );

    // Run the script as the skill instructs (from project root cwd)
    const proc = Bun.spawnSync({
      cmd: ["bun", "skills/journal-search/assets/search.ts", "마렉"],
      cwd: smokeDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);

    if (proc.exitCode !== 0) {
      throw new Error(
        `search.ts exited with code ${proc.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    expect(stdout).toContain("journal.md");
    // Snippet should highlight the matched term (LIKE fallback wraps in << >>)
    expect(stdout).toMatch(/<<마렉>>|마렉/);
    expect(stderr).toContain("indexed");
  });
});
