import type { ReactNode } from "react";
import { SwrRoot } from "@/client/shared/swr.js";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ProjectSelectionProvider } from "@/client/entities/project/index.js";
import { SessionSelectionProvider } from "@/client/entities/session/index.js";
import { StreamProvider } from "@/client/entities/stream/index.js";
import {
  RendererViewProvider,
  RendererActionProvider,
} from "@/client/entities/renderer/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ProjectSelectionProvider>
          <SessionSelectionProvider>
            <StreamProvider>
              <RendererViewProvider>
                <RendererActionProvider>
                  <EditorProvider>
                    {children}
                  </EditorProvider>
                </RendererActionProvider>
              </RendererViewProvider>
            </StreamProvider>
          </SessionSelectionProvider>
        </ProjectSelectionProvider>
      </UIProvider>
    </SwrRoot>
  );
}
