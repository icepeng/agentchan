/**
 * Agent setup and lifecycle management.
 *
 * Exposes the pi-agent-core Agent directly — no intermediate event types.
 * The consumer (webui) subscribes to AgentEvent and maps to its transport (SSE).
 */

import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getEnvApiKey, type Message } from "@mariozechner/pi-ai";
import { convertToLlm } from "./llm-conversion.js";
import type { SkillMetadata } from "../skills/types.js";
import type { SessionMode } from "../session/index.js";
import { microCompact, clearCompactState } from "./compact.js";
import type { ResolvedAgentConfig } from "./config.js";
import { createGoogleCacheHook, clearGoogleCache } from "./google-cache.js";
import { createLoggedStreamFn, subscribeAgentLogging } from "./logging.js";
import { mapThinkingLevel, resolveModel as resolveConfiguredModel } from "./model.js";
import {
  getProjectSkillMetadata,
  getSessionSkillEnvironment,
  loadEnvironmentSkills,
} from "./skill-environment.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { assembleAgentTools } from "./tool-assembly.js";
import * as log from "../logger.js";

export { resolveModel } from "./model.js";

// --- Public types ---

export interface CreativeAgentSetup {
  agent: Agent;
  /** Number of pi-ai messages from history (for slicing new messages after prompt). */
  historyLength: number;
  /** The assembled system prompt sent to the model. */
  systemPrompt: string;
}

// --- Skill management ---

/**
 * Tear down per-session caches owned by the agent layer. Currently
 * clears only the Google explicit-cache hook, which is keyed by sessionId.
 */
export function clearSessionAgentState(sessionId: string): void {
  clearGoogleCache(sessionId);
  clearCompactState(sessionId);
}

export async function getSkills(projectDir: string): Promise<SkillMetadata[]> {
  return getProjectSkillMetadata(projectDir);
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
  sessionId: string,
  sessionMode?: SessionMode,
): Promise<CreativeAgentSetup> {
  const env = getSessionSkillEnvironment(sessionMode);
  const envSkills = await loadEnvironmentSkills(projectDir, env);
  const tools = assembleAgentTools(projectDir, envSkills);
  const systemPrompt = await buildSystemPrompt(projectDir, envSkills, sessionMode);

  // History is already AgentMessage[] — pass directly
  const historyLength = history.length;

  // Create Agent
  const thinkingLevel = mapThinkingLevel(config.thinkingLevel);
  const model = resolveConfiguredModel(config.provider, config.model,
    config.baseUrl ? { baseUrl: config.baseUrl, apiFormat: config.apiFormat } : undefined,
  );
  if (config.contextWindow !== undefined) {
    model.contextWindow = config.contextWindow;
  }

  // Explicit context caching for models that lack implicit caching
  const needsExplicitCache = config.model === "gemini-3.1-pro-preview";
  const googleCacheHook = needsExplicitCache
    ? createGoogleCacheHook(config.apiKey ?? getEnvApiKey("google") ?? "", sessionId)
    : undefined;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      messages: history as Message[],
      thinkingLevel: thinkingLevel ?? ("off" as any),
    },
    convertToLlm,
    transformContext: (msgs: AgentMessage[]) =>
      Promise.resolve(microCompact(msgs, {
        sessionId,
        protectFromIndex: historyLength,
      })),
    getApiKey: (provider: string) => config.apiKey ?? getEnvApiKey(provider),
    sessionId,
    toolExecution: "parallel",
    steeringMode: "all",
    streamFn: createLoggedStreamFn(model),
    ...(googleCacheHook && { onPayload: googleCacheHook }),
    ...(config.temperature !== undefined && { temperature: config.temperature }),
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
    ...(thinkingLevel && { reasoning: thinkingLevel }),
  });

  log.info(
    "agent",
    `setup: ${config.provider}/${config.model} [${env}], ${envSkills.size} skills, ${tools.length} tools, ${historyLength} history msgs`,
  );

  subscribeAgentLogging(agent);

  return { agent, historyLength, systemPrompt };
}
