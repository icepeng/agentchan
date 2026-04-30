import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";
import { isInside } from "../policy.js";

export function createRendererSourcePlugin(rendererDir: string): BunPlugin {
  const rendererRoot = resolve(rendererDir);
  return {
    name: "agentchan-renderer-source",
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const sourcePath = resolve(args.path);
        if (!isInside(rendererRoot, sourcePath)) return undefined;
        const source = await readFile(sourcePath, "utf-8");
        const pragma = "/** @jsxImportSource react */";
        return {
          contents: source.includes("@jsxImportSource")
            ? source
            : `${pragma}\n${source}`,
          loader: "tsx",
        };
      });
    },
  };
}
