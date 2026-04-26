/**
 * Eval: Parallel Tool Calls
 *
 * Verifies that startup workflows request independent reads in one assistant
 * tool-call batch instead of waiting for each result sequentially.
 */

import { describe, test, afterEach, expect } from "bun:test";
import {
  EvalHarness,
  expectToolCall,
  expectToolCallsInSameBatch,
} from "./harness.js";

const hasApiKey = !!process.env.GOOGLE_API_KEY;
const suite = hasApiKey ? describe : describe.skip;

suite("parallel tool calls", () => {
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
    "last-vow first turn batches startup reads and independent writes",
    async () => {
      harness = await EvalHarness.create({
        template: "last-vow",
        maxToolCalls: 20,
      });

      await harness.prompt("시작하자.");

      expect(
        harness.systemPromptLength,
        "parallel guidance should stay compact enough to avoid per-turn prompt bloat",
      ).toBeLessThanOrEqual(8_600);

      expectToolCall(harness.toolCalls, "activate_skill", {
        name: "start-scene",
      });
      const activationIndex = harness.toolCalls.findIndex(
        (tc) => tc.toolName === "activate_skill" && tc.args?.name === "start-scene",
      );
      const preSkillDiscovery = harness.toolCalls
        .slice(0, activationIndex)
        .filter((tc) => tc.toolName === "read" || tc.toolName === "tree" || tc.toolName === "grep");
      expect(preSkillDiscovery, "start-scene should be activated before startup discovery/read calls").toEqual([]);

      expectToolCallsInSameBatch(harness.toolCalls, [
        { toolName: "read", args: { file_path: /files[\\/]scenes[\\/]scene\.md/ } },
        { toolName: "read", args: { file_path: /files[\\/]stats\.md/ } },
      ]);

      expectToolCallsInSameBatch(harness.toolCalls, [
        { toolName: "read", args: { file_path: /files[\\/]personas[\\/]last-witness\.md/ } },
        { toolName: "read", args: { file_path: /files[\\/]characters[\\/]iseo[\\/]iseo\.md/ } },
        { toolName: "read", args: { file_path: /files[\\/]characters[\\/]hangyeol[\\/]hangyeol\.md/ } },
        { toolName: "read", args: { file_path: /files[\\/]characters[\\/]minji[\\/]minji\.md/ } },
      ]);

      expectToolCallsInSameBatch(harness.toolCalls, [
        { toolName: "write", args: { file_path: /files[\\/]suspects-truth\.md/ } },
        { toolName: "append", args: { file_path: /files[\\/]scenes[\\/]scene\.md/ } },
      ]);
    },
    { timeout: 180_000 },
  );
});
