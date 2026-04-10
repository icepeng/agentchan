import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { setupCreativeAgent, clearConversationAgentState } from "../../src/agent/orchestrator.js";
import { createAgentContext } from "../../src/agent/context.js";
import { createConversation } from "../../src/agent/lifecycle.js";
import type { StoredMessage } from "../../src/types.js";
import { createFixture, cleanupFixture, type Fixture } from "./fixtures.js";
import type { CollectedToolCall } from "./assertions.js";

export type { CollectedToolCall } from "./assertions.js";
export {
  expectToolCall,
  expectToolCallAny,
  expectNoToolCall,
  expectNoSkillActivation,
  expectNoWriteDuplication,
  expectAppendNewlineSeparation,
  expectAssistantText,
} from "./assertions.js";

export interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  turns: number;
}

export interface EvalHarnessOptions {
  skillName?: string;
  skillNames?: string[];
  /** Copy SYSTEM.md + files/ from an example_data project. */
  copyProjectFiles?: string;
  provider?: string;
  model?: string;
  prePopulate?: Record<string, string>;
  maxToolCalls?: number;
  timeoutMs?: number;
}

export class EvalHarness {
  readonly toolCalls: CollectedToolCall[] = [];
  readonly assistantTexts: string[] = [];
  readonly tokenStats: TokenStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    turns: 0,
  };
  private toolCallMap = new Map<string, CollectedToolCall>();

  private constructor(
    readonly fixture: Fixture,
    private agent: Agent,
    private conversationId: string,
    private timeoutMs: number,
    readonly systemPromptLength: number,
  ) {}

  /** Convenience accessor — full path to the project under the temp projects dir. */
  get projectDir(): string {
    return this.fixture.projectDir;
  }

  static async create(options: EvalHarnessOptions = {}): Promise<EvalHarness> {
    const hasSkillOption = options.skillName !== undefined || options.skillNames !== undefined;
    const skillNames = hasSkillOption
      ? (options.skillNames ?? [options.skillName!])
      : (options.copyProjectFiles ? [] : ["novel-writing"]);
    const provider = options.provider ?? process.env.EVAL_PROVIDER ?? "google";
    const model = options.model ?? process.env.EVAL_MODEL ?? "gemini-3-flash-preview";
    const maxToolCalls = options.maxToolCalls ?? 30;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] ?? "";

    const fixture = await createFixture({
      skillNames,
      copyProjectFiles: options.copyProjectFiles,
      prePopulate: options.prePopulate,
    });

    // Drive the production conversation-bootstrap path. New conversations
    // start empty — SYSTEM.md and skill catalog are in the system prompt.
    const ctx = createAgentContext({
      projectsDir: fixture.projectsDir,
      resolveAgentConfig: () => ({ provider, model, apiKey, temperature: 0 }),
    });
    const created = await createConversation(ctx, fixture.slug);
    const conversationId = created.conversation.id;
    const history: StoredMessage[] = [];

    const { agent, systemPrompt } = await setupCreativeAgent(
      {
        provider,
        model,
        projectDir: fixture.projectDir,
        apiKey,
        temperature: 0,
      },
      history,
      conversationId,
    );

    const harness = new EvalHarness(fixture, agent, conversationId, timeoutMs, systemPrompt.length);

    agent.subscribe((event: AgentEvent) => {
      if (event.type === "tool_execution_start") {
        const entry: CollectedToolCall = { toolName: event.toolName, args: event.args };
        harness.toolCalls.push(entry);
        harness.toolCallMap.set(event.toolCallId, entry);
      }
      if (event.type === "tool_execution_end") {
        const entry = harness.toolCallMap.get(event.toolCallId);
        if (entry) {
          entry.result = event.result;
          entry.isError = event.isError;
        }
      }
      if (event.type === "message_end") {
        const msg = event.message as AssistantMessage;
        if (msg.role === "assistant") {
          for (const block of msg.content) {
            if (block.type === "text" && block.text.trim()) {
              harness.assistantTexts.push(block.text);
            }
          }
          if (msg.usage) {
            harness.tokenStats.totalInputTokens += msg.usage.input;
            harness.tokenStats.totalOutputTokens += msg.usage.output;
            harness.tokenStats.totalCost += msg.usage.cost.total;
            harness.tokenStats.turns++;
          }
        }
      }
    });

    let toolCallCount = 0;
    agent.setAfterToolCall(async () => {
      toolCallCount++;
      if (toolCallCount >= maxToolCalls) {
        return {
          content: [{ type: "text" as const, text: "[Eval] Max tool calls reached." }],
          isError: true,
        };
      }
      return undefined;
    });

    return harness;
  }

  async prompt(message: string): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        this.agent.abort();
        reject(new Error(`Eval timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      await Promise.race([this.agent.prompt(message), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async cleanup(): Promise<void> {
    clearConversationAgentState(this.conversationId);
    await cleanupFixture(this.fixture);
  }

  dumpTokenStats(): void {
    const s = this.tokenStats;
    const total = s.totalInputTokens + s.totalOutputTokens;
    console.log(`\n--- Token Stats ---`);
    console.log(`  System prompt: ${this.systemPromptLength} chars`);
    console.log(`  Turns: ${s.turns}`);
    console.log(`  Input tokens: ${s.totalInputTokens}`);
    console.log(`  Output tokens: ${s.totalOutputTokens}`);
    console.log(`  Total tokens: ${total}`);
    console.log(`  Total cost: $${s.totalCost.toFixed(4)}`);
    console.log(`---\n`);
  }

  dumpAssistantTexts(): void {
    console.log(`\n--- Assistant Texts (${this.assistantTexts.length}) ---`);
    for (const text of this.assistantTexts) {
      const truncated = text.length > 200 ? text.slice(0, 200) + "…" : text;
      console.log(`  ${truncated}`);
    }
    console.log("---\n");
  }

  dumpToolCalls(): void {
    console.log(`\n--- Tool Calls (${this.toolCalls.length}) ---`);
    for (const tc of this.toolCalls) {
      const args = { ...tc.args };
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === "string" && v.length > 100) {
          args[k] = v.slice(0, 100) + "…";
        }
      }
      const status = tc.isError ? " [ERROR]" : "";
      console.log(`  ${tc.toolName}${status}: ${JSON.stringify(args)}`);
    }
    console.log("---\n");
  }
}
