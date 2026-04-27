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

  // Create session — body { mode? }
  app.post("/", async (c) => {
    const slug = c.req.param("slug")!;
    const body = await c.req
      .json<{ mode?: "creative" | "meta" }>()
      .catch((): { mode?: "creative" | "meta" } => ({}));
    return c.json(await c.get("sessionService").create(slug, body.mode), 201);
  });

  // Read session — query ?leafId= optional. Returns { info, entries, leafId }.
  app.get("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    const leafIdParam = c.req.query("leafId");
    const leafId = leafIdParam === undefined ? undefined : leafIdParam;
    try {
      const result = await c.get("sessionService").read(slug, id, leafId);
      if (!result) return c.json({ error: "Session not found" }, 404);
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  // Delete session
  app.delete("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    await c.get("sessionService").delete(slug, id);
    return c.json({ ok: true });
  });

  // Rename session — body { leafId, name }. Appends a session_info entry.
  app.post("/:id/rename", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { leafId, name } = await c.req.json<{ leafId: string | null; name: string }>();
    try {
      const entry = await c.get("sessionService").rename(slug, sessionId, leafId, name);
      return c.json({ entry });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  // Send message (SSE stream) — body { leafId, text }
  app.post("/:id/messages", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { leafId, text } = await c.req.json<{ leafId: string | null; text: string }>();
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(stream, slug, sessionId, leafId, text, signal);
    });
  });

  // Regenerate (SSE stream) — body { entryId } pointing at an assistant entry
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { entryId } = await c.req.json<{ entryId: string }>();
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").regenerate(stream, slug, sessionId, entryId, signal);
    });
  });

  // Compact — body { leafId? } — appends a CompactionEntry in-file
  app.post("/:id/compact", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const body = await c.req
      .json<{ leafId?: string | null }>()
      .catch((): { leafId?: string | null } => ({}));
    try {
      const result = await c.get("sessionService").compact(slug, sessionId, body.leafId);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
