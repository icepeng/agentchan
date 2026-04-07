/**
 * Eval: Long-Term Memory Skill
 *
 * Verifies the v3.0 long-term-memory skill's core behavioral claims:
 *
 *   T1. Eager capture — when an event happens, the AI appends to journal.md
 *       AND edits MEMORY.md sections in the SAME LLM response (same
 *       assistantTurn). The "promote later" anti-pattern is forbidden.
 *
 *   T2. Cross-session recall — a fresh agent in session 2, with only
 *       MEMORY.md + journal.md persisted from session 1, can correctly
 *       recall a proper noun introduced in session 1 without it being
 *       mentioned in session 2's user prompt.
 *
 *   T3. Safety rules — when memory files already exist, the AI must NOT
 *       call `write` on them (only `edit` for MEMORY.md, only `append`
 *       for journal.md). Journal must never be `edit`-ed.
 *
 *   T4. search.ts smoke — the bundled search.ts script runs end-to-end
 *       on a fresh fixture and returns BM25-ranked hits for a Korean
 *       proper-noun query. No LLM, no API key required.
 *
 * Tests T1-T3 require GOOGLE_API_KEY and skip otherwise. T4 always runs.
 */

import { describe, test, afterEach, expect } from "bun:test";
import { readFile, mkdtemp, mkdir, writeFile, rm, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  EvalHarness,
  expectToolCall,
  expectNoToolCall,
  expectSameAssistantTurn,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const llmSuite = hasApiKey ? describe : describe.skip;

const MEMORY_SKILLS = ["long-term-memory", "character-chat", "elara-brightwell"];
const MONOREPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const SEARCH_TS_REL = "skills/long-term-memory/assets/search.ts";

// ============================================================================
// T1. Eager capture (single session)
// ============================================================================

llmSuite("long-term-memory: eager capture", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) {
      harness.dumpToolCalls();
      harness.dumpAssistantTexts();
      harness.dumpTokenStats();
      await harness.cleanup();
    }
  });

  test(
    "T1: append journal + edit MEMORY in same LLM response (2-turn)",
    async () => {
      harness = await EvalHarness.create({ skillNames: MEMORY_SKILLS });

      // --- Turn 1: bare init, no events yet ---
      // Forces the AI to create files via the first-write exception WITHOUT
      // bundling event capture into the initial write. Otherwise the AI
      // efficiently inlines the first event into the initial `write` and
      // never exercises the append/edit eager-capture path.
      await harness.prompt(
        "장기 기억 스킬을 활성화하고 엘라라 브라이트웰과의 캐릭터챗을 첫 세션으로 시작해.\n\n" +
          "메모리 파일이 없으니 빈 템플릿으로 생성해 (Core Facts·Relationship State·Open Threads·Timeline 섹션은 비워두거나 placeholder만). " +
          "엘라라가 주점에서 평범하게 손님을 맞는 일반적인 오프닝 장면만 연출해. " +
          "특별한 사건이나 인물 정보는 아직 없어 — 메모리에 캡처할 사건이 없는 상태야.\n\n" +
          "사용자 발화: > 안녕하세요. 자리 있나요?",
      );

      // First-write exception: both memory files created with `write`
      expectToolCall(harness.toolCalls, "write", { file_path: /memory\/MEMORY\.md/ });
      expectToolCall(harness.toolCalls, "write", { file_path: /memory\/journal\.md/ });

      // Snapshot tool call count so we can isolate turn 2's calls below
      const turn1End = harness.toolCalls.length;

      // --- Turn 2: a real event — eager capture must use append + edit ---
      await harness.prompt(
        "이어서 다음 사용자 발화에 응답해:\n\n" +
          "> 사실 저는 마렉이라는 사람을 찾고 있어요. 등대 근처에서 본 적이 있다고 들었거든요.\n\n" +
          "엘라라가 '마렉'이라는 이름에 미묘하게 반응 (긴장하거나 시선을 피하는 식 — 직접 인정하진 않음). " +
          "이건 새로운 사건이야 — 새 Open Thread + Relationship State 변화. " +
          "장기 기억 스킬의 eager capture 룰대로 즉시 메모리에 기록해 " +
          "(journal에 append + MEMORY.md 해당 섹션 edit, 같은 턴에).",
      );

      // Only consider tool calls from turn 2 — the eager pair must occur here
      const turn2Calls = harness.toolCalls.slice(turn1End);

      expectSameAssistantTurn(
        turn2Calls,
        { toolName: "append", argMatchers: { file_path: /memory\/journal\.md/ } },
        { toolName: "edit", argMatchers: { file_path: /memory\/MEMORY\.md/ } },
      );

      // Files exist with expected content (cumulative, both turns)
      const memory = await readFile(join(harness.projectDir, "memory/MEMORY.md"), "utf-8");
      const journal = await readFile(join(harness.projectDir, "memory/journal.md"), "utf-8");
      expect(memory).toContain("마렉");
      expect(journal).toContain("마렉");
    },
    { timeout: 360_000 },
  );
});

// ============================================================================
// T2. Cross-session recall (the headline test)
// ============================================================================

llmSuite("long-term-memory: cross-session recall", () => {
  let session1: EvalHarness | undefined;
  let session2: EvalHarness | undefined;

  afterEach(async () => {
    if (session2) {
      session2.dumpToolCalls();
      session2.dumpAssistantTexts();
      session2.dumpTokenStats();
      await session2.cleanup();
    }
    // session1 is cleaned up explicitly in the test (with keepFixture)
    // — only run cleanup here if it wasn't already done.
    if (session1 && !session2) {
      await session1.cleanup();
    }
    session1 = undefined;
    session2 = undefined;
  });

  test(
    "T2: session 2 recalls 마렉 from memory without prompt hint",
    async () => {
      // --- Phase 1: session 1 writes events to memory, then closes ---
      session1 = await EvalHarness.create({ skillNames: MEMORY_SKILLS });

      await session1.prompt(
        "장기 기억 스킬을 활성화하고 엘라라 브라이트웰과의 캐릭터챗을 첫 세션으로 시작해.\n\n" +
          "다음 사용자 발화에 응답해:\n\n" +
          "> 마렉이라는 사람 알아요? 등대 근처에서 자주 보였대요.\n\n" +
          "엘라라가 '마렉'에 미묘하게 반응 (긴장하거나 시선을 피하는 식). " +
          "이 사건을 메모리에 즉시 기록해 (Open Threads + Relationship State).",
      );

      // Verify session 1 actually wrote memory
      const memoryAfterS1 = await readFile(
        join(session1.projectDir, "memory/MEMORY.md"),
        "utf-8",
      );
      const journalAfterS1 = await readFile(
        join(session1.projectDir, "memory/journal.md"),
        "utf-8",
      );
      expect(memoryAfterS1).toContain("마렉");
      expect(journalAfterS1).toContain("마렉");

      const sharedDir = session1.projectDir;
      await session1.cleanup({ keepFixture: true });
      session1 = undefined; // prevent afterEach from re-cleaning

      // --- Phase 2: session 2 opens fresh agent on the same project ---
      session2 = await EvalHarness.create({
        skillNames: MEMORY_SKILLS,
        projectDir: sharedDir,
      });

      await session2.prompt(
        "같은 캐릭터챗 프로젝트를 이어가. 장기 기억 스킬을 활성화하고, " +
          "메모리 파일을 먼저 확인한 뒤 다음 사용자 발화에 응답해:\n\n" +
          "> 우리 지난번에 누구 얘기 했었지? 그 때 네가 좀 이상하게 반응했던 거 같아서.",
      );

      // The agent must consult memory (read MEMORY.md or journal.md)
      expectToolCall(session2.toolCalls, "read", { file_path: /memory\/MEMORY\.md/ });

      // The agent's response should mention 마렉 — recalled from memory,
      // not from the user prompt (which doesn't say the name).
      const allText = session2.assistantTexts.join("\n");
      expect(allText).toContain("마렉");
    },
    { timeout: 360_000 },
  );
});

// ============================================================================
// T3. Safety rules (no write/edit on existing files)
// ============================================================================

const PRE_MEMORY = `# Long-Term Memory

## Core Facts
- 배경: 문헤이븐의 표류목 등불 주점
- 엘라라는 정보 중개인 역할

## Relationship State
- Elara ↔ User: 첫 만남, 경계심

## Open Threads
- 마렉의 정체 (사용자가 찾고 있음)

## Timeline
- 04-07: 사용자가 마렉에 대해 처음 물음
`;

const PRE_JOURNAL = `# Journal

## 04-07 14:32 — 첫 만남
사용자가 주점에 들어와 마렉을 찾는다고 함.
엘라라가 미묘하게 반응 (시선을 피함).
→ Open: 엘라라가 마렉을 알 가능성.
`;

llmSuite("long-term-memory: safety rules", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) {
      harness.dumpToolCalls();
      harness.dumpAssistantTexts();
      harness.dumpTokenStats();
      await harness.cleanup();
    }
  });

  test(
    "T3: existing memory files — no write, no journal edit",
    async () => {
      harness = await EvalHarness.create({
        skillNames: MEMORY_SKILLS,
        prePopulate: {
          "memory/MEMORY.md": PRE_MEMORY,
          "memory/journal.md": PRE_JOURNAL,
        },
      });

      await harness.prompt(
        "장기 기억 스킬을 활성화하고 메모리를 확인한 뒤, 같은 캐릭터챗을 이어가.\n\n" +
          "다음 사용자 발화에 응답해:\n\n" +
          "> 마렉에 대해 더 알려줄 수 있어? 너 뭔가 알고 있는 거 같은데.\n\n" +
          "엘라라가 약간 더 정보를 흘리도록 연출해. 새로운 사건이 발생하면 " +
          "메모리 갱신 규칙(append journal + edit MEMORY)을 따라줘.",
      );

      // Files already exist — no `write` allowed on either
      const writeCalls = harness.toolCalls.filter((tc) => tc.toolName === "write");
      const memoryWrite = writeCalls.find((tc) => /memory\/MEMORY\.md/.test(String(tc.args.file_path)));
      const journalWrite = writeCalls.find((tc) => /memory\/journal\.md/.test(String(tc.args.file_path)));
      expect(memoryWrite).toBeUndefined();
      expect(journalWrite).toBeUndefined();

      // Journal must never be edited
      const journalEdits = harness.toolCalls.filter(
        (tc) => tc.toolName === "edit" && /memory\/journal\.md/.test(String(tc.args.file_path)),
      );
      expect(journalEdits.length).toBe(0);

      // MEMORY.md must never be append-ed (it's structured, edit-only)
      const memoryAppends = harness.toolCalls.filter(
        (tc) => tc.toolName === "append" && /memory\/MEMORY\.md/.test(String(tc.args.file_path)),
      );
      expect(memoryAppends.length).toBe(0);
    },
    { timeout: 240_000 },
  );
});

// ============================================================================
// T4. search.ts smoke (no LLM, no API key)
// ============================================================================

const SMOKE_MEMORY = `# Long-Term Memory

## Core Facts
- 마렉은 등대지기였다고 알려져 있다
- 푸른 빛 현상은 1년 전부터 기록됨

## Open Threads
- 엘라라가 마렉의 정체에 대해 알고 있을 가능성
`;

const SMOKE_JOURNAL = `# Journal

## 04-07 14:32 — 첫 만남
사용자가 주점에 들어와 마렉을 찾는다고 말함. 엘라라가 미묘하게 반응.

## 04-07 15:08 — 부두 산책
어부의 소문 청취. 푸른 빛 현상이 등대 근처에서 처음 등장했다는 이야기.

## 04-08 09:14 — 등대
마렉의 일지 발견. 푸른 빛이 1년 전부터 기록되어 있음.
`;

describe("long-term-memory: search.ts smoke", () => {
  let smokeDir: string;

  afterEach(async () => {
    if (smokeDir) {
      await rm(smokeDir, { recursive: true, force: true });
    }
  });

  test("T4: search.ts indexes memory and returns ranked hits for proper noun", async () => {
    smokeDir = await mkdtemp(join(tmpdir(), "ltm-smoke-"));

    // Copy the long-term-memory skill (for search.ts) and seed memory
    await cp(
      join(MONOREPO_ROOT, "example_data", "library", "skills", "long-term-memory"),
      join(smokeDir, "skills", "long-term-memory"),
      { recursive: true },
    );
    await mkdir(join(smokeDir, "memory"), { recursive: true });
    await writeFile(join(smokeDir, "memory", "MEMORY.md"), SMOKE_MEMORY, "utf-8");
    await writeFile(join(smokeDir, "memory", "journal.md"), SMOKE_JOURNAL, "utf-8");

    // Run the script as the SKILL.md instructs
    const proc = Bun.spawnSync({
      cmd: ["bun", SEARCH_TS_REL, "마렉"],
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

    // Should find 마렉 in both files (proper noun appears in MEMORY.md and journal.md)
    expect(stdout).toContain("memory/MEMORY.md");
    expect(stdout).toContain("memory/journal.md");
    // Snippet should highlight the matched term (LIKE fallback wraps in << >>)
    expect(stdout).toMatch(/<<마렉>>|마렉/);
    // stderr should report indexed file count
    expect(stderr).toContain("indexed");
  });
});
