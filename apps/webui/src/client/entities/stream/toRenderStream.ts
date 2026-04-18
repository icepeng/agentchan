import {
  EMPTY_RENDER_STREAM,
  type RenderStreamView,
  type RenderToolCallView,
} from "@/client/entities/renderer/renderer.types.js";
import type { StreamSlot, ToolCallState } from "./stream.types.js";

/**
 * `StreamSlot`(내부 런타임 상태)을 렌더러가 받는 공개 view로 좁힌다.
 *
 * 의도적으로 빠진 필드: `streamError`, `streamUsageDelta`(UI 책임),
 * `ToolCallState.inputJson`/`parallel`(구현 세부). 렌더러가 이것들을 알아야
 * 할 만한 요구가 생기면 여기에 의도적으로 한 줄 더하는 것으로 충분하다 —
 * `StreamSlot`에 새 필드가 생긴다고 자동 노출되지 않는다.
 */
export function toRenderStream(slot: StreamSlot): RenderStreamView {
  if (!slot.isStreaming && slot.streamingToolCalls.length === 0) {
    return EMPTY_RENDER_STREAM;
  }
  return {
    isStreaming: slot.isStreaming,
    text: slot.streamingText,
    toolCalls: slot.streamingToolCalls.map(toRenderToolCall),
  };
}

function toRenderToolCall(tc: ToolCallState): RenderToolCallView {
  const status: RenderToolCallView["status"] = tc.done
    ? "done"
    : tc.executing
      ? "executing"
      : "streaming";
  return { id: tc.id, name: tc.name, status };
}
