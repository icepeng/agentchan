/// <reference lib="dom" />

/**
 * Cross-cutting renderer types shared by the author surface (`/react`),
 * the host orchestrator (`/host`), and the iframe shell (`/iframe-bootstrap`).
 * Not a public author API — author code imports from `/react`.
 */

import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { AgentMessage, AssistantMessage } from "./messages.ts";

export type { AgentEvent };
export type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  CompactionSummaryMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "./messages.ts";

export interface RendererBundle {
  js: string;
  css: string[];
}

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

// subset of pi-agent-core `AgentState`.
export interface RendererAgentState {
  readonly messages: readonly AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
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

// ---------------------------------------------------------------------------
// iframe ↔ host RPC contract.
// Host transfers a MessageChannel.port2 to the iframe via the INIT message.
// All subsequent traffic is fire-and-forget envelopes over that port.
// `mounted` is the only ack we explicitly wait on (see the wait-for-mounted
// gate in the host presentation lifecycle).
// ---------------------------------------------------------------------------

export interface HydratePayload {
  state: HydratedAgentState;
  files: readonly ProjectFile[];
  baseUrl: string;
  slug: string;
}

export interface HydratedAgentState {
  readonly messages: readonly AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: readonly string[];
  readonly errorMessage?: string;
}

export interface RendererShellApi {
  hydrate(payload: HydratePayload): void;
  applyEvent(event: AgentEvent): void;
  pushFiles(files: readonly ProjectFile[]): void;
  pushScheme(scheme: "light" | "dark"): void;
  unmount(): void;
}

export interface RendererHostApi {
  mounted(payload: { theme: RendererTheme | null }): void;
  send(text: string): void;
  fill(text: string): void;
  onTheme(theme: RendererTheme | null): void;
  onError(message: string): void;
}

export type RendererInitMessage = {
  type: "agentchan:renderer-init";
  hostOrigin: string;
  scheme: "light" | "dark";
};

export const RENDERER_INIT_MESSAGE_TYPE = "agentchan:renderer-init";

interface RpcEnvelope {
  method: string;
  args: unknown[];
}

/**
 * Wires a MessagePort to a local handler implementation and returns a typed
 * proxy that forwards calls to the remote side. fire-and-forget — no
 * Promise plumbing. Method names not present in `handlers` are silently
 * dropped (defensive against version skew).
 */
export function attachRpc<TLocal extends object, TRemote extends object>(
  port: MessagePort,
  handlers: TLocal,
): TRemote {
  port.addEventListener("message", (event) => {
    const data = event.data as RpcEnvelope | null;
    if (!data || typeof data.method !== "string" || !Array.isArray(data.args)) return;
    const handler = (handlers as unknown as Record<string, unknown>)[data.method];
    if (typeof handler !== "function") return;
    try {
      (handler as (...args: unknown[]) => void).apply(handlers, data.args);
    } catch (err) {
      console.error(`[agentchan rpc] handler "${data.method}" threw`, err);
    }
  });
  port.start();

  return new Proxy({} as TRemote, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        port.postMessage({ method: prop, args } satisfies RpcEnvelope);
      };
    },
  });
}
