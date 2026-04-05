import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { CLIENT_DIR, isDev } from "./paths.js";

import { ensureInitialProject } from "./services/storage.js";
import { ensureLibrary } from "./services/library.js";
import projectsRoutes from "./routes/projects.js";
import configRoutes from "./routes/config.js";
import libraryRoutes from "./routes/library.js";

const app = new Hono();

// Global error handler — log full stack traces to console
app.onError((err, c) => {
  console.error(`[${c.req.method} ${c.req.path}]`, err);
  return c.json({ error: err.message }, 500);
});

// CORS for development (Vite dev server on different port)
app.use("/api/*", cors());

// API routes
app.route("/api/projects", projectsRoutes);
app.route("/api/config", configRoutes);
app.route("/api/library", libraryRoutes);

// Serve static files in production
if (existsSync(CLIENT_DIR)) {
  app.use("/*", serveStatic({ root: CLIENT_DIR }));
  // SPA fallback
  app.get("*", serveStatic({ path: join(CLIENT_DIR, "index.html") }));
}

// Initialize agent, projects, and start server
const port = Number(process.env.PORT ?? 3000);

await ensureLibrary();
await ensureInitialProject();

const url = `http://localhost:${port}`;
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

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255, // seconds — SSE streams can be long-lived during agent tool execution
};
