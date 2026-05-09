import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Routes that serve the static iframe shell, host theme, and bootstrap
 * module. All three are project-independent; per-project renderer.js / .css
 * live under `/api/projects/:slug/...` and are served by `projects.routes`.
 */
export function createRendererShellRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/renderer-shell.html", (c) => {
    const html = c.get("hostShellService").shellHtml();
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Cache-Control", "public, max-age=0, must-revalidate");
    return c.body(html);
  });

  app.get("/renderer-bootstrap.js", async (c) => {
    const { js, digest } = await c.get("hostShellService").bootstrapJs();
    return immutableAsset(c, js, "application/javascript; charset=utf-8", digest);
  });

  app.get("/host-theme.css", (c) => {
    const { css, digest } = c.get("hostShellService").hostThemeCss();
    return immutableAsset(c, css, "text/css; charset=utf-8", digest);
  });

  return app;
}

function immutableAsset(
  c: Context<AppEnv>,
  body: string,
  contentType: string,
  digest: string,
): Response {
  const requested = c.req.query("v");
  const ifNoneMatch = c.req.header("if-none-match");
  const etag = `"${digest}"`;

  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ETag: etag,
    "Cache-Control":
      requested && requested === digest
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
  };
  return new Response(body, { headers });
}
