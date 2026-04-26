import { join } from "node:path";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

import { discoverProjectSkills } from "../skills/discovery.js";
import type { ProjectSessionState } from "../types.js";
import { getSessionModeFromEntries } from "../session/metadata.js";
import { type AgentContext, projectDirOf } from "./context.js";
import {
  buildUserMessageForPrompt,
  textFromUserMessage,
} from "./build.js";
import { setupCreativeAgent } from "./orchestrator.js";

export type SessionEvent =
  | { type: "entry"; entry: SessionEntry }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "snapshot"; snapshot: ProjectSessionState }
  | { type: "error"; message: string }
  | { type: "done" };

export type Emit = (ev: SessionEvent) => void;

export interface PromptInput {
  slug: string;
  sessionId: string;
  parentEntryId: string | null;
  text: string;
}

export interface RegenerateInput {
  slug: string;
  sessionId: string;
  userEntryId: string;
}

export function runPrompt(
  ctx: AgentContext,
  input: PromptInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const manager = await ctx.storage.openManager(input.slug, input.sessionId);
    if (!manager) throw new Error(`Session not found: ${input.slug}/${input.sessionId}`);
    if (input.parentEntryId) manager.branch(input.parentEntryId);

    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const { message } = buildUserMessageForPrompt(input.text, projectDir, skills);
    const userEntryId = manager.appendMessage(message);
    await ctx.storage.flush(manager);
    const entry = manager.getEntry(userEntryId);
    if (entry) emit({ type: "entry", entry });

    await runAgentContinuation(ctx, input.slug, manager, emit, signal);
  });
}

export function runRegenerate(
  ctx: AgentContext,
  input: RegenerateInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const manager = await ctx.storage.openManager(input.slug, input.sessionId);
    if (!manager) throw new Error(`Session not found: ${input.slug}/${input.sessionId}`);
    const entry = manager.getEntry(input.userEntryId);
    if (!entry || entry.type !== "message" || entry.message.role !== "user") {
      throw new Error("User entry not found");
    }
    manager.branch(input.userEntryId);
    await runAgentContinuation(ctx, input.slug, manager, emit, signal);
  });
}

async function runWithEnvelope(emit: Emit, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    emit({ type: "done" });
  }
}

async function runAgentContinuation(
  ctx: AgentContext,
  slug: string,
  manager: NonNullable<Awaited<ReturnType<AgentContext["storage"]["openManager"]>>>,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    emit({
      type: "error",
      message: `API key not configured for provider: ${cfg.provider}`,
    });
    return;
  }
  if (signal?.aborted) return;

  const context = manager.buildSessionContext();
  const history = context.messages;
  const sessionMode = getSessionModeFromEntries(manager.getEntries());
  const { agent, historyLength } = await setupCreativeAgent(
    cfg,
    projectDirOf(ctx, slug),
    history,
    manager.getSessionId(),
    sessionMode,
  );

  const unsubscribe = agent.subscribe((event) => emit({ type: "agent_event", event }));
  const onAbort = () => agent.abort();
  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    await agent.continue();
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }

  for (const message of agent.state.messages.slice(historyLength)) {
    if (isPersistableMessage(message)) {
      manager.appendMessage(message);
    }
  }
  const snapshot = ctx.storage.snapshot(manager);
  if (snapshot) emit({ type: "snapshot", snapshot });
}

function isPersistableMessage(message: AgentMessage): message is Message {
  return (
    "role" in message
    && (message.role === "assistant" || message.role === "toolResult")
  );
}

export function textFromUserEntry(entry: SessionEntry): string {
  if (entry.type !== "message" || entry.message.role !== "user") return "";
  return textFromUserMessage(entry.message);
}
