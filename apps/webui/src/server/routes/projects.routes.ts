import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createSessionRoutes } from "./sessions.routes.js";
import { createSkillRoutes } from "./skills.routes.js";

import { readmeResponse } from "../readme.js";
import { TrustRequiredError } from "../services/template-trust.service.js";

const PROJECT_NOT_FOUND = { error: "Project not found" } as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

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

    const updates: { name?: string; notes?: string } = {};
    if (body.name?.trim()) updates.name = body.name.trim();
    if (body.notes !== undefined) updates.notes = body.notes;

    const updated = await c.get("projectService").update(slug, updates);
    if (!updated) return c.json(PROJECT_NOT_FOUND, 404);
    return c.json(updated);
  });

  app.delete("/:slug", async (c) => {
    const slug = c.req.param("slug");

    try {
      const deleted = await c.get("projectService").delete(slug);
      if (!deleted) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to delete project") }, 400);
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
      return c.json({ error: errorMessage(err, "Failed to duplicate project") }, 400);
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

    if (!c.get("projectService").exists(slug)) return c.json(PROJECT_NOT_FOUND, 404);

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
      return c.json({ error: errorMessage(err, "Failed to save as template") }, 400);
    }
  });

  app.get("/:slug/workspace/files", async (c) => {
    const slug = c.req.param("slug");
    const files = await c.get("projectService").scanWorkspaceFiles(slug);
    if (!files) return c.json(PROJECT_NOT_FOUND, 404);
    return c.json({ files });
  });

  app.get("/:slug/renderer-bundle", async (c) => {
    const slug = c.req.param("slug");
    const bundle = await c.get("projectService").buildRenderer(slug);
    if (bundle === null) {
      return c.json({ error: "renderer/index.ts or renderer/index.tsx not found" }, 404);
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
    const raw = await c.get("projectService").getReadme(slug);
    if (raw === null) return c.json(PROJECT_NOT_FOUND, 404);
    return c.json(readmeResponse(raw));
  });

  // Static file serving from files/ workspace with extensionless image fallback
  app.get("/:slug/files/:path{.+}", async (c) => {
    const slug = c.req.param("slug");
    const filePath = c.req.param("path");
    if (!filePath) return c.json({ error: "Invalid path" }, 400);

    const result = await c.get("projectService").serveWorkspaceFile(slug, filePath);
    if (result.status === "invalid-path") return c.json({ error: "Invalid path" }, 400);
    if (result.status === "not-found") return c.json({ error: "File not found" }, 404);
    if (result.cacheControl) c.header("Cache-Control", result.cacheControl);
    return new Response(result.file);
  });

  // --- Project tree (for edit mode) ---

  app.get("/:slug/tree", async (c) => {
    const slug = c.req.param("slug");
    const entries = await c.get("projectService").scanProjectTree(slug);
    if (!entries) return c.json(PROJECT_NOT_FOUND, 404);
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

    const { content } = await c.req.json<{ content: string }>();
    if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

    try {
      const written = await c.get("projectService").writeProjectFile(slug, path, content);
      if (written === false) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to write file") }, 400);
    }
  });

  app.post("/:slug/file/reveal", (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    try {
      const revealed = c.get("projectService").revealFileInExplorer(slug, path);
      if (!revealed) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to reveal file") }, 400);
    }
  });

  app.delete("/:slug/file", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    try {
      const deleted = await c.get("projectService").deleteProjectFile(slug, path);
      if (!deleted) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to delete file") }, 400);
    }
  });

  app.delete("/:slug/dir", async (c) => {
    const slug = c.req.param("slug");
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path query parameter is required" }, 400);

    try {
      const deleted = await c.get("projectService").deleteProjectDir(slug, path);
      if (!deleted) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to delete directory") }, 400);
    }
  });

  app.post("/:slug/file/rename", async (c) => {
    const slug = c.req.param("slug");

    const { from, to } = await c.req.json<{ from: string; to: string }>();
    if (!from || !to) return c.json({ error: "from and to are required" }, 400);

    try {
      const renamed = await c.get("projectService").renameProjectEntry(slug, from, to);
      if (!renamed) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to rename") }, 400);
    }
  });

  app.post("/:slug/dir", async (c) => {
    const slug = c.req.param("slug");

    const { path } = await c.req.json<{ path: string }>();
    if (!path) return c.json({ error: "path is required" }, 400);

    try {
      const created = await c.get("projectService").createProjectDir(slug, path);
      if (!created) return c.json(PROJECT_NOT_FOUND, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err, "Failed to create directory") }, 400);
    }
  });

  app.route("/:slug/sessions", createSessionRoutes());
  app.route("/:slug/skills", createSkillRoutes());

  return app;
}
