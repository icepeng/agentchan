import { mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Dev/build pre-step. Copies host-owned vendor assets from node_modules into
 * `apps/webui/public/` so the Hono server can serve them (/api/host/lib/*,
 * /api/host/tokens.css etc.) and Vite bundles them into dist/client during
 * build. Keep this idempotent — it runs every `bun run dev`.
 */

const webuiRoot = resolve(import.meta.dir, "..");

interface Copy {
  from: string;
  to: string;
}

const copies: Copy[] = [
  {
    from: join(webuiRoot, "node_modules/idiomorph/dist/idiomorph.esm.js"),
    to: join(webuiRoot, "public/lib/idiomorph.js"),
  },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.warn(`[sync-public-assets] source missing: ${from}`);
    continue;
  }
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  console.log(`[sync-public-assets] ${from} -> ${to}`);
}
