import { buildApp } from "./app.js";
import { isDev } from "./paths.js";

const app = await buildApp();

const port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3000);
const url = `http://localhost:${port}`;

Bun.serve({
  port,
  fetch: app.fetch,
  idleTimeout: 255, // seconds — SSE streams can be long-lived during agent tool execution
});

console.log(`agentchan webui server running on ${url}`);

if (!isDev && !process.env.AGENTCHAN_NO_AUTO_OPEN) {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
}
