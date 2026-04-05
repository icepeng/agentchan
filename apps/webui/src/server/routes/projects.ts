import { Hono } from "hono";
import { join, resolve, sep } from "node:path";
import {
  listProjects,
  createProject,
  duplicateProject,
  getProject,
  updateProject,
  deleteProject,
  readOutputFiles,
} from "../services/storage.js";
import { transpileRenderer, readRendererSource, writeRendererSource } from "../services/renderer.js";
import { PROJECTS_DIR } from "../paths.js";
import conversationsRoutes from "./conversations.js";
import skillsRoutes from "./skills.js";

const app = new Hono();

// List projects
app.get("/", async (c) => {
  const projects = await listProjects();
  return c.json(projects);
});

// Create project
app.post("/", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
  const project = await createProject(name.trim());
  return c.json(project, 201);
});

// Update project (rename, outputDir, notes)
app.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{
    name?: string;
    outputDir?: string;
    notes?: string;
  }>();

  const existing = await getProject(slug);
  if (!existing) return c.json({ error: "Project not found" }, 404);

  const updates: { name?: string; outputDir?: string; notes?: string } = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.outputDir !== undefined) {
    if (body.outputDir && (body.outputDir.includes("..") || body.outputDir.includes("\\") || body.outputDir.startsWith("/"))) {
      return c.json({ error: "Invalid outputDir" }, 400);
    }
    updates.outputDir = body.outputDir;
  }
  if (body.notes !== undefined) updates.notes = body.notes;

  const updated = await updateProject(slug, updates);
  return c.json(updated);
});

// Delete project
app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const existing = await getProject(slug);
  if (!existing) return c.json({ error: "Project not found" }, 404);

  try {
    await deleteProject(slug);
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
    const project = await duplicateProject(slug, name.trim());
    return c.json(project, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to duplicate project";
    return c.json({ error: message }, 400);
  }
});

// Serve raw output files for client-side rendering
app.get("/:slug/output/files", async (c) => {
  const slug = c.req.param("slug");
  const existing = await getProject(slug);
  if (!existing) return c.json({ error: "Project not found" }, 404);

  const outputDir = existing.outputDir || "output";
  const files = await readOutputFiles(slug, outputDir);
  return c.json({ files });
});

// Serve transpiled renderer as JS module for client-side execution
app.get("/:slug/renderer.js", async (c) => {
  const slug = c.req.param("slug");
  const js = await transpileRenderer(slug);
  if (js === null) return c.json({ error: "renderer.ts not found" }, 404);
  return c.json({ js });
});

// Serve static files from project directory (with extensionless image fallback)
const IMAGE_EXTS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif"];

app.get("/:slug/files/:path{.+}", async (c) => {
  const slug = c.req.param("slug");
  const filePath = c.req.param("path");
  if (!filePath) return c.json({ error: "Invalid path" }, 400);

  const projectsBase = resolve(PROJECTS_DIR);
  const fullPath = resolve(PROJECTS_DIR, slug, filePath);
  if (!fullPath.startsWith(projectsBase + sep)) {
    return c.json({ error: "Invalid path" }, 400);
  }

  // Exact match
  const file = Bun.file(fullPath);
  if (await file.exists()) return new Response(file);

  // Extensionless fallback: probe image extensions
  for (const ext of IMAGE_EXTS) {
    const probe = Bun.file(`${fullPath}.${ext}`);
    if (await probe.exists()) {
      c.header("Cache-Control", "public, max-age=3600");
      return new Response(probe);
    }
  }

  return c.json({ error: "File not found" }, 404);
});

// Read renderer source
app.get("/:slug/renderer", async (c) => {
  const slug = c.req.param("slug");
  const source = await readRendererSource(slug);
  if (source === null) return c.json({ error: "renderer.ts not found" }, 404);
  return c.json({ source });
});

// Write renderer source
app.put("/:slug/renderer", async (c) => {
  const slug = c.req.param("slug");
  const existing = await getProject(slug);
  if (!existing) return c.json({ error: "Project not found" }, 404);

  const { source } = await c.req.json<{ source: string }>();
  if (typeof source !== "string") return c.json({ error: "source is required" }, 400);

  await writeRendererSource(slug, source);
  return c.json({ ok: true });
});

// Nested routes under /api/projects/:slug/...
app.route("/:slug/conversations", conversationsRoutes);
app.route("/:slug/skills", skillsRoutes);

export default app;
