import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  flattenActivePathToMessages,
  useActiveSessionSelection,
  useSessionData,
} from "@/client/entities/session/index.js";
import {
  selectStreamSlot,
  useStreamState,
} from "@/client/entities/stream/index.js";
import type { AgentState } from "./agentState.js";
import { fromSession } from "./fromSession.js";

/**
 * Active project + session 기준 합성된 `AgentState` 셀렉터.
 *
 * AgentPanel과 Renderer가 동일한 인터페이스(`state: AgentState`)를 소비하도록
 * persisted SWR 데이터와 in-flight StreamSlot을 한 곳에서 합성한다.
 */
export function useActiveAgentState(): AgentState {
  const { activeProjectSlug } = useProjectSelectionState();
  const { openSessionId } = useActiveSessionSelection();
  const streamState = useStreamState();
  const slot = selectStreamSlot(streamState, activeProjectSlug);
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  const messages = data
    ? flattenActivePathToMessages(data.nodes, data.activePath)
    : [];
  return fromSession(slot, messages);
}
