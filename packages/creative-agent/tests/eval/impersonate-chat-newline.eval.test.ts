/**
 * Eval: Impersonate Character Chat — Append Newline Separation
 *
 * Verifies that when the agent appends RP content to scene.md,
 * the appended content starts with \n\n so the blockquote echo (> ...)
 * is parsed as a separate markdown block by the chat renderer.
 *
 * Without the leading blank line, the echo merges with the previous
 * dialogue line and the renderer fails to recognise it.
 */

import { describe, test, afterEach } from "bun:test";
import {
  EvalHarness,
  expectToolCallAny,
  expectAppendNewlineSeparation,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

const IMPERSONATE_SKILLS = ["impersonate-character-chat", "elara-brightwell"];

suite("impersonate-character-chat: append newline separation", () => {
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
    "follow-up append starts with \\n\\n",
    async () => {
      harness = await EvalHarness.create({
        skillNames: IMPERSONATE_SKILLS,
        prePopulate: {
          "output/scene.md":
            `*표류목 등불 주점. 모닥불이 타오르고, 빗소리가 창을 두드린다.*\n\n` +
            `[elara-brightwell:assets/avatar]**엘라라 브라이트웰:** "어서 와요, 나그네. 자리가 비었으니 앉아봐요."\n`,
        },
      });

      await harness.prompt(
        "캐릭터챗을 이어갑니다. output/scene.md에 이미 엘라라와의 장면이 시작되어 있습니다. " +
          "사용자 캐릭터 이름은 '카이'이고 말투는 과묵합니다. " +
          "사용자의 다음 메시지에 응답해 주세요: 바다에 대해 물어본다",
      );

      expectToolCallAny(harness.toolCalls, ["append", "write"], {
        file_path: /output\/scene/,
      });
      expectAppendNewlineSeparation(harness.toolCalls);
    },
    { timeout: 180_000 },
  );
});
