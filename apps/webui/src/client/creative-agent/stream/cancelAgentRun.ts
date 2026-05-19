import { abortRegisteredAgentRun } from "@/client/creative-agent/session/index.js";
import type { AgentStreamStore } from "./agentStreamStore.js";

type AgentRunCloser = (slug: string) => void;

const closers = new Set<AgentRunCloser>();

export function registerAgentRunCloser(closer: AgentRunCloser): () => void {
  closers.add(closer);
  return () => {
    closers.delete(closer);
  };
}

export function registerAgentStreamStore(store: AgentStreamStore): () => void {
  return registerAgentRunCloser((slug) => {
    store.dispatch({ type: "CLOSE", projectSlug: slug });
  });
}

export async function cancelAgentRun(slug: string): Promise<void> {
  abortRegisteredAgentRun(slug);
  for (const close of closers) close(slug);
}
