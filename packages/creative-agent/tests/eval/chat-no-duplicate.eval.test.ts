/**
 * Eval: Character Chat — No Duplicate Response
 *
 * Verifies that when the agent writes RP content to a file via write/append,
 * it does NOT repeat the same content in the assistant text response.
 *
 * Uses the Phase 1 project structure: SYSTEM.md + files/ (no skills).
 * The chat project's SYSTEM.md contains output rules that instruct the model
 * to write to files/scenes/scene.md and NOT echo content in assistant text.
 */

import { describe, test, afterEach } from "bun:test";
import { EvalHarness, expectToolCallAny, expectNoWriteDuplication, expectAppendNewlineSeparation } from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("character-chat: no duplicate response", () => {
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
    "scene opening — write should not be echoed in text",
    async () => {
      harness = await EvalHarness.create({ copyProjectFiles: "chat" });

      await harness.prompt(
        "캐릭터챗을 시작합니다. 엘라라가 주점에서 손님을 맞이하는 장면을 바로 시작해 주세요.",
      );

      expectToolCallAny(harness.toolCalls, ["append", "write"], { file_path: /scenes\/scene/ });
      expectNoWriteDuplication(harness.toolCalls, harness.assistantTexts);
    },
    { timeout: 180_000 },
  );

  test(
    "follow-up reply — append should not be echoed in text",
    async () => {
      harness = await EvalHarness.create({
        copyProjectFiles: "chat",
        prePopulate: {
          "files/scenes/scene.md":
            `*표류목 등불 주점. 모닥불이 타오르고, 빗소리가 창을 두드린다.*\n\n` +
            `[elara-brightwell:assets/avatar]**엘라라 브라이트웰:** "어서 와요, 나그네. 자리가 비었으니 앉아봐요."\n`,
        },
      });

      await harness.prompt(
        "캐릭터챗을 이어갑니다. files/scenes/scene.md에 이미 엘라라와의 장면이 시작되어 있습니다. " +
        "사용자의 다음 메시지에 응답해 주세요: 안녕하세요, 오늘 날씨가 정말 험하네요.",
      );

      expectToolCallAny(harness.toolCalls, ["append", "write"], { file_path: /scenes\/scene/ });
      expectNoWriteDuplication(harness.toolCalls, harness.assistantTexts);
      expectAppendNewlineSeparation(harness.toolCalls);
    },
    { timeout: 180_000 },
  );
});
