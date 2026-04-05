/**
 * Eval: Stage 2-B — Character Design
 *
 * Verifies the agent reads character-archetypes.md and character-sheet.md,
 * then writes character files to output/characters/.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCall } from "./harness.js";
import { OUTLINE_ONLY_FIXTURES } from "./fixtures.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("novel-writing: Stage 2-B Characters", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  test(
    "reads archetypes and template, writes character sheets",
    async () => {
      harness = await EvalHarness.create({
        prePopulate: OUTLINE_ONLY_FIXTURES,
      });

      await harness.prompt(
        "아웃라인이 완성되었으니 주요 캐릭터를 설계합니다. 2-B 단계를 진행해 주세요.\n" +
          "- 주인공 리라 (19세 견습 마법사)\n" +
          "- 적대자 보라스 (52세 타락한 대마법사)\n" +
          "- 조력자 현자 엘로웬",
      );

      harness.dumpToolCalls();

      expectToolCall(harness.toolCalls, "read", { file_path: /character-archetypes\.md/ });
      expectToolCall(harness.toolCalls, "read", { file_path: /character-sheet\.md/ });
      expectToolCall(harness.toolCalls, "write", { file_path: /output\/characters\/.+\.md/ });
    },
    { timeout: 180_000 },
  );
});
