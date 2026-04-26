import { expect, test } from "bun:test";
import { reduceAgentStateMap } from "./AgentStateContext.js";
import {
  EMPTY_AGENT_STATE,
  selectCurrentTurnBlocks,
  type AgentState,
} from "./agentState.js";

const projectSlug = "project";

function state(messages: AgentState["messages"]): AgentState {
  return { ...EMPTY_AGENT_STATE, messages };
}

test("BEGIN_TURN with a new user message establishes the current streaming turn", () => {
  const oldToolCall = { type: "toolCall", id: "old-tool", name: "read", arguments: {} } as const;
  const newToolCall = { type: "toolCall", id: "new-tool", name: "write", arguments: {} } as const;
  const previousMessages = [
    { role: "user", content: "previous", timestamp: 1 },
    { role: "assistant", content: [oldToolCall], timestamp: 2 },
  ] as AgentState["messages"];

  let map = new Map([[projectSlug, state(previousMessages)]]);
  map = reduceAgentStateMap(map, {
    type: "BEGIN_TURN",
    projectSlug,
    messages: previousMessages,
    userMessage: { role: "user", content: "next", timestamp: 3 },
  }) as Map<string, AgentState>;

  expect(selectCurrentTurnBlocks(map.get(projectSlug)!)).toEqual([]);

  map = reduceAgentStateMap(map, {
    type: "AGENT_EVENT",
    projectSlug,
    event: {
      type: "message_update",
      message: { role: "assistant", content: [newToolCall], timestamp: 4 },
    },
  } as never) as Map<string, AgentState>;

  expect(selectCurrentTurnBlocks(map.get(projectSlug)!)).toEqual([newToolCall]);
});

test("BEGIN_TURN trims the visible turn to the explicit base messages", () => {
  const oldToolCall = { type: "toolCall", id: "old-tool", name: "read", arguments: {} } as const;
  const previousMessages = [
    { role: "user", content: "previous", timestamp: 1 },
    { role: "assistant", content: [oldToolCall], timestamp: 2 },
  ] as AgentState["messages"];

  const map = reduceAgentStateMap(new Map([[projectSlug, state(previousMessages)]]), {
    type: "BEGIN_TURN",
    projectSlug,
    messages: [],
  }) as Map<string, AgentState>;

  expect(selectCurrentTurnBlocks(map.get(projectSlug)!)).toEqual([]);
});
