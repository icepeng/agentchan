import { abortRegisteredProjectStream } from "@/client/session/data/index.js";
import type { AgentStreamStore } from "./agentStreamStore.js";

type ProjectStreamCloser = (slug: string) => void;

const closers = new Set<ProjectStreamCloser>();

export function registerAgentStreamCloser(closer: ProjectStreamCloser): () => void {
  closers.add(closer);
  return () => {
    closers.delete(closer);
  };
}

export function registerAgentStreamStore(store: AgentStreamStore): () => void {
  return registerAgentStreamCloser((slug) => {
    store.dispatch({ type: "CLOSE", projectSlug: slug });
  });
}

export async function closeProjectStream(slug: string): Promise<void> {
  abortRegisteredProjectStream(slug);
  for (const close of closers) close(slug);
}
