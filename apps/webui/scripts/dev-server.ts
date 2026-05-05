import { resolveDevPorts } from "./dev-ports.js";

process.env.PORT = String(resolveDevPorts().serverPort);

await import("../src/server/index.ts");
