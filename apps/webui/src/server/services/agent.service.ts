import {
  type AgentContext,
  type SessionEvent,
  runPrompt,
  runRegenerate,
} from "@agentchan/creative-agent";
import type { StateService } from "./state.service.js";

/**
 * Wires pi SessionEvent stream into `state.service` so every AgentState
 * mutation lives in one place. The host HTTP endpoint that triggers
 * send/regenerate is fire-and-triggered — the request body is small and the
 * response returns once the agent loop finishes (or the client aborts).
 *
 * Tool results and assistant nodes are persisted by pi-agent-core itself via
 * the `assistant_nodes` event (handled by storage, not state.service).
 */
export function createAgentService(
  ctx: AgentContext,
  stateService: StateService,
  prepareRun: () => Promise<void> = async () => {},
) {
  function dispatchEvent(slug: string, ev: SessionEvent): void {
    switch (ev.type) {
      case "user_node":
        stateService.applyUserNode(slug, ev.node);
        return;
      case "agent_event":
        stateService.applyAgentEvent(slug, ev.event);
        return;
      case "error":
        stateService.applyError(slug, ev.message);
        return;
      case "assistant_nodes":
      case "done":
        return;
    }
  }

  return {
    async sendMessage(
      slug: string,
      sessionId: string,
      parentNodeId: string | null,
      text: string,
      signal?: AbortSignal,
    ): Promise<void> {
      await prepareRun();
      await runPrompt(
        ctx,
        { slug, sessionId, parentNodeId, text },
        (ev) => dispatchEvent(slug, ev),
        signal,
      );
    },

    async regenerate(
      slug: string,
      sessionId: string,
      userNodeId: string,
      signal?: AbortSignal,
    ): Promise<void> {
      await prepareRun();
      await runRegenerate(
        ctx,
        { slug, sessionId, userNodeId },
        (ev) => dispatchEvent(slug, ev),
        signal,
      );
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
