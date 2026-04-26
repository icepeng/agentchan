import { useCallback, useLayoutEffect, useRef } from "react";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import type { AgentState } from "@/client/entities/agent-state/index.js";
import {
  useProjectSelectionState,
  fetchWorkspaceFiles,
  fetchRendererBundle,
} from "@/client/entities/project/index.js";
import { useRendererViewDispatch } from "./RendererViewContext.js";
import type {
  RendererAgentState,
  RendererBundle,
  RendererSnapshot,
  ProjectFile,
} from "./renderer.types.js";

interface LoadedRenderer {
  slug: string;
  bundle: RendererBundle;
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

function sameBundle(a: RendererBundle, b: RendererBundle): boolean {
  if (a.js !== b.js || a.css.length !== b.css.length) return false;
  return a.css.every((css, index) => css === b.css[index]);
}

function toRendererAgentState(state: AgentState): RendererAgentState {
  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    pendingToolCalls: Array.from(state.pendingToolCalls),
    errorMessage: state.errorMessage,
  };
}

export function useRendererOutput() {
  const { activeProjectSlug } = useProjectSelectionState();
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
      const [bundle, filesResult] = await Promise.all([
        fetchRendererBundle(slug),
        fetchWorkspaceFiles(slug),
      ]);
      if (!isStillCurrentRefresh(slug, generation)) return;
      const previousFiles =
        loadedRef.current?.slug === slug ? loadedRef.current.snapshot.files : undefined;
      const files = reuseStableFiles(previousFiles, filesResult.files);
      const snapshot: RendererSnapshot = {
        slug,
        baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
        files,
        state: stateRef.current,
      };
      const previous = loadedRef.current;
      if (previous?.slug === slug && sameBundle(previous.bundle, bundle)) {
        loadedRef.current = { slug, bundle: previous.bundle, snapshot };
        rendererViewDispatch({ type: "SET_SNAPSHOT", snapshot });
      } else {
        loadedRef.current = { slug, bundle, snapshot };
        rendererViewDispatch({ type: "SET_RENDERER", bundle, snapshot });
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
