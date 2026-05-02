import { describe, test, expect } from "bun:test";
import type { AgentchanSessionInfo } from "@agentchan/creative-agent";
import { pickDefaultCreativeSessionId } from "@/client/entities/session/session.selectors.js";

function info(
  id: string,
  mode: "creative" | "meta",
  modifiedMs = 0,
): AgentchanSessionInfo {
  return {
    path: `/tmp/${id}.jsonl`,
    id,
    cwd: "",
    created: new Date(modifiedMs),
    modified: new Date(modifiedMs),
    messageCount: 0,
    firstMessage: "",
    allMessagesText: "",
    mode,
    title: id,
  };
}

describe("pickDefaultCreativeSessionId", () => {
  test("returns null for an empty list", () => {
    expect(pickDefaultCreativeSessionId([])).toBeNull();
  });

  test("returns null when only meta sessions are present", () => {
    expect(
      pickDefaultCreativeSessionId([info("m1", "meta", 2), info("m2", "meta", 1)]),
    ).toBeNull();
  });

  test("returns the only creative session", () => {
    expect(pickDefaultCreativeSessionId([info("c1", "creative", 1)])).toBe("c1");
  });

  test("returns the first creative — server sorts modified desc", () => {
    expect(
      pickDefaultCreativeSessionId([
        info("c2", "creative", 3),
        info("c1", "creative", 2),
      ]),
    ).toBe("c2");
  });

  test("skips a meta session that sits ahead of creative sessions", () => {
    expect(
      pickDefaultCreativeSessionId([
        info("m1", "meta", 5),
        info("c2", "creative", 4),
        info("c1", "creative", 1),
      ]),
    ).toBe("c2");
  });

  test("does not pick meta when no creative session exists", () => {
    expect(
      pickDefaultCreativeSessionId([info("m1", "meta", 1)]),
    ).toBeNull();
  });
});
