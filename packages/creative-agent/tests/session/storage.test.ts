import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";

import { createSessionStorage } from "../../src/session/index.js";

const dirs: string[] = [];

async function tempProjectsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Pi SessionManager storage", () => {
  test("creates and loads Pi entry state", async () => {
    const storage = createSessionStorage(await tempProjectsDir());
    const session = await storage.createSession("p", "google", "gemini-test", "meta");

    const state = await storage.loadState("p", session.id);

    expect(state?.info.id).toBe(session.id);
    expect(state?.info.mode).toBe("meta");
    expect(state?.entries.map((entry) => entry.type)).toEqual([
      "custom",
      "model_change",
    ]);
    expect(state?.leafId).toBe(state?.entries.at(-1)?.id);
  });

  test("branches by entry id without mutating entries", async () => {
    const storage = createSessionStorage(await tempProjectsDir());
    const session = await storage.createSession("p", "google", "gemini-test");
    const manager = await storage.openManager("p", session.id);
    expect(manager).not.toBeNull();
    if (!manager) return;

    const first = manager.appendMessage({
      role: "user",
      content: "first",
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "first response" }],
      api: "anthropic-messages",
      provider: "google",
      model: "gemini-test",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    await storage.flush(manager);

    const branch = await storage.switchBranch("p", session.id, first);

    expect(branch?.leafId).toBe(first);
    expect(branch?.branch.at(-1)?.id).toBe(first);
    const state = await storage.loadState("p", session.id);
    expect(state?.entries).toHaveLength(3);
  });

  test("flush before first assistant does not duplicate entries when Pi resumes appending", async () => {
    const storage = createSessionStorage(await tempProjectsDir());
    const session = await storage.createSession("p", "google", "gemini-test");
    const manager = await storage.openManager("p", session.id);
    expect(manager).not.toBeNull();
    if (!manager) return;

    manager.appendMessage({
      role: "user",
      content: "first",
      timestamp: Date.now(),
    });
    await storage.flush(manager);
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "first response" }],
      api: "anthropic-messages",
      provider: "google",
      model: "gemini-test",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const state = await storage.loadState("p", session.id);

    expect(state?.entries.map((entry) => entry.type)).toEqual([
      "model_change",
      "message",
      "message",
    ]);
  });
});
