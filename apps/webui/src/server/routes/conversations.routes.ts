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
  // Optional body { mode } — client specifies session mode directly.
  app.post("/", async (c) => {
    const slug = c.req.param("slug")!;
    const body = await c.req.json<{ mode?: "meta" }>().catch(() => ({} as { mode?: "meta" }));
    return c.json(await c.get("conversationService").create(slug, body.mode), 201);
  });

  // Load conversation tree + checkpoint info
  app.get("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    const result = await c.get("conversationService").get(slug, id);
    if (!result) return c.json({ error: "Conversation not found" }, 404);
    const checkpointNodeIds = c.get("conversationService").getCheckpointNodeIds(id);
    return c.json({ ...result, checkpointNodeIds });
  });

  // Delete conversation
  app.delete("/:id", async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id");
    await c.get("conversationService").delete(slug, id);
    return c.json({ ok: true });
  });

  // Delete node (and all descendants), optionally restoring files from checkpoint
  app.delete("/:id/nodes/:nodeId", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const nodeId = c.req.param("nodeId");
    const restoreFiles = c.req.query("restoreFiles") === "true";

    try {
      if (restoreFiles) {
        await c.get("conversationService").restoreCheckpointForNode(slug, conversationId, nodeId);
      }
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

    return streamSSE(c, async (stream) => {
      await c.get("agentService").sendMessage(
        stream, slug, conversationId, parentNodeId, text,
      );
    });
  });

  // Regenerate response (SSE stream), optionally restoring files from checkpoint
  app.post("/:id/regenerate", async (c) => {
    const slug = c.req.param("slug")!;
    const conversationId = c.req.param("id");
    const { userNodeId, restoreFiles } = await c.req.json<{ userNodeId: string; restoreFiles?: boolean }>();

    if (restoreFiles) {
      await c.get("conversationService").restoreCheckpointForRegenerate(slug, conversationId, userNodeId);
    }

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
