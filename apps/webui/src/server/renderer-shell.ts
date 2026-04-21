/**
 * `/:slug/renderer/` 엔드포인트가 반환하는 HTML shell.
 *
 * iframe 내부는 이 shell로 부팅하고, `renderer/index.ts`를 `./index.js`로 import해
 * `mount()`를 찾는다. 성공/실패는 postMessage(`renderer:ready` / `renderer:error`)로
 * parent에 통지하며, 이후 host는 `contentWindow.__agentchanBoot(ctx)`로 직접 호출한다.
 *
 * `<base href>`는 iframe 상대 URL 기준점. renderer가 `./lib/idiomorph.js` 같은
 * 상대 import를 써도 `/api/projects/{slug}/renderer/lib/idiomorph.js`로 리졸브된다.
 */
export function rendererShellHtml(slug: string): string {
  const base = `/api/projects/${encodeURIComponent(slug)}/renderer/`;
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${base}">
<style>
  html, body { margin: 0; padding: 0; min-height: 100%; background: transparent; color: inherit; }
  #root { min-height: 100vh; }
</style>
<link rel="stylesheet" href="index.css" onerror="this.remove()">
</head><body>
<div id="root"></div>
<script type="module">
  const token = new URL(location.href).searchParams.get("token") ?? "";
  try {
    const mod = await import("./index.js");
    if (typeof mod.mount !== "function") {
      throw new Error("renderer/index.ts must export mount()");
    }
    window.__agentchanBoot = (ctx) => {
      const el = document.getElementById("root");
      if (!el) throw new Error("#root missing");
      return mod.mount(el, ctx);
    };
    parent.postMessage({ type: "renderer:ready", token }, location.origin);
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    parent.postMessage({ type: "renderer:error", token, message: msg }, location.origin);
  }
</script>
</body></html>`;
}
