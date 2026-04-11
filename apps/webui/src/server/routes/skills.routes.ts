import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export function createSkillRoutes() {
  const app = new Hono<AppEnv>();

  // List project skills
  app.get("/", async (c) => {
    const slug = c.req.param("slug")!;
    return c.json(await c.get("skillService").listProjectSkills(slug));
  });

  // Add skill to project
  app.post("/", async (c) => {
    const slug = c.req.param("slug")!;
    const body = await c.req.json<{ name: string; content: string }>();

    if (!body.name?.trim() || typeof body.content !== "string") {
      return c.json({ error: "name and content are required" }, 400);
    }

    try {
      await c.get("skillService").createProjectSkill(slug, body.name.trim(), body.content);
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
    const content = await c.get("skillService").getProjectSkill(slug, name);
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
      await c.get("skillService").updateProjectSkill(slug, name, content);
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
      await c.get("skillService").deleteProjectSkill(slug, name);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete skill";
      return c.json({ error: message }, 404);
    }
  });

  return app;
}
