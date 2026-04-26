/// <reference lib="dom" />

export type ProjectFile = TextFile | DataFile | BinaryFile;

export interface BaseProjectFile {
  type: "text" | "data" | "binary";
  path: string;
  modifiedAt: number;
  digest: string;
}

export interface TextFile extends BaseProjectFile {
  type: "text";
  content: string;
  frontmatter: Record<string, unknown> | null;
}

export interface DataFile extends BaseProjectFile {
  type: "data";
  content: string;
  data: unknown;
  format: "yaml" | "json";
}

export interface BinaryFile extends BaseProjectFile {
  type: "binary";
}

export interface RendererAgentState {
  readonly messages: readonly unknown[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: unknown;
  readonly pendingToolCalls: readonly string[];
  readonly errorMessage?: string;
}

export interface RendererSnapshot {
  slug: string;
  baseUrl: string;
  files: readonly ProjectFile[];
  state: RendererAgentState;
}

export interface RendererActions {
  send(text: string): void | Promise<void>;
  fill(text: string): void | Promise<void>;
}

export interface RendererThemeTokens {
  void?: string;
  base?: string;
  surface?: string;
  elevated?: string;
  accent?: string;
  fg?: string;
  fg2?: string;
  fg3?: string;
  edge?: string;
}

export interface RendererTheme {
  base: RendererThemeTokens;
  dark?: Partial<RendererThemeTokens>;
  prefersScheme?: "light" | "dark";
}

export interface RendererBridge {
  snapshot: RendererSnapshot;
  actions: RendererActions;
}

export interface RendererInstance {
  update(snapshot: RendererSnapshot): void;
  unmount(): void;
}

export interface RendererRuntime {
  mount(container: HTMLElement, bridge: RendererBridge): RendererInstance;
  theme?(snapshot: RendererSnapshot): RendererTheme | null;
}

export interface RendererOptions {
  theme?: (snapshot: RendererSnapshot) => RendererTheme | null;
}

export interface DefineRendererContext {
  container: HTMLElement;
  snapshot: RendererSnapshot;
  actions: RendererActions;
}

export type DefineRendererFactory = (
  context: DefineRendererContext,
) => RendererInstance;

export interface FileUrlOptions {
  digest?: string;
}

export function defineRenderer(
  factory: DefineRendererFactory,
  options: RendererOptions = {},
): RendererRuntime {
  return {
    mount(container, bridge) {
      return factory({
        container,
        snapshot: bridge.snapshot,
        actions: bridge.actions,
      });
    },
    theme: options.theme,
  };
}

/** Shape contract for renderer runtime exports. Mirror this guard where package imports would cross build boundaries. */
export function isRendererRuntime(value: unknown): value is RendererRuntime {
  if (typeof value !== "object" || value === null) return false;
  const runtime = value as { mount?: unknown; theme?: unknown };
  return typeof runtime.mount === "function" &&
    (runtime.theme === undefined || typeof runtime.theme === "function");
}

export function fileUrl(
  snapshot: Pick<RendererSnapshot, "baseUrl">,
  fileOrPath: Pick<ProjectFile, "path" | "digest"> | string,
  options: FileUrlOptions = {},
): string {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
  if (!path) {
    throw new Error("fileUrl requires a file path");
  }

  let url = snapshot.baseUrl.replace(/\/$/, "") + "/files/" + encodeFilePath(path);
  const digest = typeof fileOrPath === "string" ? options.digest : fileOrPath?.digest;
  if (digest) url += "?v=" + encodeURIComponent(digest);
  return url;
}

function encodeFilePath(path: string): string {
  return normalizePath(path).split("/").map(encodeURIComponent).join("/");
}

function normalizePath(path: string): string {
  return String(path).replace(/^\/+/, "");
}
