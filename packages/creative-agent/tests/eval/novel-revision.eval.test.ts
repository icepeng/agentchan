/**
 * Eval: revision skill
 *
 * Verifies the agent runs the consistency-check script against the
 * files directory.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCall } from "./harness.js";
import { STAGE_4_FIXTURES } from "./fixtures.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("revision: Revision", () => {
  let harness: EvalHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  test(
    "runs consistency check script",
    async () => {
      harness = await EvalHarness.create({
        skillNames: ["revision"],
        prePopulate: STAGE_4_FIXTURES,
      });

      await harness.prompt(
        "챕터 집필이 완료되었습니다. 퇴고 단계를 시작합니다.\n" +
          "먼저 일관성 점검을 실행해 주세요.",
      );

      harness.dumpToolCalls();

      expectToolCall(harness.toolCalls, "script", { file: /consistency-check\.ts/ });
    },
    { timeout: 180_000 },
  );
});
