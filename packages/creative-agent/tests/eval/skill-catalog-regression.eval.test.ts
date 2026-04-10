/**
 * Eval: Skill Catalog — System Prompt Placement Regression
 *
 * After Phase 1, the skill catalog moved from a user message to the system
 * prompt. This eval checks that the model does NOT eagerly activate every
 * listed skill regardless of user intent — the "Gemini over-activation"
 * regression documented in research/skill-wire-format-comparison.md §5.1.
 *
 * Scenarios:
 *   2a. Generic greeting — no skill activation expected
 *   2b. Domain-specific request — only the relevant skill activated
 */

import { describe, test, afterEach } from "bun:test";
import {
  EvalHarness,
  expectToolCall,
  expectNoToolCall,
  expectNoSkillActivation,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

// Two skills in the catalog — model should be selective
const MULTI_SKILLS = ["outline", "example"];

suite("skill catalog: system prompt placement regression", () => {
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
    "2a: generic greeting — no skill activation",
    async () => {
      harness = await EvalHarness.create({
        skillNames: MULTI_SKILLS,
      });

      await harness.prompt("안녕하세요! 오늘 날씨가 좋네요.");

      // A simple greeting should NOT trigger any skill activation.
      // If the model activates skills here, it means the catalog in the
      // system prompt is causing over-eager activation.
      expectNoToolCall(harness.toolCalls, "activate_skill");
    },
    { timeout: 180_000 },
  );

  test(
    "2b: domain request activates only the relevant skill",
    async () => {
      harness = await EvalHarness.create({
        skillNames: MULTI_SKILLS,
      });

      await harness.prompt("소설을 하나 쓰고 싶어요. 어떻게 시작하면 좋을까요?");

      // Should activate outline (matches the request)
      expectToolCall(harness.toolCalls, "activate_skill", {
        name: "outline",
      });

      // Should NOT activate the example skill (irrelevant to the request)
      expectNoSkillActivation(harness.toolCalls, "example");
    },
    { timeout: 180_000 },
  );

  test(
    "2c: ambiguous request — model should not activate all skills",
    async () => {
      harness = await EvalHarness.create({
        skillNames: MULTI_SKILLS,
      });

      await harness.prompt(
        "이 프로젝트에서 뭘 할 수 있는지 알려주세요.",
      );

      // Asking "what can I do?" should ideally result in the model describing
      // the available skills from the catalog WITHOUT activating them.
      // At most, the model might activate the example skill to demonstrate,
      // but it should NOT activate both.
      const activations = harness.toolCalls.filter(
        (tc) => tc.toolName === "activate_skill",
      );
      if (activations.length > 1) {
        throw new Error(
          `Expected at most 1 skill activation for an ambiguous request, ` +
            `but got ${activations.length}: ${activations.map((tc) => tc.args?.name).join(", ")}`,
        );
      }
    },
    { timeout: 180_000 },
  );
});
