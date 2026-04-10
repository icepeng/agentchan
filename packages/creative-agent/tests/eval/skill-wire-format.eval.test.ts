/**
 * Eval: Skill Body Wire Format — Instruction Following Baseline
 *
 * Measures how well the model follows skill instructions after activation.
 * This serves as a baseline for the current steered-user-message approach.
 * When the wire format changes to tool_result-direct, re-run these same
 * tests to compare instruction-following quality.
 *
 * Scenarios:
 *   1a. Skill activation → structured stage-1 questioning
 *   1b. Skill activation → correct file write path (outline)
 *   1c. Skill directory path usage in script/read calls
 */

import { describe, test, afterEach } from "bun:test";
import {
  EvalHarness,
  expectToolCall,
  expectToolCallAny,
  expectAssistantText,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("skill wire format: instruction following baseline", () => {
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
    "1a: novel-writing activation triggers stage-1 questioning",
    async () => {
      harness = await EvalHarness.create({
        skillNames: ["novel-writing"],
      });

      await harness.prompt("소설을 쓰고 싶어요. 도와주세요.");

      // Model should activate the novel-writing skill
      expectToolCall(harness.toolCalls, "activate_skill", {
        name: "novel-writing",
      });

      // After activation, skill body instructs: "사용자에게 장르, 로그라인,
      // 주제, 목표 분량을 확인합니다" — the model should ask about genre,
      // logline, or similar stage-1 questions.
      expectAssistantText(
        harness.assistantTexts,
        /장르|로그라인|주제|어떤.*소설|어떤.*이야기/,
      );
    },
    { timeout: 180_000 },
  );

  test(
    "1b: stage-2 outline creation writes to correct path",
    async () => {
      harness = await EvalHarness.create({
        skillNames: ["novel-writing"],
      });

      // Provide all stage-1 info upfront to skip questioning
      await harness.prompt(
        "소설을 쓰고 싶어요. 장르: 판타지, 로그라인: 견습 마법사가 금지된 주문을 발동하여 " +
          "세계가 무너지기 전에 해주를 찾아야 한다. 주제: 지식의 대가. " +
          "목표 분량: 80,000 단어. 바로 2단계 아웃라인 작성으로 진행해주세요.",
      );

      // Model should activate the skill
      expectToolCall(harness.toolCalls, "activate_skill", {
        name: "novel-writing",
      });

      // Skill body says outline goes to output/outline.md (or files/outline.md
      // depending on project structure). Accept either.
      expectToolCallAny(harness.toolCalls, ["write", "append"], {
        file_path: /outline/,
      });
    },
    { timeout: 180_000 },
  );

  test(
    "1c: skill directory path correctly prefixed in file operations",
    async () => {
      harness = await EvalHarness.create({
        skillNames: ["novel-writing"],
        prePopulate: {
          // Simulate existing outline to trigger stage-3
          "output/outline.md": "# 아웃라인\n## 1막\n### 오프닝\n리라는 서고에서 주문서를 발견한다.\n",
        },
      });

      await harness.prompt(
        "novel-writing 스킬을 활성화하고, 이 프로젝트의 아웃라인을 읽어보세요. " +
          "스킬 디렉토리에 있는 리소스 파일 목록도 확인해주세요.",
      );

      // The model should read the skill directory contents.
      // buildSkillContent adds: "Skill directory: skills/novel-writing"
      // The model should use this path prefix for any skill resource access.
      expectToolCall(harness.toolCalls, "activate_skill", {
        name: "novel-writing",
      });

      // The model should read the outline and/or skill resources
      expectToolCallAny(harness.toolCalls, ["read", "ls"], {
        file_path: /outline|skills\/novel-writing/,
      });
    },
    { timeout: 180_000 },
  );
});
