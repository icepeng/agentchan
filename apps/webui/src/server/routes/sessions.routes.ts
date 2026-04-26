import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../types.js";

export function createSessionRoutes() {
  const app = new Hono<AppEnv>();

  // List sessions
  app.get("/", async (c) => {
    const slug = c.req.param("slug")!;
    return c.json(await c.get("sessionService").list(slug));
  });

  // Create session
  // Optional body { mode } — client specifies session mode directly.
  app.post("/", async (c) => {
    const slug = c.req.param("slug")!;
    const body = await c.req.json<{ mode?: "meta" }>().catch((): { mode?: "meta" } => ({}));
    return c.json(await c.get("sessionService").create(slug, body.mode), 201);
  });

  // Load session state
  app.get("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    const result = await c.get("sessionService").get(slug, id);
    if (!result) return c.json({ error: "Session not found" }, 404);
    return c.json(result);
  });

  // Delete session
  app.delete("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    await c.get("sessionService").delete(slug, id);
    return c.json({ ok: true });
  });

  // Send message (SSE stream)
  app.post("/:id/messages", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { parentEntryId, text } =
      await c.req.json<{ parentEntryId: string | null; text: string }>();
    // c.req.raw.signal fires when the underlying HTTP connection drops —
    // e.g. tab close, navigation, explicit fetch abort. We propagate it so
    // pi-agent-core can cancel the in-flight LLM request and stop billing.
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(
        stream, slug, sessionId, parentEntryId, text, signal,
      );
    });
  });

  // Regenerate response (SSE stream)
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { userEntryId } = await c.req.json<{ userEntryId: string }>();
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").regenerate(stream, slug, sessionId, userEntryId, signal);
    });
  });

  // Full compact — summarize and continue in new session
  app.post("/:id/compact", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");

    try {
      const result = await c.get("sessionService").compact(slug, sessionId);
      if (!result) return c.json({ error: "Session not found" }, 404);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  // Switch branch
  app.post("/:id/branch", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { entryId } = await c.req.json<{ entryId: string }>();

    const result = await c.get("sessionService").switchBranch(slug, sessionId, entryId);
    if (!result) return c.json({ error: "Entry not found" }, 404);
    return c.json(result);
  });

  return app;
}
