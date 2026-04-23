import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer.tsx by transpiling it and checking the default export shape.

Returns OK on success, or a detailed error message with the failure phase (read / transpile / export).
Runtime execution is not performed here — templates that use React hooks can only be verified in the UI.
Use this after writing or editing renderer.tsx to catch syntax and JSX errors early.`;

export function createValidateRendererTool(
  projectDir: string,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(): Promise<AgentToolResult<void>> {
      const rendererPath = join(projectDir, "renderer.tsx");
      let source: string;
      try {
        source = await readFile(rendererPath, "utf-8");
      } catch {
        return textResult("Error: renderer.tsx not found in project root.");
      }

      const transpiler = new Bun.Transpiler({
        loader: "tsx",
        tsconfig: {
          compilerOptions: {
            jsx: "react",
            jsxFactory: "__rendererJsx.h",
            jsxFragmentFactory: "__rendererJsx.Fragment",
          },
        },
      });
      let js: string;
      try {
        js = transpiler.transformSync(source);
      } catch (e) {
        return textResult(
          `Transpile error:\n${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // Shallow shape check: the transpiled source must expose a default
      // export. We don't actually load the module here because renderers can
      // legally `import { useState } from "react"`, and that import won't
      // resolve from this agent process.
      if (!/\bexport\s+default\b/.test(js)) {
        return textResult(
          "Export error: renderer.tsx must declare `export default` for the React component.",
        );
      }

      return textResult(
        `OK — transpiled ${js.length} chars. Default export detected. Open the project in the UI to verify runtime behavior.`,
      );
    },
  };
}
