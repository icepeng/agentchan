import {
  EMPTY_RENDER_STREAM,
  type RenderStreamView,
  type RenderToolCallView,
} from "@/client/entities/renderer/renderer.types.js";
import type { StreamSlot, ToolCallState } from "./stream.types.js";

/** The sole boundary where internal StreamSlot fields map to the renderer contract. */
export function toRenderStream(slot: StreamSlot): RenderStreamView {
  if (!slot.isStreaming && slot.toolCalls.length === 0) {
    return EMPTY_RENDER_STREAM;
  }
  return {
    isStreaming: slot.isStreaming,
    text: slot.text,
    toolCalls: slot.toolCalls.map(toRenderToolCall),
  };
}

function toRenderToolCall(tc: ToolCallState): RenderToolCallView {
  return {
    id: tc.id,
    name: tc.name,
    argsComplete: tc.argsComplete,
    executionStarted: tc.executionStarted,
    result: tc.result,
  };
}
