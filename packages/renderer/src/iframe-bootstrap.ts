/// <reference lib="dom" />

/**
 * iframe shell entry. Boots the renderer adapter inside the iframe document:
 *
 * 1. Reads `?slug=` and `?v=` query params and starts the bundle import in
 *    parallel with the host INIT handshake.
 * 2. Validates the INIT postMessage origin, accepts the transferred
 *    MessagePort, and wires up the RPC channel.
 * 3. Buffers AgentEvent + push messages received before MOUNTED ack.
 * 4. After bundle + HYDRATE arrive, mounts the renderer and emits
 *    `host.mounted({ theme })`.
 * 5. Forwards `actions.send`/`actions.fill` calls to the host.
 * 6. Reduces AgentEvents iframe-side via the same canonical `applyAgentEvent`
 *    the host uses; calls `runtime.theme(snapshot)` on every reduce and
 *    pushes through `host.onTheme(theme)` when the result changes.
 */

import { applyAgentEvent } from "@agentchan/creative-agent/browser";
import type {
  AgentEvent,
  AgentState,
} from "@agentchan/creative-agent/browser";
import {
  attachRpc,
  isRendererRuntime,
  RENDERER_INIT_MESSAGE_TYPE,
  type HydratePayload,
  type ProjectFile,
  type RendererActions,
  type RendererHostApi,
  type RendererInitMessage,
  type RendererInstance,
  type RendererRuntime,
  type RendererShellApi,
  type RendererSnapshot,
  type RendererTheme,
} from "./internal.ts";

interface BootstrapOptions {
  rootElementId?: string;
}

interface RendererModule {
  renderer?: unknown;
}

interface ResolvedRuntime {
  runtime: RendererRuntime;
}

interface MountState {
  runtime: RendererRuntime;
  instance: RendererInstance;
  snapshot: RendererSnapshot;
  agentState: AgentState;
  lastThemeIdentity: string;
}

const NULL_THEME_IDENTITY = "null";

function themeIdentity(theme: RendererTheme | null): string {
  if (theme === null) return NULL_THEME_IDENTITY;
  return JSON.stringify({
    base: sortedTokens(theme.base as Record<string, unknown> ?? {}),
    dark: sortedTokens((theme.dark as Record<string, unknown>) ?? {}),
    prefersScheme: theme.prefersScheme ?? null,
  });
}

function sortedTokens(
  tokens: Record<string, unknown>,
): [string, string][] {
  return Object.entries(tokens)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));
}

function evaluateTheme(
  runtime: RendererRuntime,
  snapshot: RendererSnapshot,
): RendererTheme | null {
  if (typeof runtime.theme !== "function") return null;
  try {
    const result = runtime.theme(snapshot);
    return result ?? null;
  } catch (err) {
    console.warn("[renderer.theme] theme function threw", err);
    return null;
  }
}

function toRendererAgentState(
  state: AgentState,
): RendererSnapshot["state"] {
  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    pendingToolCalls: Array.from(state.pendingToolCalls),
    errorMessage: state.errorMessage,
  };
}

function hydratedToAgentState(payload: HydratePayload["state"]): AgentState {
  return {
    messages: payload.messages,
    isStreaming: payload.isStreaming,
    streamingMessage: payload.streamingMessage,
    pendingToolCalls: new Set(payload.pendingToolCalls),
    errorMessage: payload.errorMessage,
  };
}

function applySchemeAttribute(scheme: "light" | "dark"): void {
  document.documentElement.dataset.theme = scheme;
}

export interface IframeBootstrap {
  /** Resolves once the iframe has emitted `host.mounted({ theme })`. */
  ready(): Promise<void>;
}

/**
 * Boot the iframe-side renderer adapter. Idempotent per-document — calling
 * twice from the same shell HTML is a programmer error. Returns immediately;
 * the promise from `ready()` resolves once mount has acknowledged.
 */
export function bootIframeShell(
  options: BootstrapOptions = {},
): IframeBootstrap {
  const params = new URLSearchParams(globalThis.location.search);
  const slug = params.get("slug");
  const version = params.get("v") ?? "";
  if (!slug) {
    throw new Error("[agentchan iframe-bootstrap] missing ?slug=");
  }

  const rootId = options.rootElementId ?? "renderer-root";
  const root = document.getElementById(rootId);
  if (!(root instanceof HTMLElement)) {
    throw new Error(
      `[agentchan iframe-bootstrap] root element #${rootId} not found`,
    );
  }

  // 1. Start the bundle import in parallel with the INIT handshake.
  const bundleSrc = `/api/projects/${encodeURIComponent(slug)}/renderer.js${
    version ? `?v=${encodeURIComponent(version)}` : ""
  }`;
  const cssHref = `/api/projects/${encodeURIComponent(slug)}/renderer.css${
    version ? `?v=${encodeURIComponent(version)}` : ""
  }`;
  attachRendererStylesheet(cssHref);

  const runtimePromise: Promise<ResolvedRuntime> = import(
    /* @vite-ignore */ bundleSrc
  ).then((mod: RendererModule) => {
    if (!isRendererRuntime(mod.renderer)) {
      throw new Error(
        "[agentchan iframe-bootstrap] renderer module did not export a valid runtime",
      );
    }
    return { runtime: mod.renderer };
  });

  let mounted: MountState | null = null;
  let baseUrl: string | null = null;
  let host: RendererHostApi | null = null;
  let pendingHydrate: HydratePayload | null = null;
  type Pending =
    | { kind: "applyEvent"; event: AgentEvent }
    | { kind: "pushFiles"; files: readonly ProjectFile[] };
  const pending: Pending[] = [];

  let readyResolve: (() => void) | null = null;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const actions: RendererActions = {
    send(text) {
      host?.send(text);
    },
    fill(text) {
      host?.fill(text);
    },
  };

  const tryMount = async (): Promise<void> => {
    if (mounted) return;
    if (!pendingHydrate || !host) return;
    let resolved: ResolvedRuntime;
    try {
      resolved = await runtimePromise;
    } catch (err) {
      host.onError(errorMessage(err));
      return;
    }
    if (mounted) return; // race guard

    const hydrate = pendingHydrate;
    pendingHydrate = null;

    const agentState = hydratedToAgentState(hydrate.state);
    const snapshot: RendererSnapshot = {
      slug: hydrate.slug,
      baseUrl: hydrate.baseUrl,
      files: hydrate.files,
      state: toRendererAgentState(agentState),
    };
    baseUrl = hydrate.baseUrl;

    let instance: RendererInstance;
    try {
      instance = resolved.runtime.mount(root, { snapshot, actions });
    } catch (err) {
      host.onError(errorMessage(err));
      return;
    }

    const initialTheme = evaluateTheme(resolved.runtime, snapshot);
    mounted = {
      runtime: resolved.runtime,
      instance,
      snapshot,
      agentState,
      lastThemeIdentity: themeIdentity(initialTheme),
    };

    // Drain pre-MOUNTED queue *before* sending mounted ack so iframe-side
    // state is current the moment the host considers the iframe live.
    for (const item of pending.splice(0)) {
      if (item.kind === "applyEvent") applyEventToMounted(item.event);
      else if (item.kind === "pushFiles") pushFilesToMounted(item.files);
    }

    host.mounted({ theme: initialTheme });
    readyResolve?.();
  };

  const applyEventToMounted = (event: AgentEvent): void => {
    if (!mounted || !host) return;
    const next = applyAgentEvent(mounted.agentState, event);
    if (next === mounted.agentState) return;
    mounted.agentState = next;
    mounted.snapshot = {
      ...mounted.snapshot,
      state: toRendererAgentState(next),
    };
    mounted.instance.update(mounted.snapshot);

    const nextTheme = evaluateTheme(mounted.runtime, mounted.snapshot);
    const nextIdentity = themeIdentity(nextTheme);
    if (nextIdentity !== mounted.lastThemeIdentity) {
      mounted.lastThemeIdentity = nextIdentity;
      host.onTheme(nextTheme);
    }
  };

  const pushFilesToMounted = (files: readonly ProjectFile[]): void => {
    if (!mounted) return;
    mounted.snapshot = { ...mounted.snapshot, files };
    mounted.instance.update(mounted.snapshot);
  };

  const shell: RendererShellApi = {
    hydrate(payload) {
      // hydrate may arrive before the bundle resolves; queue it.
      pendingHydrate = payload;
      baseUrl = payload.baseUrl;
      void tryMount();
    },
    applyEvent(event) {
      if (!mounted) {
        pending.push({ kind: "applyEvent", event });
        return;
      }
      applyEventToMounted(event);
    },
    pushFiles(files) {
      if (!mounted) {
        pending.push({ kind: "pushFiles", files });
        return;
      }
      pushFilesToMounted(files);
    },
    pushScheme(scheme) {
      applySchemeAttribute(scheme);
    },
    unmount() {
      try {
        mounted?.instance.unmount();
      } catch (err) {
        console.warn("[agentchan iframe-bootstrap] unmount threw", err);
      }
      mounted = null;
    },
  };

  const initListener = (event: MessageEvent): void => {
    const data = event.data as RendererInitMessage | null;
    if (!data || data.type !== RENDERER_INIT_MESSAGE_TYPE) return;
    if (typeof data.hostOrigin !== "string") return;
    if (event.origin !== data.hostOrigin) {
      console.warn(
        "[agentchan iframe-bootstrap] INIT origin mismatch",
        event.origin,
        data.hostOrigin,
      );
      return;
    }
    const port = event.ports[0];
    if (!(port instanceof MessagePort)) return;
    globalThis.removeEventListener("message", initListener);

    applySchemeAttribute(data.scheme);
    host = attachRpc<RendererShellApi, RendererHostApi>(port, shell);
    void tryMount();
  };

  globalThis.addEventListener("message", initListener);

  return {
    ready: () => readyPromise,
  };

  function attachRendererStylesheet(href: string): void {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.agentchanRendererStyle = "";
    document.head.appendChild(link);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
