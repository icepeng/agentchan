import { join } from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";

import {
  buildSessionContext,
  type DraftEntry,
  type SessionEntry,
  type SessionMode,
} from "../session/index.js";
import { setupCreativeAgent } from "./orchestrator.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { type AgentContext, projectDirOf } from "./context.js";
import {
  buildUserDraftEntries,
  joinUserMessageText,
} from "./build.js";

// --- Public types ---

export type SessionEvent =
  | { type: "entries_persisted"; entries: SessionEntry[] }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "error"; message: string }
  | { type: "done" };

export type Emit = (ev: SessionEvent) => void;

export interface PromptInput {
  slug: string;
  sessionId: string;
  leafId: string | null;
  text: string;
}

export interface RegenerateInput {
  slug: string;
  sessionId: string;
  /** Assistant entry id whose response should be regenerated. */
  entryId: string;
}

// --- Public entry points ---

export function runPrompt(
  ctx: AgentContext,
  input: PromptInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const data = await ctx.storage.readSession(input.slug, input.sessionId, input.leafId);
    if (!data) throw new Error(`Session not found: ${input.slug}/${input.sessionId}`);
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const { drafts, llmText } = buildUserDraftEntries(input.text, projectDir, skills);

    const userEntries = await ctx.storage.appendAtLeaf(
      input.slug,
      input.sessionId,
      data.leafId,
      drafts,
    );
    emit({ type: "entries_persisted", entries: userEntries });

    const history = buildSessionContext(data.entries, data.leafId ?? undefined).messages;
    const lastUserId = userEntries[userEntries.length - 1]!.id;

    await runAgentTurn({
      ctx,
      slug: input.slug,
      sessionId: input.sessionId,
      projectDir,
      currentLeafId: lastUserId,
      llmText,
      history,
      sessionMode: data.info.mode,
      emit,
      signal,
    });
  });
}

export function runRegenerate(
  ctx: AgentContext,
  input: RegenerateInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const data = await ctx.storage.readSession(input.slug, input.sessionId);
    if (!data) throw new Error(`Session not found: ${input.slug}/${input.sessionId}`);

    const target = data.entries.find((e) => e.id === input.entryId);
    if (!target) {
      emit({ type: "error", message: "Entry not found" });
      return;
    }
    if (target.type !== "message" || (target.message as Message).role !== "assistant") {
      emit({ type: "error", message: "Regenerate target must be an assistant message" });
      return;
    }

    const parent = target.parentId
      ? data.entries.find((e) => e.id === target.parentId)
      : undefined;
    if (!parent) {
      emit({ type: "error", message: "Cannot regenerate without a user message parent" });
      return;
    }
    if (parent.type !== "message" || (parent.message as Message).role !== "user") {
      emit({ type: "error", message: "Assistant entry parent must be a user message" });
      return;
    }

    const userText = joinUserMessageText(parent.message as Message);
    if (!userText) {
      emit({ type: "error", message: "No text content in parent user message" });
      return;
    }

    // History: pre-existing branch up to (but not including) the parent user.
    // agent.prompt(userText) re-appends the parent user message, then LLM runs.
    const history = buildSessionContext(data.entries, parent.parentId ?? undefined).messages;

    await runAgentTurn({
      ctx,
      slug: input.slug,
      sessionId: input.sessionId,
      projectDir,
      currentLeafId: parent.id,
      llmText: userText,
      history,
      sessionMode: data.info.mode,
      emit,
      signal,
    });
  });
}

// --- Internals ---

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

interface AgentTurnArgs {
  ctx: AgentContext;
  slug: string;
  sessionId: string;
  projectDir: string;
  currentLeafId: string;
  llmText: string;
  history: AgentMessage[];
  sessionMode: SessionMode;
  emit: Emit;
  signal?: AbortSignal;
}

async function runAgentTurn(args: AgentTurnArgs): Promise<void> {
  const { ctx, slug, sessionId, projectDir, currentLeafId, llmText, history, sessionMode, emit, signal } = args;

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    emit({
      type: "error",
      message: `API key not configured for provider: ${cfg.provider}`,
    });
    return;
  }
  if (signal?.aborted) return;

  const { agent, historyLength } = await setupCreativeAgent(
    cfg,
    projectDir,
    history,
    sessionId,
    sessionMode,
  );

  const unsubscribe = agent.subscribe((ev: AgentEvent) => {
    emit({ type: "agent_event", event: ev });
  });

  const onAbort = () => agent.abort();
  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    await agent.prompt(llmText);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }

  // Collect new messages from agent.state, skipping the echo'd user prompt.
  const newMessages: AgentMessage[] = [];
  const all = agent.state.messages;
  for (let i = historyLength; i < all.length; i++) {
    const msg = all[i];
    if (!msg) continue;
    if (i === historyLength && (msg as Message).role === "user") continue;
    newMessages.push(msg);
  }

  if (newMessages.length === 0) {
    emit({ type: "error", message: "No response from model" });
    return;
  }

  const drafts: DraftEntry[] = newMessages.map((message) => ({
    type: "message",
    message,
  }));

  const persisted = await ctx.storage.appendAtLeaf(
    slug,
    sessionId,
    currentLeafId,
    drafts,
  );
  emit({ type: "entries_persisted", entries: persisted });
}
