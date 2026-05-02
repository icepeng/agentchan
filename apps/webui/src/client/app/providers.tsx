import type { ReactNode } from "react";
import { SwrRoot } from "@/client/shared/swr.js";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ViewProvider } from "@/client/entities/view/index.js";
import { SessionSelectionProvider } from "@/client/entities/session/index.js";
import { AgentStateProvider } from "@/client/entities/agent-state/index.js";
import {
  RendererViewProvider,
  RendererActionProvider,
} from "@/client/entities/renderer/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ViewProvider>
          <SessionSelectionProvider>
            <AgentStateProvider>
              <RendererViewProvider>
                <RendererActionProvider>
                  <EditorProvider>
                    {children}
                  </EditorProvider>
                </RendererActionProvider>
              </RendererViewProvider>
            </AgentStateProvider>
          </SessionSelectionProvider>
        </ViewProvider>
      </UIProvider>
    </SwrRoot>
  );
}
