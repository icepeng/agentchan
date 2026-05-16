import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { createAgentContext, type ResolvedAgentConfig } from "@agentchan/creative-agent";
import { CLIENT_DIR, DATA_DIR, PROJECTS_DIR, LIBRARY_DIR, PUBLIC_DIR, isDev } from "./paths.js";
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
import { createSessionService } from "./services/session.service.js";
import { createAgentService } from "./services/agent.service.js";
import { createTemplateService } from "./services/template.service.js";
import { createTemplateTrustService } from "./services/template-trust.service.js";
import { createSkillService } from "./services/skill.service.js";
import { createUpdateService } from "./services/update.service.js";
import { createRendererAssetService } from "./services/renderer-asset.service.js";
import { createHostShellService } from "./services/host-shell.service.js";

// --- Migrations ---
import { migrateConversationsToSessions } from "./migrations/rename-conversations-to-sessions.js";

// --- Routes ---
import { createConfigRoutes } from "./routes/config.routes.js";
import { createProjectRoutes } from "./routes/projects.routes.js";
import { createTemplateRoutes } from "./routes/template.routes.js";
import { createUpdateRoutes } from "./routes/update.routes.js";
import { createRendererShellRoutes } from "./routes/renderer-shell.routes.js";

export async function buildApp(): Promise<Hono<AppEnv>> {
  // ===== 1. Repositories =====
  const settingsRepo = createSettingsRepo(DATA_DIR);
  const projectRepo = createProjectRepo(PROJECTS_DIR);
  const templateRepo = createTemplateRepo(join(LIBRARY_DIR, "templates"));
  const projectSkillRepo = createProjectSkillRepo(PROJECTS_DIR);
  const updateRepo = createUpdateRepo();

  // ===== 2. Services =====
  const configService = createConfigService(settingsRepo);
  const templateTrustService = createTemplateTrustService(settingsRepo);
  const templateService = createTemplateService(templateRepo, templateTrustService, PROJECTS_DIR);
  const projectService = createProjectService(projectRepo, templateRepo, templateTrustService);
  const skillService = createSkillService(projectSkillRepo, PROJECTS_DIR);
  const updateService = createUpdateService(updateRepo);
  const rendererAssetService = createRendererAssetService(PROJECTS_DIR);
  const hostShellService = createHostShellService({ isDev });

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
  const sessionService = createSessionService(agentContext);
  const agentService = createAgentService(agentContext, async () => {
    await configService.ensureOAuthToken(configService.getConfig().provider);
  });

  // ===== 3. Bootstrap =====
  await templateRepo.ensureDir();
  await migrateConversationsToSessions(PROJECTS_DIR);

  // ===== 4. Hono App =====
  const app = new Hono<AppEnv>();

  // Global error handler — log full stack traces to console
  app.onError((err, c) => {
    console.error(`[${c.req.method} ${c.req.path}]`, err);
    return c.json({ error: err.message }, 500);
  });

  // Null-origin renderer iframe asset reads. General /api routes stay same-origin
  // because renderer capabilities cross into the host only through RPC.
  app.use("/api/projects/:slug/renderer.js", cors({ origin: "*" }));
  app.use("/api/projects/:slug/renderer.css", cors({ origin: "*" }));
  app.use("/api/projects/:slug/files/*", cors({ origin: "*" }));
  app.use("/renderer-bootstrap.js", cors({ origin: "*" }));
  app.use("/host-theme.css", cors({ origin: "*" }));
  app.use("/fonts/*", cors({ origin: "*" }));
  app.use("/vendor/*", cors({ origin: "*" }));
  app.use("/fonts/*", serveStatic({ root: PUBLIC_DIR }));

  // DI middleware — inject services into Hono context.
  app.use("*", async (c, next) => {
    c.set("configService", configService);
    c.set("projectService", projectService);
    c.set("sessionService", sessionService);
    c.set("agentService", agentService);
    c.set("templateService", templateService);
    c.set("templateTrustService", templateTrustService);
    c.set("skillService", skillService);
    c.set("updateService", updateService);
    c.set("rendererAssetService", rendererAssetService);
    c.set("hostShellService", hostShellService);
    await next();
  });

  // ===== 5. Routes =====
  app.route("/api/projects", createProjectRoutes());
  app.route("/api/config", createConfigRoutes());
  app.route("/api/templates", createTemplateRoutes());
  app.route("/api/update", createUpdateRoutes());
  app.route("/", createRendererShellRoutes());

  // ===== 6. Static client (production only) =====
  // Dev serves /, /src/*, /vendor/*, /@vite/* etc. through Vite middleware
  // mounted by dev-entry.ts; Hono never sees those requests in dev.
  if (!isDev) {
    app.use("/*", serveStatic({ root: CLIENT_DIR }));
    app.get("*", serveStatic({ path: join(CLIENT_DIR, "index.html") }));
  }

  return app;
}
