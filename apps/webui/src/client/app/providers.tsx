import type { ReactNode } from "react";
import { SwrRoot } from "@/client/shared/swr.js";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ProjectSelectionProvider } from "@/client/entities/project/index.js";
import { SessionSelectionProvider } from "@/client/entities/session/index.js";
import { AgentStateProvider } from "@/client/entities/agent-state/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";

/**
 * ProjectSelectionProvider must sit above AgentStateProvider — the latter
 * reads `activeProjectSlug` to decide which state/stream SSE to open.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ProjectSelectionProvider>
          <SessionSelectionProvider>
            <AgentStateProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </AgentStateProvider>
          </SessionSelectionProvider>
        </ProjectSelectionProvider>
      </UIProvider>
    </SwrRoot>
  );
}
