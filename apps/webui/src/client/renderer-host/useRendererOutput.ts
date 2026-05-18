import { useCallback, useLayoutEffect, useRef } from "react";
import { useAgentStream } from "@/client/session/index.js";
import { json } from "@/client/platform/index.js";
import { useRendererViewDispatch } from "./RendererViewContext.js";
import type { RendererSnapshot } from "@agentchan/renderer/host";
import type { ProjectFile } from "@agentchan/creative-agent/browser";

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

interface RendererMeta {
  digest: string;
}

function fetchRendererMeta(slug: string): Promise<RendererMeta> {
  return json(`/projects/${encodeURIComponent(slug)}/renderer.meta`, {
    cache: "no-store",
  });
}

function fetchWorkspaceFiles(projectSlug: string): Promise<{ files: ProjectFile[] }> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/workspace/files`);
}

function absoluteBaseUrl(slug: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/projects/${encodeURIComponent(slug)}`;
}

export function useRendererOutput(activeProjectSlug: string | null) {
  const rendererViewDispatch = useRendererViewDispatch();
  const agentState = useAgentStream(activeProjectSlug);
  const activeProjectSlugRef = useRef(activeProjectSlug);
  const stateRef = useRef(agentState);
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
    stateRef.current = agentState;
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

  return { refresh };
}
