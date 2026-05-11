import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/server/types.js";
import { createRendererShellRoutes } from "../../src/server/routes/renderer-shell.routes.js";
import {
  createHostShellService,
  type HostShellService,
} from "../../src/server/services/host-shell.service.js";

/**
 * HTTP smoke test for the static iframe-shell asset routes (#179, ADR-0001).
 * Asserts content-type, ETag, Cache-Control, and 304 conditional handling.
 * The bootstrap route is exercised against a real Bun.build of the renderer
 * package's iframe-bootstrap source so a missing entry breaks CI loudly.
 */

function buildApp(svc: HostShellService) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("hostShellService", svc);
    await next();
  });
  app.route("/", createRendererShellRoutes());
  return app;
}

describe("renderer-shell routes", () => {
  test("/renderer-shell.html returns HTML with importmap + bootstrap script", async () => {
    const svc = createHostShellService({ isDev: true });
    const app = buildApp(svc);
    const res = await app.fetch(new Request("https://h/renderer-shell.html"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain('<script type="importmap">');
    expect(body).toContain('<link rel="stylesheet" href="/host-theme.css">');
    expect(body).toContain('<script type="module" src="/renderer-bootstrap.js"></script>');
    expect(body).toContain('id="renderer-root"');
    expect(body).toContain("var(--agentchan-default-void)");
    expect(body).not.toContain("var(--color-void)");
  });

  test("/host-theme.css emits both [data-theme] blocks with ETag + immutable cache when ?v= matches", async () => {
    const svc = createHostShellService({ isDev: true });
    const app = buildApp(svc);

    const first = await app.fetch(new Request("https://h/host-theme.css"));
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toContain("text/css");
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const css = await first.text();
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("--agentchan-default-void");
    expect(css.match(/--agentchan-default-font-body/g)?.length).toBe(2);
    expect(css.match(/--agentchan-default-font-display/g)?.length).toBe(2);
    expect(css.match(/--agentchan-default-font-mono/g)?.length).toBe(2);
    expect(css).not.toContain("--color-void");
    expect(first.headers.get("Cache-Control")).toContain("must-revalidate");

    const digest = (etag ?? "").replace(/"/g, "");
    const second = await app.fetch(
      new Request(`https://h/host-theme.css?v=${digest}`),
    );
    expect(second.headers.get("Cache-Control")).toContain("immutable");
  });

  test("/host-theme.css honors If-None-Match → 304", async () => {
    const svc = createHostShellService({ isDev: true });
    const app = buildApp(svc);
    const first = await app.fetch(new Request("https://h/host-theme.css"));
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const second = await app.fetch(
      new Request("https://h/host-theme.css", {
        headers: { "if-none-match": etag! },
      }),
    );
    expect(second.status).toBe(304);
  });

  test("/renderer-bootstrap.js bundles iframe-bootstrap and exposes bootIframeShell call", async () => {
    const svc = createHostShellService({ isDev: true });
    const app = buildApp(svc);
    const res = await app.fetch(new Request("https://h/renderer-bootstrap.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/javascript");
    const body = await res.text();
    // The bundle is appended with an auto-boot call so loading the script
    // alone wires up the INIT message listener.
    expect(body).toContain("bootIframeShell()");
    expect(res.headers.get("ETag")).toBeTruthy();
  });
});
