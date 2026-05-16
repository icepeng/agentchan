import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { buildApp } from "./app.js";
import { isHonoDevPath } from "./dev-routing.js";

// Single dev process: node:http listens on the portless-assigned PORT, Hono
// handles known paths, everything else routes through Vite's middleware chain
// (transforms, /@vite/client, /vendor/* from public/, SPA index.html fallback).
// Vite + httpServer instances are cached on globalThis so `bun --hot` module
// reloads only swap the request handler — no Vite re-init, no listener churn,
// in-flight SSE streams survive.

type HandlerRef = {
  current: (req: IncomingMessage, res: ServerResponse) => void;
};

type DevGlobals = {
  __agentchanVite?: ViteDevServer;
  __agentchanHttpServer?: Server;
  __agentchanHandler?: HandlerRef;
};

const g = globalThis as unknown as DevGlobals;

const port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3000);
// Derive HMR port from PORT so parallel worktrees (each gets a unique portless
// PORT) don't collide on the default 24678.
const hmrPort = port + 10000;

if (!g.__agentchanVite) {
  g.__agentchanVite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { port: hmrPort },
      watch: { ignored: ["**/data/**", "**/example_data/**"] },
    },
    appType: "spa",
  });
}
const vite = g.__agentchanVite;

const app = await buildApp();
const honoListener = getRequestListener(app.fetch);

const handler = (req: IncomingMessage, res: ServerResponse): void => {
  const url = req.url ?? "";
  if (isHonoDevPath(url)) {
    void honoListener(req, res);
    return;
  }
  vite.middlewares(req, res, () => {
    void honoListener(req, res);
  });
};

if (g.__agentchanHandler) {
  g.__agentchanHandler.current = handler;
} else {
  g.__agentchanHandler = { current: handler };
}
const handlerRef = g.__agentchanHandler;

if (!g.__agentchanHttpServer) {
  g.__agentchanHttpServer = createHttpServer((req, res) => handlerRef.current(req, res));
  g.__agentchanHttpServer.listen(port, () => {
    console.log(`agentchan webui server running on http://localhost:${port}`);
  });
}
