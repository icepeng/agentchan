/**
 * Agent setup and lifecycle management.
 *
 * Exposes the pi-agent-core Agent directly — no intermediate event types.
 * The consumer (webui) subscribes to AgentEvent and maps to its transport (SSE).
 */

import { Agent, type AgentMessage, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, getEnvApiKey, streamSimple, type AssistantMessage, type Message, type ThinkingLevel } from "@mariozechner/pi-ai";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { createProjectTools } from "../tools/index.js";
import { createValidateRendererTool } from "../tools/validate-renderer.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { generateCatalog } from "../skills/catalog.js";
import { createActivateSkillTool } from "../skills/manager.js";
import type { SkillMetadata, SkillEnvironment, SkillRecord } from "../skills/types.js";
import type { SessionMode } from "../conversation/format.js";
import { microCompact, clearCompactState } from "./compact.js";
import type { ResolvedAgentConfig } from "./config.js";
import { analyzeContext } from "./context-analysis.js";
import { createGoogleCacheHook, clearGoogleCache } from "./google-cache.js";
import { formatTokens } from "@agentchan/estimate-tokens";
import * as log from "../logger.js";

// --- Public types ---

export interface CreativeAgentSetup {
  agent: Agent;
  /** Number of pi-ai messages from history (for slicing new messages after prompt). */
  historyLength: number;
  /** The assembled system prompt sent to the model. */
  systemPrompt: string;
}

// --- Constants ---

const DEFAULT_SYSTEM_PROMPT = `You are a creative AI assistant with access to file tools and a skill system. You help users write fiction, design characters, build worlds, and bring creative projects to life. You work within a project directory, using tools to read, write, and organize files.

# Using your tools

- To search file contents by pattern, use grep.
- To run a helper script shipped with a skill (e.g. compile, validate, analyze), use script.

There is no shell tool in this environment. Do not try to call bash, sh, cmd, powershell, cat, sed, find, or echo — those tools do not exist. Use script to execute helper code shipped with a skill.

# Read before you act

Always read relevant files before acting on them. Do not modify, append to, or make decisions based on a file you haven't read in this conversation. When a skill or the user references a file, read it first — then proceed.`;

// --- System prompt composition ---

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Compose the system prompt from up to three layers:
 * [1] DEFAULT_SYSTEM_PROMPT — hardcoded tool rules and base behavior
 * [2] SYSTEM.md content — user-authored project instructions
 * [3] Skill catalog — auto-generated name+description list
 */
function composeSystemPrompt(
  base: string,
  systemMd: string | null,
  catalog: string | null,
): string {
  const layers = [base, systemMd, catalog].filter(
    (s): s is string => s != null && s.trim().length > 0,
  );
  return layers.join("\n\n");
}

// --- Helpers ---

function truncateArgs(args: unknown): string | undefined {
  if (args == null) return undefined;
  const str = typeof args === "string" ? args : JSON.stringify(args);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

function mapThinkingLevel(level?: string): ThinkingLevel | undefined {
  if (!level || level === "off") return undefined;
  return level as ThinkingLevel;
}

export function resolveModel(
  provider: string,
  modelId: string,
  overrides?: { baseUrl?: string; apiFormat?: string },
) {
  // Custom provider with explicit baseUrl/apiFormat: build synthetic model
  if (overrides?.baseUrl && overrides?.apiFormat) {
    return {
      id: modelId,
      name: modelId,
      api: overrides.apiFormat as any,
      provider,
      baseUrl: overrides.baseUrl,
      reasoning: true,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_000,
    };
  }

  try {
    const model = getModel(provider as any, modelId as any);
    if (model) return model;
  } catch {
    // Fall through to synthetic model
  }
  const apiMap: Record<string, string> = {
    anthropic: "anthropic-messages",
    openai: "openai-completions",
    google: "google-generative-ai",
  };
  return {
    id: modelId,
    name: modelId,
    api: (apiMap[provider] ?? "openai-completions") as any,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
  };
}

// --- Skill management ---

/**
 * Tear down per-conversation caches owned by the agent layer. Currently
 * clears only the Google explicit-cache hook, which is keyed by conversationId.
 */
export function clearConversationAgentState(conversationId: string): void {
  clearGoogleCache(conversationId);
  clearCompactState(conversationId);
}

export async function getSkills(projectDir: string): Promise<SkillMetadata[]> {
  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  return [...skills.values()].map((s) => s.meta);
}

// --- Main entry ---

/**
 * Set up a creative agent ready for prompting.
 *
 * Returns the pi-agent-core Agent directly. The caller subscribes to
 * AgentEvent for streaming and calls agent.prompt() to start.
 */
export async function setupCreativeAgent(
  config: ResolvedAgentConfig,
  projectDir: string,
  history: AgentMessage[],
  conversationId: string,
  sessionMode?: SessionMode,
): Promise<CreativeAgentSetup> {
  const allSkills = await discoverProjectSkills(join(projectDir, "skills"));
  const env: SkillEnvironment = sessionMode === "meta" ? "meta" : "creative";

  // Filter skills by environment
  const envSkills = new Map<string, SkillRecord>();
  for (const [name, skill] of allSkills) {
    if ((skill.meta.environment ?? "creative") === env) {
      envSkills.set(name, skill);
    }
  }

  // Build tools
  const tools: any[] = createProjectTools(projectDir);
  if (envSkills.size > 0) tools.push(createActivateSkillTool(envSkills, projectDir));
  if (sessionMode === "meta") tools.push(createValidateRendererTool(projectDir));

  // Compose system prompt: DEFAULT + system file + skill catalog
  const systemFile = sessionMode === "meta" ? "system.meta.md" : "SYSTEM.md";
  const systemMd = await tryReadFile(join(projectDir, systemFile));
  const catalog = generateCatalog([...envSkills.values()]);
  const systemPrompt = composeSystemPrompt(DEFAULT_SYSTEM_PROMPT, systemMd, catalog);

  // History is already AgentMessage[] — pass directly
  const historyLength = history.length;

  // Create Agent
  const thinkingLevel = mapThinkingLevel(config.thinkingLevel);
  const model = resolveModel(config.provider, config.model,
    config.baseUrl ? { baseUrl: config.baseUrl, apiFormat: config.apiFormat } : undefined,
  );
  if (config.contextWindow !== undefined) {
    model.contextWindow = config.contextWindow;
  }

  // Explicit context caching for models that lack implicit caching
  const needsExplicitCache = config.model === "gemini-3.1-pro-preview";
  const googleCacheHook = needsExplicitCache
    ? createGoogleCacheHook(config.apiKey ?? getEnvApiKey("google") ?? "", conversationId)
    : undefined;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      messages: history as Message[],
      thinkingLevel: thinkingLevel ?? ("off" as any),
    },
    convertToLlm: (msgs: AgentMessage[]) => msgs as Message[],
    transformContext: (msgs: AgentMessage[]) =>
      Promise.resolve(microCompact(msgs, {
        conversationId,
        protectFromIndex: historyLength,
      })),
    getApiKey: (provider: string) => config.apiKey ?? getEnvApiKey(provider),
    sessionId: conversationId,
    toolExecution: "parallel",
    steeringMode: "all",
    streamFn: (m, ctx, opts) => {
      const a = analyzeContext(ctx, model.contextWindow);
      const pct = a.contextWindow > 0 ? Math.round((a.total / a.contextWindow) * 100) : 0;
      log.info(
        "context",
        `system ${formatTokens(a.system)} + tools ${formatTokens(a.tools)} + msgs ${formatTokens(a.messages)} = ${formatTokens(a.total)} / ${formatTokens(a.contextWindow)} (${pct}%)`,
      );
      return streamSimple(m, ctx, opts);
    },
    ...(googleCacheHook && { onPayload: googleCacheHook }),
    ...(config.temperature !== undefined && { temperature: config.temperature }),
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
    ...(thinkingLevel && { reasoning: thinkingLevel }),
  });

  log.info(
    "agent",
    `setup: ${config.provider}/${config.model} [${env}], ${envSkills.size} skills, ${tools.length} tools, ${historyLength} history msgs`,
  );

  const toolStartTimes = new Map<string, number>();

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case "tool_execution_start":
        toolStartTimes.set(event.toolCallId, Date.now());
        if (log.isEnabled("debug")) {
          log.debug("agent", `↳ ${event.toolName}`, truncateArgs(event.args));
        }
        break;

      case "tool_execution_end": {
        const started = toolStartTimes.get(event.toolCallId);
        const dur = started
          ? ((Date.now() - started) / 1000).toFixed(1)
          : "?";
        toolStartTimes.delete(event.toolCallId);
        if (event.isError) {
          log.error("agent", `✗ ${event.toolName} (${dur}s)`);
        } else {
          log.info("agent", `✓ ${event.toolName} (${dur}s)`);
        }
        break;
      }

      case "message_end": {
        const msg = event.message as AssistantMessage;
        if (msg.role !== "assistant") break;
        const toolCallCount = msg.content.filter(
          (b) => b.type === "toolCall",
        ).length;
        if (msg.stopReason === "error" || msg.stopReason === "aborted") {
          log.error(
            "agent",
            `llm error: ${msg.stopReason}${msg.errorMessage ? " - " + msg.errorMessage : ""}`,
          );
        } else {
          log.info(
            "agent",
            `llm response: ${msg.stopReason}, ${formatTokens(msg.usage.input)} in + ${formatTokens(msg.usage.output)} out, $${msg.usage.cost.total.toFixed(4)}` +
              (toolCallCount > 0 ? `, ${toolCallCount} tool calls` : ""),
          );
        }
        break;
      }
    }
  });

  return { agent, historyLength, systemPrompt };
}
