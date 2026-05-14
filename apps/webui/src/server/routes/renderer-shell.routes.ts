import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";
import { isDev } from "../paths.js";

/**
 * Routes that serve the static iframe shell, host theme, and bootstrap
 * module. All three are project-independent; per-project renderer.js / .css
 * live under `/api/projects/:slug/...` and are served by `projects.routes`.
 */
export function createRendererShellRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/renderer-shell.html", (c) => {
    const html = c.get("hostShellService").shellHtml(shellHostOrigin(c));
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

function requestOrigin(c: Context<AppEnv>): string {
  return new URL(c.req.url).origin;
}

function shellHostOrigin(c: Context<AppEnv>): string {
  const forwarded = trustedDevForwardedOrigin(c);
  if (forwarded) return forwarded;
  return requestOrigin(c);
}

function trustedDevForwardedOrigin(c: Context<AppEnv>): string | null {
  if (!isDev) return null;
  const host = forwardedHeader(c, "x-forwarded-host");
  if (!host) return null;
  const protocol = forwardedProtocol(c) ?? new URL(c.req.url).protocol;

  try {
    const url = new URL(`${protocol}//${host}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isLocalhost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function forwardedProtocol(c: Context<AppEnv>): "http:" | "https:" | null {
  const proto = forwardedHeader(c, "x-forwarded-proto");
  if (proto === "http" || proto === "https") return `${proto}:`;
  return null;
}

function forwardedHeader(c: Context<AppEnv>, name: string): string | null {
  const raw = c.req.header(name);
  const value = raw?.split(",")[0]?.trim();
  return value || null;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]";
}
