import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { setupCreativeAgent, clearSessionAgentState } from "../src/agent/orchestrator.js";
import { createAgentContext } from "../src/agent/context.js";
import { createSession } from "../src/agent/lifecycle.js";
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
  /**
   * Copy an entire library/templates/{name}/ directory as the fixture.
   * Mirrors "New project from template". Preferred for new eval tests.
   */
  template?: string;
  skillName?: string;
  skillNames?: string[];
  /** Inline override for SYSTEM.md (wins over template). */
  systemMd?: string;
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
    private sessionId: string,
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
      : [];
    const provider = options.provider ?? process.env.EVAL_PROVIDER ?? "google";
    const model = options.model ?? process.env.EVAL_MODEL ?? "gemini-3-flash-preview";
    const maxToolCalls = options.maxToolCalls ?? 30;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] ?? "";

    const fixture = await createFixture({
      template: options.template,
      skillNames,
      systemMd: options.systemMd,
      prePopulate: options.prePopulate,
    });

    // Drive the production session-bootstrap path. New sessions
    // start empty — SYSTEM.md and skill catalog are in the system prompt.
    const ctx = createAgentContext({
      projectsDir: fixture.projectsDir,
      resolveAgentConfig: () => ({ provider, model, apiKey, temperature: 0 }),
    });
    const created = await createSession(ctx, fixture.slug);
    const sessionId = created.id;
    const history: AgentMessage[] = [];

    const { agent, systemPrompt } = await setupCreativeAgent(
      { provider, model, apiKey, temperature: 0 },
      fixture.projectDir,
      history,
      sessionId,
    );

    const harness = new EvalHarness(fixture, agent, sessionId, timeoutMs, systemPrompt.length);

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
    agent.afterToolCall = async () => {
      toolCallCount++;
      if (toolCallCount >= maxToolCalls) {
        return {
          content: [{ type: "text" as const, text: "[Eval] Max tool calls reached." }],
          isError: true,
        };
      }
      return undefined;
    };

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
    clearSessionAgentState(this.sessionId);
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
