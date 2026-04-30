import type { AgentState } from "@/client/entities/agent-state/index.js";
import type {
  ProjectFile,
  RendererAgentState,
  RendererSnapshot,
} from "../renderer.types.js";

export function toRendererAgentState(state: AgentState): RendererAgentState {
  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    pendingToolCalls: Array.from(state.pendingToolCalls),
    errorMessage: state.errorMessage,
  };
}

export function reuseStableFiles(
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

export function buildRendererSnapshot(
  slug: string,
  state: RendererAgentState,
  files: ProjectFile[],
  previousFiles: readonly ProjectFile[] | undefined,
): RendererSnapshot {
  return {
    slug,
    baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
    files: reuseStableFiles(previousFiles, files),
    state,
  };
}
