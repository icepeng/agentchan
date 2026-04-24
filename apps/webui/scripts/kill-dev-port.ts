import { resolve } from "node:path";
import { resolveDevPorts } from "./dev-ports.js";

const role = process.argv[2];
const { serverPort, clientPort } = resolveDevPorts();
const port = role === "client" ? clientPort : serverPort;
const killPortScript = resolve(import.meta.dir, "kill-port.ts");

Bun.spawnSync(["bun", killPortScript, String(port)], {
  stdio: ["ignore", "inherit", "inherit"],
});
