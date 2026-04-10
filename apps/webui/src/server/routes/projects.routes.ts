import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createConversationRoutes } from "./conversations.routes.js";
import { createSkillRoutes } from "./skills.routes.js";

const IMAGE_EXTS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif"];

export function createProjectRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    return c.json(await c.get("projectService").list());
  });

  app.post("/", async (c) => {
    const { name } = await c.req.json<{ name: string }>();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
    return c.json(await c.get("projectService").create(name.trim()), 201);
  });

  app.put("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json<{ name?: string; notes?: string }>();

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const updates: { name?: string; notes?: string } = {};
    if (body.name?.trim()) updates.name = body.name.trim();
    if (body.notes !== undefined) updates.notes = body.notes;

    const updated = await c.get("projectService").update(slug, updates);
    return c.json(updated);
  });

  app.delete("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    try {
      await c.get("projectService").delete(slug);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete project";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/:slug/duplicate", async (c) => {
    const slug = c.req.param("slug");
    const { name } = await c.req.json<{ name: string }>();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

    try {
      const project = await c.get("projectService").duplicate(slug, name.trim());
      return c.json(project, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to duplicate project";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/:slug/workspace/files", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const files = await c.get("projectService").scanWorkspaceFiles(slug);
    return c.json({ files });
  });

  app.get("/:slug/renderer.js", async (c) => {
    const slug = c.req.param("slug");
    const js = await c.get("projectService").transpileRenderer(slug);
    if (js === null) return c.json({ error: "renderer.ts not found" }, 404);
    return c.json({ js });
  });

  // Static file serving from files/ workspace with extensionless image fallback
  app.get("/:slug/files/:path{.+}", async (c) => {
    const slug = c.req.param("slug");
    const filePath = c.req.param("path");
    if (!filePath) return c.json({ error: "Invalid path" }, 400);

    const resolved = c.get("projectService").serveWorkspaceFile(slug, filePath);
    if (!resolved) return c.json({ error: "Invalid path" }, 400);

    const file = Bun.file(resolved.fullPath);
    if (await file.exists()) return new Response(file);

    for (const ext of IMAGE_EXTS) {
      const probe = Bun.file(`${resolved.fullPath}.${ext}`);
      if (await probe.exists()) {
        c.header("Cache-Control", "public, max-age=3600");
        return new Response(probe);
      }
    }

    return c.json({ error: "File not found" }, 404);
  });

  app.get("/:slug/renderer", async (c) => {
    const slug = c.req.param("slug");
    const source = await c.get("projectService").readRendererSource(slug);
    if (source === null) return c.json({ error: "renderer.ts not found" }, 404);
    return c.json({ source });
  });

  app.put("/:slug/renderer", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { source } = await c.req.json<{ source: string }>();
    if (typeof source !== "string") return c.json({ error: "source is required" }, 400);

    await c.get("projectService").writeRendererSource(slug, source);
    return c.json({ ok: true });
  });

  // --- SYSTEM.md ---

  app.get("/:slug/system", async (c) => {
    const slug = c.req.param("slug");
    const content = await c.get("projectService").getSystem(slug);
    if (content === null) return c.json({ content: "" });
    return c.json({ content });
  });

  app.put("/:slug/system", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { content } = await c.req.json<{ content: string }>();
    if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

    await c.get("projectService").saveSystem(slug, content);
    return c.json({ ok: true });
  });

  app.post("/:slug/system/copy-from-library", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { name } = await c.req.json<{ name: string }>();
    if (!name?.trim()) return c.json({ error: "name is required" }, 400);

    const content = await c.get("libraryService").getSystem(name.trim());
    if (content === null) return c.json({ error: "Library system template not found" }, 404);

    await c.get("projectService").saveSystem(slug, content);
    return c.json({ ok: true });
  });

  app.route("/:slug/conversations", createConversationRoutes());
  app.route("/:slug/skills", createSkillRoutes());

  return app;
}
