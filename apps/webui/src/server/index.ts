import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createCreativeContext, type ResolvedAgentConfig } from "@agentchan/creative-agent";
import { CLIENT_DIR, DATA_DIR, PROJECTS_DIR, LIBRARY_DIR, isDev } from "./paths.js";
import type { AppEnv } from "./types.js";

// --- Repositories ---
import { createSettingsRepo } from "./repositories/settings.repo.js";
import { createProjectRepo } from "./repositories/project.repo.js";
import { createLibraryRepo } from "./repositories/library.repo.js";
import { createProjectSkillRepo } from "./repositories/project-skill.repo.js";

// --- Services ---
import { createConfigService } from "./services/config.service.js";
import { createProjectService } from "./services/project.service.js";
import { createConversationService } from "./services/conversation.service.js";
import { createAgentService } from "./services/agent.service.js";
import { createLibraryService } from "./services/library.service.js";
import { createSkillService } from "./services/skill.service.js";

// --- Routes ---
import { createConfigRoutes } from "./routes/config.routes.js";
import { createProjectRoutes } from "./routes/projects.routes.js";
import { createLibraryRoutes } from "./routes/library.routes.js";

// ===== 1. Repositories =====
const settingsRepo = createSettingsRepo(DATA_DIR);
const projectRepo = createProjectRepo(PROJECTS_DIR);
const libraryRepo = createLibraryRepo(LIBRARY_DIR);
const projectSkillRepo = createProjectSkillRepo(PROJECTS_DIR);

// ===== 2. Services =====
const configService = createConfigService(settingsRepo);
const projectService = createProjectService(projectRepo, PROJECTS_DIR);
const libraryService = createLibraryService(libraryRepo);
const skillService = createSkillService(projectSkillRepo, libraryRepo, PROJECTS_DIR);

// ===== 2b. Creative context (stateless handle) =====
const creativeContext = createCreativeContext({
  projectsDir: PROJECTS_DIR,
  resolveAgentConfig: (): ResolvedAgentConfig => {
    const cfg = configService.getConfig();
    const providerInfo = configService.findProvider(cfg.provider);
    return {
      provider: cfg.provider,
      model: cfg.model,
      apiKey: configService.getApiKey(cfg.provider) ?? "",
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      contextWindow: cfg.contextWindow,
      thinkingLevel: cfg.thinkingLevel,
      ...(providerInfo?.custom
        ? { baseUrl: providerInfo.custom.url, apiFormat: providerInfo.custom.format }
        : {}),
    };
  },
});
const conversationService = createConversationService(creativeContext);
const agentService = createAgentService(creativeContext);

// ===== 3. Bootstrap =====
await libraryRepo.ensureLibrary();
await projectService.ensureInitialProject();

// ===== 4. Hono App =====
const app = new Hono<AppEnv>();

// Global error handler — log full stack traces to console
app.onError((err, c) => {
  console.error(`[${c.req.method} ${c.req.path}]`, err);
  return c.json({ error: err.message }, 500);
});

// CORS for development (Vite dev server on different port)
app.use("/api/*", cors());

// DI middleware — inject services into Hono context
app.use("/api/*", async (c, next) => {
  c.set("configService", configService);
  c.set("projectService", projectService);
  c.set("conversationService", conversationService);
  c.set("agentService", agentService);
  c.set("libraryService", libraryService);
  c.set("skillService", skillService);
  await next();
});

// ===== 5. Routes =====
app.route("/api/projects", createProjectRoutes());
app.route("/api/config", createConfigRoutes());
app.route("/api/library", createLibraryRoutes());

// Serve static files in production
if (existsSync(CLIENT_DIR)) {
  app.use("/*", serveStatic({ root: CLIENT_DIR }));
  // SPA fallback
  app.get("*", serveStatic({ path: join(CLIENT_DIR, "index.html") }));
}

// ===== 6. Start Server =====
const port = Number(process.env.PORT ?? 3000);

const url = `http://localhost:${port}`;

Bun.serve({
  port,
  fetch: app.fetch,
  idleTimeout: 255, // seconds — SSE streams can be long-lived during agent tool execution
});

console.log(`agentchan webui server running on ${url}`);

if (!isDev) {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
}
