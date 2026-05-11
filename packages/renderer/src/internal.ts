/// <reference lib="dom" />

/**
 * Cross-cutting renderer types shared by the author surface (`/react`),
 * the host orchestrator (`/host`), and the iframe shell (`/iframe-bootstrap`).
 * Not a public author API — author code imports from `/react`.
 */

import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { AgentState } from "@agentchan/creative-agent/browser";

export type { AgentEvent, AgentState };
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

export interface RendererSnapshot {
  slug: string;
  baseUrl: string;
  files: readonly ProjectFile[];
  state: AgentState;
}

export interface RendererActions {
  send(text: string): void | Promise<void>;
  fill(text: string): void | Promise<void>;
}

export interface RendererThemeTokens {
  void: string;
  base: string;
  surface: string;
  elevated: string;
  accent: string;
  fg: string;
  fg2: string;
  fg3: string;
  fg4: string;
  edge: string;
}

export interface RendererTheme {
  light?: RendererThemeTokens;
  dark?: RendererThemeTokens;
}

/**
 * Stable string hash of a Project theme for dedupe comparisons. Used by both
 * the iframe shell (to suppress `host.onTheme` emits when `runtime.theme`
 * returns an identity-equal result) and the host presentation machine (to
 * suppress redundant `emitTheme` commands). null theme collapses to a
 * single sentinel so host-default fallback dedupes cleanly.
 */
export function themeIdentity(theme: RendererTheme | null): string {
  if (theme === null) return "null";
  return JSON.stringify({
    light: sortedTokens(theme.light ?? {}),
    dark: sortedTokens(theme.dark ?? {}),
  });
}

function sortedTokens(
  tokens: Partial<RendererThemeTokens>,
): [string, string][] {
  return Object.entries(tokens)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));
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

export interface FileUrlOptions {
  digest?: string;
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
  state: AgentState;
  files: readonly ProjectFile[];
  baseUrl: string;
  slug: string;
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
