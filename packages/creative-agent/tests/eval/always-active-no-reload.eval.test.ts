/**
 * Eval: Always-Active Skill — No Redundant Reload
 *
 * Verifies that an always-active skill (whose body is already seeded into the
 * conversation by `createConversation`) is NOT re-loaded via `activate_skill`
 * on the user's first or follow-up turn.
 *
 * The bug this targets: even though `generateCatalog` hides always-active
 * skills from the "## Available Skills" section, the seeded user node still
 * contains `<skill_content name="...">` blocks — the model can read the name
 * from history and call `activate_skill({name: ...})`, which SkillManager
 * happily re-injects. This wastes tokens and spams the conversation with
 * duplicate skill bodies.
 *
 * The harness enables `seedAlwaysActive: true`, which mirrors the runtime
 * behavior of `createConversation` in lifecycle.ts by placing the always-active
 * seed content in the `setupCreativeAgent` history list.
 */

import { describe, test, afterEach } from "bun:test";
import {
  EvalHarness,
  expectNoSkillActivation,
  expectToolCallAny,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

// elara-brightwell is declared `always-active: true` in example_data —
// character-chat is a normal activatable skill and is expected to be loaded
// by the model on the first turn.
const CHAT_SKILLS = ["character-chat", "elara-brightwell"];
const ALWAYS_ACTIVE = "elara-brightwell";

suite("always-active skill: no redundant reload", () => {
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
    "first turn — model must not activate an already-seeded always-active skill",
    async () => {
      harness = await EvalHarness.create({
        skillNames: CHAT_SKILLS,
        seedAlwaysActive: true,
      });

      await harness.prompt(
        "캐릭터챗을 시작합니다. 엘라라가 주점에서 손님을 맞이하는 장면을 바로 시작해 주세요.",
      );

      // activate_skill for the already-seeded character is the bug we care about.
      expectNoSkillActivation(harness.toolCalls, ALWAYS_ACTIVE);
    },
    { timeout: 180_000 },
  );

  test(
    "follow-up turn — still no reload after the model has written content",
    async () => {
      harness = await EvalHarness.create({
        skillNames: CHAT_SKILLS,
        seedAlwaysActive: true,
        prePopulate: {
          "output/scene.md":
            `*표류목 등불 주점. 모닥불이 타오르고, 빗소리가 창을 두드린다.*\n\n` +
            `[elara-brightwell:assets/avatar]**엘라라 브라이트웰:** "어서 와요, 나그네. 자리가 비었으니 앉아봐요."\n`,
        },
      });

      await harness.prompt(
        "캐릭터챗을 이어갑니다. output/scene.md에 이미 엘라라와의 장면이 시작되어 있습니다. " +
          "사용자의 다음 메시지에 응답해 주세요: 안녕하세요, 오늘 날씨가 정말 험하네요.",
      );

      await harness.prompt(
        "이어서 응답해 주세요: 주인이 이 동네 소식은 다 안다고 들었는데, 요즘 특이한 손님 없었어요?",
      );

      // The model should be writing/appending scene content as normal…
      expectToolCallAny(harness.toolCalls, ["append", "write"], {
        file_path: /output\/scene/,
      });
      // …but must never re-activate the always-active character skill.
      expectNoSkillActivation(harness.toolCalls, ALWAYS_ACTIVE);
    },
    { timeout: 300_000 },
  );
});
