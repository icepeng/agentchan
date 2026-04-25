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

  // Load session tree
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

  // Delete node (and all descendants)
  app.delete("/:id/nodes/:nodeId", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const nodeId = c.req.param("nodeId");

    try {
      const result = await c.get("sessionService").deleteSubtree(slug, sessionId, nodeId);
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  // Send message (SSE stream)
  app.post("/:id/messages", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { parentNodeId, text } =
      await c.req.json<{ parentNodeId: string | null; text: string }>();
    // c.req.raw.signal fires when the underlying HTTP connection drops —
    // e.g. tab close, navigation, explicit fetch abort. We propagate it so
    // pi-agent-core can cancel the in-flight LLM request and stop billing.
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(
        stream, slug, sessionId, parentNodeId, text, signal,
      );
    });
  });

  // Regenerate response (SSE stream)
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const sessionId = c.req.param("id");
    const { userNodeId } = await c.req.json<{ userNodeId: string }>();
    const signal = c.req.raw.signal;

    return streamSSE(c, async (stream) => {
      await c.get("agentService").regenerate(stream, slug, sessionId, userNodeId, signal);
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
    const { nodeId } = await c.req.json<{ nodeId: string }>();

    const result = await c.get("sessionService").switchBranch(slug, sessionId, nodeId);
    if (!result) return c.json({ error: "Node not found" }, 404);
    return c.json(result);
  });

  return app;
}
