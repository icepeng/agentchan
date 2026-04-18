import {
  EMPTY_RENDER_STREAM,
  type RenderStreamView,
  type RenderToolCallView,
} from "@/client/entities/renderer/renderer.types.js";
import type { StreamSlot, ToolCallState } from "./stream.types.js";

/**
 * `StreamSlot` → `RenderStreamView`. 내부 필드가 렌더러 계약으로 새는 것을
 * 이 함수의 명시적 필드 선택이 막는 단일 경계다. 새 내부 필드는 여기에
 * 한 줄을 추가하지 않는 한 자동 노출되지 않는다.
 */
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
