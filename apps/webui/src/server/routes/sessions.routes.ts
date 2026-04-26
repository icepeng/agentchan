import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SessionMode } from "@agentchan/creative-agent";
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
    const body = await c.req.json<{ mode?: SessionMode }>().catch((): { mode?: SessionMode } => ({}));
    return c.json(await c.get("sessionService").create(slug, body.mode), 201);
  });

  // Load session entry graph
  app.get("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    const leafId = c.req.query("leafId");
    const result = await c.get("sessionService").get(slug, id, leafId);
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

  // Rename session by appending a Pi-compatible session_info entry.
  app.patch("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { leafId, name } = await c.req.json<{ leafId: string | null; name: string }>();

    const result = await c.get("sessionService").rename(slug, sessionId, leafId, name);
    if (!result) return c.json({ error: "Session not found" }, 404);
    return c.json(result);
  });

  // Send message (SSE stream)
  app.post("/:id/messages", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { leafId, text } =
      await c.req.json<{ leafId: string | null; text: string }>();
    // c.req.raw.signal fires when the underlying HTTP connection drops —
    // e.g. tab close, navigation, explicit fetch abort. We propagate it so
    // pi-agent-core can cancel the in-flight LLM request and stop billing.
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(
        stream, slug, sessionId, leafId, text, signal,
      );
    });
  });

  // Regenerate response (SSE stream)
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { entryId } = await c.req.json<{ entryId: string }>();
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").regenerate(stream, slug, sessionId, entryId, signal);
    });
  });

  // Compact current branch into a same-file compaction entry.
  app.post("/:id/compact", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const body = await c.req.json<{ leafId?: string | null }>().catch(() => ({}));

    try {
      const result = await c.get("sessionService").compact(slug, sessionId, body.leafId);
      if (!result) return c.json({ error: "Session not found" }, 404);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
