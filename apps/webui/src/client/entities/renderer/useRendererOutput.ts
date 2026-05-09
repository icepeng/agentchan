import { useCallback, useLayoutEffect, useRef } from "react";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import type { AgentState } from "@/client/entities/agent-state/index.js";
import { fetchWorkspaceFiles } from "@/client/entities/project/index.js";
import { json } from "@/client/shared/api.js";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import { useRendererViewDispatch } from "./RendererViewContext.js";
import type { RendererSnapshot } from "@agentchan/renderer/host";
import type {
  RendererAgentState,
  ProjectFile,
} from "./renderer.types.js";

interface LoadedRenderer {
  slug: string;
  digest: string;
  snapshot: RendererSnapshot;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function reuseStableFiles(
  previous: readonly ProjectFile[] | undefined,
  next: ProjectFile[],
): readonly ProjectFile[] {
  if (!previous) return next;
  const previousByPath = new Map(previous.map((file) => [file.path, file]));
  let changed = previous.length !== next.length;
  const files = next.map((file) => {
    const old = previousByPath.get(file.path);
    if (old && old.digest === file.digest && old.modifiedAt === file.modifiedAt) {
      return old;
    }
    changed = true;
    return file;
  });
  return changed ? files : previous;
}

/**
 * Backwards-compat projection: the canonical `AgentState` carries
 * `pendingToolCalls` as a Set, while the legacy renderer surface still types
 * it as `readonly string[]`. Slice 5 removes this — see PRD #176.
 */
export function toRendererAgentState(state: AgentState): RendererAgentState {
  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    pendingToolCalls: Array.from(state.pendingToolCalls),
    errorMessage: state.errorMessage,
  };
}

interface RendererMeta {
  digest: string;
}

function fetchRendererMeta(slug: string): Promise<RendererMeta> {
  return json(`/projects/${encodeURIComponent(slug)}/renderer.meta`, {
    cache: "no-store",
  });
}

function absoluteBaseUrl(slug: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/projects/${encodeURIComponent(slug)}`;
}

export function useRendererOutput() {
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const rendererViewDispatch = useRendererViewDispatch();
  const agentState = useAgentState();
  const activeProjectSlugRef = useRef(activeProjectSlug);
  const currentState = toRendererAgentState(agentState);
  const stateRef = useRef(currentState);
  const loadedRef = useRef<LoadedRenderer | null>(null);
  const refreshGenerationRef = useRef(0);

  useLayoutEffect(() => {
    if (activeProjectSlugRef.current !== activeProjectSlug) {
      loadedRef.current = null;
      if (activeProjectSlug === null) {
        rendererViewDispatch({ type: "CLEAR" });
      }
    }
    activeProjectSlugRef.current = activeProjectSlug;
    stateRef.current = currentState;
  });

  const isStillCurrentRefresh = useCallback(
    (slug: string, generation: number) =>
      activeProjectSlugRef.current === slug &&
      refreshGenerationRef.current === generation,
    [],
  );

  const refresh = useCallback(async () => {
    const slug = activeProjectSlug;
    if (!slug) return;
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;

    try {
      const [meta, filesResult] = await Promise.all([
        fetchRendererMeta(slug),
        fetchWorkspaceFiles(slug),
      ]);
      if (!isStillCurrentRefresh(slug, generation)) return;
      const previousFiles =
        loadedRef.current?.slug === slug ? loadedRef.current.snapshot.files : undefined;
      const files = reuseStableFiles(previousFiles, filesResult.files);
      const snapshot: RendererSnapshot = {
        slug,
        baseUrl: absoluteBaseUrl(slug),
        files,
        state: stateRef.current,
      };
      const previous = loadedRef.current;
      if (previous?.slug === slug && previous.digest === meta.digest) {
        loadedRef.current = { slug, digest: meta.digest, snapshot };
        rendererViewDispatch({ type: "SET_SNAPSHOT", snapshot });
      } else {
        loadedRef.current = { slug, digest: meta.digest, snapshot };
        rendererViewDispatch({
          type: "SET_RENDERER",
          digest: meta.digest,
          snapshot,
        });
      }
    } catch (error: unknown) {
      if (!isStillCurrentRefresh(slug, generation)) return;
      loadedRef.current = null;
      const message = errorMessage(error);
      if (message.includes("404")) {
        rendererViewDispatch({
          type: "SET_ERROR",
          error: "renderer/index.ts or renderer/index.tsx not found",
        });
      } else {
        rendererViewDispatch({ type: "SET_ERROR", error: message });
      }
    }
  }, [activeProjectSlug, isStillCurrentRefresh, rendererViewDispatch]);

  const refreshState = useCallback(() => {
    const slug = activeProjectSlug;
    if (!slug) return;
    const loaded = loadedRef.current;
    if (!loaded || loaded.slug !== slug) return;

    const snapshot: RendererSnapshot = {
      ...loaded.snapshot,
      state: stateRef.current,
    };
    loaded.snapshot = snapshot;
    rendererViewDispatch({ type: "SET_SNAPSHOT", snapshot });
  }, [activeProjectSlug, rendererViewDispatch]);

  return { refresh, refreshState };
}
