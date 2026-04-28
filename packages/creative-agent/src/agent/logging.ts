import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import { streamSimple, type AssistantMessage } from "@mariozechner/pi-ai";
import { estimateJsonTokens, estimateTokens, formatTokens } from "@agentchan/estimate-tokens";

import * as log from "../logger.js";

function truncateArgs(args: unknown): string | undefined {
  if (args == null) return undefined;
  const str = typeof args === "string" ? args : JSON.stringify(args);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

export function createLoggedStreamFn(model: { contextWindow: number }) {
  return (
    m: Parameters<typeof streamSimple>[0],
    ctx: Parameters<typeof streamSimple>[1],
    opts: Parameters<typeof streamSimple>[2],
  ) => {
    const system = ctx.systemPrompt ? estimateTokens(ctx.systemPrompt) : 0;
    const tools = estimateJsonTokens(ctx.tools);
    const messages = estimateJsonTokens(ctx.messages);
    const total = system + tools + messages;
    const contextWindow = model.contextWindow;
    const pct = contextWindow > 0 ? Math.round((total / contextWindow) * 100) : 0;
    log.info(
      "context",
      `system ${formatTokens(system)} + tools ${formatTokens(tools)} + msgs ${formatTokens(messages)} = ${formatTokens(total)} / ${formatTokens(contextWindow)} (${pct}%)`,
    );
    return streamSimple(m, ctx, opts);
  };
}

export function subscribeAgentLogging(agent: Agent): void {
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
}
