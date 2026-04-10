/**
 * Eval: Stage 2-A — Plot Outline
 *
 * Verifies the agent reads story-structure.md and outline-template.md,
 * then writes the outline to files/outline.md.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCall } from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("novel-writing: Stage 2-A Plot Outline", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  test(
    "reads references and template, writes outline",
    async () => {
      harness = await EvalHarness.create();

      await harness.prompt(
        "판타지 소설을 쓰려고 합니다.\n" +
          "- 장르: 판타지\n" +
          '- 로그라인: 견습 마법사가 세계를 풀어버리는 금지된 주문을 발동했을 때, 그녀는 현실이 무너지기 전에 세 왕국을 횡단하여 해주를 찾아야 한다.\n' +
          "- 주제: 지식의 대가\n" +
          "- 목표 분량: 80,000 단어\n\n" +
          "전제가 확정되었으니 플롯 아웃라인을 작성해 주세요. 2-A 단계를 진행합니다.",
      );

      harness.dumpToolCalls();

      expectToolCall(harness.toolCalls, "read", { file_path: /story-structure\.md/ });
      expectToolCall(harness.toolCalls, "read", { file_path: /outline-template\.md/ });
      expectToolCall(harness.toolCalls, "write", { file_path: /output\/outline\.md/ });
    },
    { timeout: 180_000 },
  );
});
