/**
 * Eval: chapter-writing skill
 *
 * Verifies the agent reads prose-style-guide.md and chapter-template.md,
 * then writes a chapter file to files/chapters/.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCall } from "./harness.js";
import { STAGE_3_FIXTURES } from "./fixtures.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("chapter-writing: Chapter Writing", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  test(
    "reads style guide and template, writes chapter file",
    async () => {
      harness = await EvalHarness.create({
        skillNames: ["chapter-writing"],
        prePopulate: STAGE_3_FIXTURES,
      });

      await harness.prompt(
        "구조 단계가 완료되었으니 첫 번째 챕터를 집필합니다.\n" +
          "아웃라인의 1장(오프닝 이미지)에 해당하는 내용을 작성합니다.",
      );

      harness.dumpToolCalls();

      expectToolCall(harness.toolCalls, "read", { file_path: /prose-style-guide\.md/ });
      expectToolCall(harness.toolCalls, "read", { file_path: /chapter-template\.md/ });
      expectToolCall(harness.toolCalls, "write", { file_path: /files\/chapters\/\d{2}-.+\.md/ });
    },
    { timeout: 180_000 },
  );
});
