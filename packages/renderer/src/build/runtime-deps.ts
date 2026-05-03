import { dirname, join } from "node:path";

export const RENDERER_RUNTIME_DIR_ENV = "AGENTCHAN_RENDERER_RUNTIME_DIR";
export const EXPERIMENTAL_DEPS_ENV = "AGENTCHAN_RENDERER_EXPERIMENTAL_DEPS";

export function experimentalRendererDepsEnabled(): boolean {
  return process.env[EXPERIMENTAL_DEPS_ENV] === "1";
}

export function rendererRuntimeDir(): string {
  return process.env[RENDERER_RUNTIME_DIR_ENV] ??
    join(dirname(process.execPath), "renderer-runtime");
}

export function packageRootName(specifier: string): string | null {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : null;
  }
  return specifier.split("/")[0] ?? null;
}
