import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createSessionRoutes } from "./sessions.routes.js";
import { createSkillRoutes } from "./skills.routes.js";

import { IMAGE_EXTS } from "../paths.js";
import { readmeResponse } from "../readme.js";
import { TrustRequiredError } from "../services/template-trust.service.js";

export function createProjectRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    return c.json(await c.get("projectService").list());
  });

  app.post("/", async (c) => {
    const { name, fromTemplate } = await c.req.json<{ name: string; fromTemplate?: string }>();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

    if (fromTemplate) {
      try {
        const project = await c.get("projectService").createFromTemplate(name.trim(), fromTemplate);
        return c.json(project, 201);
      } catch (err: unknown) {
        if (err instanceof TrustRequiredError) {
          return c.json({ error: "trust-required", template: err.template }, 403);
        }
        const message = err instanceof Error ? err.message : "Failed to create from template";
        return c.json({ error: message }, 400);
      }
    }

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

  app.post("/:slug/save-as-template", async (c) => {
    const slug = c.req.param("slug");
    const { name, description, excludeFiles = [], overwrite = false } =
      await c.req.json<{
        name: string;
        description?: string;
        excludeFiles?: string[];
        overwrite?: boolean;
      }>();

    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    try {
      const result = await c.get("templateService").saveProjectAsTemplate(slug, {
        name: name.trim(),
        description: description?.trim(),
        excludeFiles,
        overwrite,
      });
      if (result.conflict) {
        return c.json({ error: "exists" }, 409);
      }
      return c.json({ ok: true }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save as template";
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

  app.get("/:slug/renderer-bundle", async (c) => {
    const slug = c.req.param("slug");
    const bundle = await c.get("projectService").buildRenderer(slug);
    if (bundle === null) {
      return c.json({ error: "renderer/index.tsx not found" }, 404);
    }
    return c.json(bundle);
  });

  app.get("/:slug/cover", async (c) => {
    const slug = c.req.param("slug");
    const file = await c.get("projectService").getCoverFile(slug);
    if (!file) return c.json({ error: "No cover image" }, 404);
    return new Response(file, {
      headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=3600" },
    });
  });

  app.get("/:slug/readme", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);
    const raw = (await c.get("projectService").readProjectFile(slug, "README.md")) ?? "";
    return c.json(readmeResponse(raw));
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

  // --- Project tree (for edit mode) ---

  app.get("/:slug/tree", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const entries = await c.get("projectService").scanProjectTree(slug);
    return c.json({ entries });
  });

  // --- Generic file read/write ---

  app.get("/:slug/file", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    const content = await c.get("projectService").readProjectFile(slug, path);
    if (content === null) return c.json({ error: "File not found" }, 404);
    return c.json({ content });
  });

  app.put("/:slug/file", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { content } = await c.req.json<{ content: string }>();
    if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

    try {
      await c.get("projectService").writeProjectFile(slug, path, content);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to write file";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/:slug/file/reveal", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    try {
      c.get("projectService").revealFileInExplorer(slug, path);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reveal file";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/:slug/file", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    try {
      await c.get("projectService").deleteProjectFile(slug, path);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete file";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/:slug/dir", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    try {
      await c.get("projectService").deleteProjectDir(slug, path);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete directory";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/:slug/file/rename", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { from, to } = await c.req.json<{ from: string; to: string }>();
    if (!from || !to) return c.json({ error: "from and to are required" }, 400);

    try {
      await c.get("projectService").renameProjectEntry(slug, from, to);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to rename";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/:slug/dir", async (c) => {
    const slug = c.req.param("slug");
    const existing = await c.get("projectService").get(slug);
    if (!existing) return c.json({ error: "Project not found" }, 404);

    const { path } = await c.req.json<{ path: string }>();
    if (!path) return c.json({ error: "path is required" }, 400);

    try {
      await c.get("projectService").createProjectDir(slug, path);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create directory";
      return c.json({ error: message }, 400);
    }
  });

  app.route("/:slug/sessions", createSessionRoutes());
  app.route("/:slug/skills", createSkillRoutes());

  return app;
}
