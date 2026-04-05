import { Hono } from "hono";
import {
  listLibrarySkills,
  getLibrarySkill,
  createLibrarySkill,
  updateLibrarySkill,
  deleteLibrarySkill,
  listLibraryRenderers,
  getLibraryRenderer,
  createLibraryRenderer,
  updateLibraryRenderer,
  deleteLibraryRenderer,
} from "../services/library.js";

const app = new Hono();

// --- Skills ---

app.get("/skills", async (c) => {
  const skills = await listLibrarySkills();
  return c.json(skills);
});

app.post("/skills", async (c) => {
  const { name, content } = await c.req.json<{ name: string; content: string }>();
  if (!name?.trim()) return c.json({ error: "name is required" }, 400);
  if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

  try {
    await createLibrarySkill(name.trim(), content);
    return c.json({ ok: true }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create skill";
    return c.json({ error: message }, 400);
  }
});

app.get("/skills/:name", async (c) => {
  const name = c.req.param("name");
  const content = await getLibrarySkill(name);
  if (content === null) return c.json({ error: "Skill not found" }, 404);
  return c.json({ content });
});

app.put("/skills/:name", async (c) => {
  const name = c.req.param("name");
  const { content } = await c.req.json<{ content: string }>();
  if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

  try {
    await updateLibrarySkill(name, content);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update skill";
    return c.json({ error: message }, 404);
  }
});

app.delete("/skills/:name", async (c) => {
  const name = c.req.param("name");
  try {
    await deleteLibrarySkill(name);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete skill";
    return c.json({ error: message }, 404);
  }
});

// --- Renderers ---

app.get("/renderers", async (c) => {
  const renderers = await listLibraryRenderers();
  return c.json(renderers);
});

app.post("/renderers", async (c) => {
  const { name, source } = await c.req.json<{ name: string; source: string }>();
  if (!name?.trim()) return c.json({ error: "name is required" }, 400);
  if (typeof source !== "string") return c.json({ error: "source is required" }, 400);

  try {
    await createLibraryRenderer(name.trim(), source);
    return c.json({ ok: true }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create renderer";
    return c.json({ error: message }, 400);
  }
});

app.get("/renderers/:name", async (c) => {
  const name = c.req.param("name");
  const source = await getLibraryRenderer(name);
  if (source === null) return c.json({ error: "Renderer not found" }, 404);
  return c.json({ source });
});

app.put("/renderers/:name", async (c) => {
  const name = c.req.param("name");
  const { source } = await c.req.json<{ source: string }>();
  if (typeof source !== "string") return c.json({ error: "source is required" }, 400);

  try {
    await updateLibraryRenderer(name, source);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update renderer";
    return c.json({ error: message }, 404);
  }
});

app.delete("/renderers/:name", async (c) => {
  const name = c.req.param("name");
  try {
    await deleteLibraryRenderer(name);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete renderer";
    return c.json({ error: message }, 404);
  }
});

export default app;
