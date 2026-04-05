/**
 * Eval: Stage 2-C — World Building
 *
 * Verifies the agent writes world.md to the output directory.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCall } from "./harness.js";
import { OUTLINE_ONLY_FIXTURES } from "./fixtures.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("novel-writing: Stage 2-C World", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  test(
    "writes world.md",
    async () => {
      harness = await EvalHarness.create({
        prePopulate: OUTLINE_ONLY_FIXTURES,
      });

      await harness.prompt(
        "아웃라인이 완성되었으니 세계관을 구축합니다. 2-C 단계를 진행해 주세요.\n" +
          "배경은 마력선(레이라인)으로 연결된 세 왕국이 있는 판타지 대륙입니다.\n" +
          "시대 및 지리, 사회 구조, 규칙(마법 체계), 감각 팔레트를 포함해 주세요.",
      );

      harness.dumpToolCalls();

      expectToolCall(harness.toolCalls, "write", { file_path: /output\/world\.md/ });
    },
    { timeout: 180_000 },
  );
});
