import { Hono } from "hono";
import { getSkills } from "@agentchan/creative-agent";
import { join } from "node:path";
import { PROJECTS_DIR } from "../paths.js";
import {
  getProjectSkill,
  createProjectSkill,
  updateProjectSkill,
  deleteProjectSkill,
  copySkillToProject,
} from "../services/library.js";

const app = new Hono();

// List project skills
app.get("/", async (c) => {
  const slug = c.req.param("slug")!;
  const skills = await getSkills(join(PROJECTS_DIR, slug));
  return c.json(skills);
});

// Add skill to project (create new or copy from library)
app.post("/", async (c) => {
  const slug = c.req.param("slug")!;
  const body = await c.req.json<{ name?: string; content?: string; fromLibrary?: string }>();

  try {
    if (body.fromLibrary) {
      await copySkillToProject(body.fromLibrary, slug);
    } else if (body.name && typeof body.content === "string") {
      await createProjectSkill(slug, body.name.trim(), body.content);
    } else {
      return c.json({ error: "Provide { name, content } or { fromLibrary }" }, 400);
    }
    return c.json({ ok: true }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add skill";
    return c.json({ error: message }, 400);
  }
});

// Get skill content
app.get("/:name", async (c) => {
  const slug = c.req.param("slug")!;
  const name = c.req.param("name");
  const content = await getProjectSkill(slug, name);
  if (content === null) return c.json({ error: "Skill not found" }, 404);
  return c.json({ content });
});

// Update skill content
app.put("/:name", async (c) => {
  const slug = c.req.param("slug")!;
  const name = c.req.param("name");
  const { content } = await c.req.json<{ content: string }>();
  if (typeof content !== "string") return c.json({ error: "content is required" }, 400);

  try {
    await updateProjectSkill(slug, name, content);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update skill";
    return c.json({ error: message }, 404);
  }
});

// Delete skill
app.delete("/:name", async (c) => {
  const slug = c.req.param("slug")!;
  const name = c.req.param("name");

  try {
    await deleteProjectSkill(slug, name);
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete skill";
    return c.json({ error: message }, 404);
  }
});

export default app;
