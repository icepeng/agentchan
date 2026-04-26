import { join } from "node:path";
import { nanoid } from "nanoid";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import {
  buildSessionContext,
  type SessionEntry,
  type SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import type { SessionMode } from "../session/format.js";
import { setupCreativeAgent } from "./orchestrator.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { type AgentContext, projectDirOf } from "./context.js";
import {
  buildUserEntriesForPrompt,
  joinUserEntryText,
} from "./build.js";

type MessageEntryDraft = Omit<SessionMessageEntry, "parentId">;
type ReadSessionResult = NonNullable<Awaited<ReturnType<AgentContext["storage"]["loadSession"]>>>;

// --- Public types ---

export type SessionEvent =
  | { type: "user_entries"; entries: SessionEntry[] }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "assistant_entries"; entries: SessionEntry[] }
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
    const loaded = await loadFreshSession(ctx, input.slug, input.sessionId, input.leafId);
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const { entries: userEntryDrafts, promptEntry, llmText } = buildUserEntriesForPrompt(
      input.text,
      projectDir,
      skills,
    );

    const userEntries = await ctx.storage.appendEntriesAtLeaf(
      input.slug,
      input.sessionId,
      loaded.leafId,
      userEntryDrafts,
    );
    const persistedPromptEntry = userEntries.find((entry) => entry.id === promptEntry.id);
    if (!persistedPromptEntry) {
      throw new Error("Prompt entry was not persisted");
    }
    emit({ type: "user_entries", entries: userEntries });

    await runAgentTurn({
      ctx,
      slug: input.slug,
      sessionId: input.sessionId,
      projectDir,
      promptParentId: persistedPromptEntry.id,
      historyLeafId: loaded.leafId,
      llmText,
      emit,
      sessionMode: loaded.header?.mode,
      entries: loaded.entries,
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
    const loaded = await loadFreshSession(ctx, input.slug, input.sessionId);

    const userEntry = loaded.entries.find(
      (entry): entry is SessionMessageEntry =>
        entry.id === input.entryId && entry.type === "message" && entry.message.role === "user",
    );
    if (!userEntry) {
      emit({ type: "error", message: "User entry not found" });
      return;
    }
    const userText = joinUserEntryText(userEntry.message);
    if (!userText) {
      emit({ type: "error", message: "No text content in user entry" });
      return;
    }

    await runAgentTurn({
      ctx,
      slug: input.slug,
      sessionId: input.sessionId,
      projectDir,
      promptParentId: input.entryId,
      historyLeafId: userEntry.parentId,
      llmText: userText,
      emit,
      sessionMode: loaded.header?.mode,
      entries: loaded.entries,
      signal,
    });
  });
}

// --- Internals ---

/**
 * Catch any thrown error into an `error` event and always emit `done` so SSE
 * consumers can close the stream cleanly.
 */
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

async function loadFreshSession(
  ctx: AgentContext,
  slug: string,
  sessionId: string,
  leafId?: string | null,
): Promise<ReadSessionResult> {
  const loaded = await ctx.storage.loadSession(slug, sessionId, leafId);
  if (!loaded) {
    throw new Error(`Session not found: ${slug}/${sessionId}`);
  }
  return loaded;
}

interface AgentTurnArgs {
  ctx: AgentContext;
  slug: string;
  sessionId: string;
  projectDir: string;
  promptParentId: string;
  historyLeafId: string | null;
  llmText: string;
  emit: Emit;
  sessionMode?: SessionMode;
  entries: ReadSessionResult["entries"];
  signal?: AbortSignal;
}

async function runAgentTurn(args: AgentTurnArgs): Promise<void> {
  const { ctx, slug, sessionId, projectDir, emit, signal } = args;

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    emit({
      type: "error",
      message: `API key not configured for provider: ${cfg.provider}`,
    });
    return;
  }

  // If the caller already aborted (e.g. client disconnected between session load
  // and agent setup), bail before spending tokens.
  if (signal?.aborted) return;

  const history = buildSessionContext(args.entries, args.historyLeafId).messages;

  const { agent, historyLength } = await setupCreativeAgent(
    cfg,
    projectDir,
    history,
    sessionId,
    args.sessionMode,
  );

  const unsubscribe = agent.subscribe((ev: AgentEvent) => {
    emit({ type: "agent_event", event: ev });
  });

  // Bridge external AbortSignal → pi-agent-core Agent.abort().
  // pi-agent-core manages its own AbortController internally; the only lever
  // we have is calling agent.abort() which cancels the in-flight LLM request.
  const onAbort = () => agent.abort();
  if (signal) {
    if (signal.aborted) {
      // Already aborted before agent.prompt() started.
      unsubscribe();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    await agent.prompt(args.llmText);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }

  // Extract new messages from the agent (skip the echo'd user prompt)
  const newMessages: AgentMessage[] = [];
  const all = agent.state.messages;
  for (let i = historyLength; i < all.length; i++) {
    const msg = all[i];
    if (!msg) continue;
    // Drop the leading user prompt — already persisted before the agent ran.
    if (i === historyLength && msg.role === "user") continue;
    newMessages.push(msg);
  }

  const newEntryDrafts: MessageEntryDraft[] = [];
  for (const msg of newMessages) {
    const entry: MessageEntryDraft = {
      type: "message",
      id: nanoid(12),
      timestamp: new Date().toISOString(),
      message: msg,
    };
    newEntryDrafts.push(entry);
  }

  if (newEntryDrafts.length === 0) {
    emit({ type: "error", message: "No response from model" });
  } else {
    const entries = await ctx.storage.appendEntriesAtLeaf(
      slug,
      sessionId,
      args.promptParentId,
      newEntryDrafts,
    );
    emit({ type: "assistant_entries", entries });
  }
}
