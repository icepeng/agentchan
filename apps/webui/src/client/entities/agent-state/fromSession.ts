import type { StreamSlot } from "@/client/entities/stream/index.js";
import type { AgentMessage, AgentState } from "./agentState.js";
import { EMPTY_AGENT_STATE } from "./agentState.js";

/**
 * Compose pi `AgentState` from persisted messages + the in-flight stream slot.
 *
 * `messages`는 persisted activePath + 아직 persist되지 않은 in-flight tool
 * results의 합. agent loop가 turn 끝에만 한꺼번에 `assistant_nodes`를 보내므로,
 * 스트리밍 중에는 toolResult가 SWR 캐시에 없다. stream slot이 그동안 임시로
 * 보관한 `inFlightToolResults`를 messages 끝에 붙여 렌더러가 항상 동일한
 * "현재 화면에 표시할 대화 흐름" 배열을 보게 한다.
 */
export function fromSession(
  slot: StreamSlot,
  persistedMessages: ReadonlyArray<AgentMessage>,
): AgentState {
  // Idle slot + no persisted history → reuse the singleton to keep referential
  // equality stable for SWR/effect deps.
  if (
    !slot.isStreaming &&
    !slot.streamingMessage &&
    !slot.streamError &&
    slot.pendingToolCalls.size === 0 &&
    slot.inFlightToolResults.length === 0 &&
    persistedMessages.length === 0
  ) {
    return EMPTY_AGENT_STATE;
  }

  const messages: AgentMessage[] =
    slot.inFlightToolResults.length > 0
      ? [...persistedMessages, ...slot.inFlightToolResults]
      : (persistedMessages as AgentMessage[]);

  return {
    messages,
    isStreaming: slot.isStreaming,
    streamingMessage: slot.streamingMessage,
    pendingToolCalls: slot.pendingToolCalls,
    errorMessage: slot.streamError ?? undefined,
  };
}
