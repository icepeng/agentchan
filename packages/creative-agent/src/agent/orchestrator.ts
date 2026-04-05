/**
 * Agent setup and lifecycle management.
 *
 * Exposes the pi-agent-core Agent directly — no intermediate event types.
 * The consumer (webui) subscribes to AgentEvent and maps to its transport (SSE).
 */

import { Agent, type AgentMessage, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, getEnvApiKey, streamSimple, type AssistantMessage, type Message, type ThinkingLevel } from "@mariozechner/pi-ai";
import { join } from "node:path";

import { createProjectTools } from "../tools/index.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { SkillManager } from "../skills/manager.js";
import { generateCatalog } from "../skills/catalog.js";
import { RESTRICTED_TOOLS, collectGrantedRestrictedTools, type SkillMetadata } from "../skills/types.js";
import { storedToPiMessages } from "./convert.js";
import { microCompact, KEEP_RECENT } from "./compact.js";
import { analyzeContext } from "./context-analysis.js";
import { createGoogleCacheHook, clearGoogleCache } from "./google-cache.js";
import { formatTokens } from "@agentchan/estimate-tokens";
import * as log from "../logger.js";
import type { StoredMessage } from "../types.js";

// --- Public types ---

export interface CreativeAgentOptions {
  provider: string;
  model: string;
  projectDir: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: "off" | "low" | "medium" | "high";
}

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

Use dedicated tools instead of bash whenever possible:

- Use read to read file contents — not bash with cat or type
- Use write to create new files, edit to modify existing files, append to add content to the end of a file
- Use grep to search file contents by pattern — not bash with grep or findstr
- Use ls to list directory contents
- Reserve bash for operations that dedicated tools cannot handle: running scripts, executing build commands, or chaining shell operations
- Use activate_skill when a task matches an available skill — skills provide structured workflows for creative tasks

# Read before you act

Always read relevant files before acting on them. Do not modify, append to, or make decisions based on a file you haven't read in this conversation. When a skill or the user references a file, read it first — then proceed.`;

const skillManagers = new Map<string, SkillManager>();

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

export function resolveModel(provider: string, modelId: string) {
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

export function clearSkillManager(conversationId: string): void {
  skillManagers.delete(conversationId);
  clearGoogleCache(conversationId);
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
  options: CreativeAgentOptions,
  history: StoredMessage[],
  conversationId: string,
): Promise<CreativeAgentSetup> {
  // Discover skills
  const skills = await discoverProjectSkills(join(options.projectDir, "skills"));

  let manager = skillManagers.get(conversationId);
  if (!manager) {
    manager = new SkillManager(skills, options.projectDir);
    skillManagers.set(conversationId, manager);
  } else {
    manager.update(skills, options.projectDir);
  }

  // Build tools — restricted tools (e.g. bash) require skill opt-in via allowed-tools
  let tools: any[] = createProjectTools(options.projectDir);
  const granted = collectGrantedRestrictedTools(skills);
  tools = tools.filter((t) => !RESTRICTED_TOOLS.has(t.name) || granted.has(t.name));
  if (skills.size > 0) tools.push(manager.createTool());

  // Build system prompt
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  if (skills.size > 0) {
    systemPrompt += "\n\n" + generateCatalog([...skills.values()]);
  }

  // Convert history
  const piMessages = storedToPiMessages(history);
  const historyLength = piMessages.length;

  // Create Agent
  const thinkingLevel = mapThinkingLevel(options.thinkingLevel);
  const model = resolveModel(options.provider, options.model);
  if (options.contextWindow !== undefined) {
    model.contextWindow = options.contextWindow;
  }

  // Explicit context caching for models that lack implicit caching
  const needsExplicitCache = options.model === "gemini-3.1-pro-preview";
  const googleCacheHook = needsExplicitCache
    ? createGoogleCacheHook(options.apiKey ?? getEnvApiKey("google") ?? "", conversationId)
    : undefined;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      messages: piMessages,
      thinkingLevel: thinkingLevel ?? ("off" as any),
    },
    convertToLlm: (msgs: AgentMessage[]) => msgs as Message[],
    transformContext: (msgs: AgentMessage[]) =>
      Promise.resolve(microCompact(msgs, KEEP_RECENT, historyLength)),
    getApiKey: (provider: string) => options.apiKey ?? getEnvApiKey(provider),
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
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
    ...(thinkingLevel && { reasoning: thinkingLevel }),
  });

  manager.setSteerCallback((msg) => agent.steer(msg));

  log.info(
    "agent",
    `setup: ${options.provider}/${options.model}, ${skills.size} skills, ${tools.length} tools, ${historyLength} history msgs`,
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
