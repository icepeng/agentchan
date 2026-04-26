import { resolveDevPorts } from "./dev-ports.js";
import { join } from "node:path";

process.env.PORT = String(resolveDevPorts().serverPort);
process.env.AGENTCHAN_RENDERER_RUNTIME_DIR ??= join(import.meta.dir, "../../../renderer-runtime");

await import("../src/server/index.ts");
