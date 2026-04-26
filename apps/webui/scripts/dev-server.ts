import { resolveDevPorts } from "./dev-ports.js";

process.env.PORT = String(resolveDevPorts().serverPort);
process.env.AGENTCHAN_RENDERER_RUNTIME_DIR ??= "renderer-runtime";

await import("../src/server/index.ts");
