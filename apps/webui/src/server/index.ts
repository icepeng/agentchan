import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createAgentContext, type ResolvedAgentConfig } from "@agentchan/creative-agent";
import { CLIENT_DIR, DATA_DIR, PROJECTS_DIR, LIBRARY_DIR, isDev } from "./paths.js";
import type { AppEnv } from "./types.js";

// --- Repositories ---
import { createSettingsRepo } from "./repositories/settings.repo.js";
import { createProjectRepo } from "./repositories/project.repo.js";
import { createTemplateRepo } from "./repositories/template.repo.js";
import { createProjectSkillRepo } from "./repositories/project-skill.repo.js";
import { createUpdateRepo } from "./repositories/update.repo.js";

// --- Services ---
import { createConfigService } from "./services/config.service.js";
import { createProjectService } from "./services/project.service.js";
import { createConversationService } from "./services/conversation.service.js";
import { createAgentService } from "./services/agent.service.js";
import { createTemplateService } from "./services/template.service.js";
import { createSkillService } from "./services/skill.service.js";
import { createUpdateService } from "./services/update.service.js";

// --- Routes ---
import { createConfigRoutes } from "./routes/config.routes.js";
import { createProjectRoutes } from "./routes/projects.routes.js";
import { createTemplateRoutes } from "./routes/template.routes.js";
import { createUpdateRoutes } from "./routes/update.routes.js";

// ===== 1. Repositories =====
const settingsRepo = createSettingsRepo(DATA_DIR);
const projectRepo = createProjectRepo(PROJECTS_DIR);
const templateRepo = createTemplateRepo(join(LIBRARY_DIR, "templates"));
const projectSkillRepo = createProjectSkillRepo(PROJECTS_DIR);
const updateRepo = createUpdateRepo();

// ===== 2. Services =====
const configService = createConfigService(settingsRepo);
const templateService = createTemplateService(templateRepo, PROJECTS_DIR);
const projectService = createProjectService(projectRepo, templateRepo, PROJECTS_DIR);
const skillService = createSkillService(projectSkillRepo, PROJECTS_DIR);
const updateService = createUpdateService(updateRepo);

// ===== 2b. Agent context (stateless handle) =====
const agentContext = createAgentContext({
  projectsDir: PROJECTS_DIR,
  resolveAgentConfig: (): ResolvedAgentConfig => {
    const cfg = configService.getConfig();
    const providerInfo = configService.findProvider(cfg.provider);
    const apiKey = configService.getApiKey(cfg.provider) ?? "";
    const oauthBaseUrl = configService.getResolvedBaseUrl(cfg.provider, apiKey);
    return {
      provider: cfg.provider,
      model: cfg.model,
      apiKey,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      contextWindow: cfg.contextWindow,
      thinkingLevel: cfg.thinkingLevel,
      ...(providerInfo?.custom
        ? { baseUrl: providerInfo.custom.url, apiFormat: providerInfo.custom.format }
        : oauthBaseUrl
          ? { baseUrl: oauthBaseUrl }
          : {}),
    };
  },
});
const conversationService = createConversationService(agentContext);
const agentService = createAgentService(agentContext, async () => {
  await configService.ensureOAuthToken(configService.getConfig().provider);
});

// ===== 3. Bootstrap =====
await templateRepo.ensureDir();

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
  c.set("templateService", templateService);
  c.set("skillService", skillService);
  c.set("updateService", updateService);
  await next();
});

// ===== 5. Routes =====
app.route("/api/projects", createProjectRoutes());
app.route("/api/config", createConfigRoutes());
app.route("/api/templates", createTemplateRoutes());
app.route("/api/update", createUpdateRoutes());

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
