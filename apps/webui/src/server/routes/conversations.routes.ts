import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../types.js";

export function createConversationRoutes() {
  const app = new Hono<AppEnv>();

  // List conversations
  app.get("/", async (c) => {
    const slug = c.req.param("slug")!;
    return c.json(await c.get("conversationService").list(slug));
  });

  // Create conversation
  app.post("/", async (c) => {
    const slug = c.req.param("slug")!;
    return c.json(await c.get("conversationService").create(slug), 201);
  });

  // Load conversation tree
  app.get("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    const result = await c.get("conversationService").get(slug, id);
    if (!result) return c.json({ error: "Conversation not found" }, 404);
    return c.json(result);
  });

  // Delete conversation
  app.delete("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    await c.get("conversationService").delete(slug, id);
    return c.json({ ok: true });
  });

  // Delete node (and all descendants)
  app.delete("/:id/nodes/:nodeId", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const nodeId = c.req.param("nodeId");

    try {
      const result = await c.get("conversationService").deleteSubtree(slug, conversationId, nodeId);
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  // Send message (SSE stream)
  app.post("/:id/messages", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const { parentNodeId, text } =
      await c.req.json<{ parentNodeId: string | null; text: string }>();

    const conv = await c.get("conversationService").getConversation(slug, conversationId);
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(stream, slug, conversationId, parentNodeId, text);
    });
  });

  // Regenerate response (SSE stream)
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const { userNodeId } = await c.req.json<{ userNodeId: string }>();

    return streamSSE(c, async (stream) => {
      await c.get("agentService").regenerate(stream, slug, conversationId, userNodeId);
    });
  });

  // Full compact — summarize and continue in new session
  app.post("/:id/compact", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");

    try {
      const result = await c.get("conversationService").compact(slug, conversationId);
      if (!result) return c.json({ error: "Conversation not found" }, 404);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  // Switch branch
  app.post("/:id/branch", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const { nodeId } = await c.req.json<{ nodeId: string }>();

    const result = await c.get("conversationService").switchBranch(slug, conversationId, nodeId);
    if (!result) return c.json({ error: "Node not found" }, 404);
    return c.json(result);
  });

  return app;
}
