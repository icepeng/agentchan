import type { ReactNode } from "react";
import { SwrRoot } from "@/client/shared/swr.js";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ProjectProvider } from "@/client/entities/project/index.js";
import { SessionProvider } from "@/client/entities/session/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";
import { RendererActionProvider } from "@/client/entities/renderer-action/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ProjectProvider>
          <SessionProvider>
            <RendererActionProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </RendererActionProvider>
          </SessionProvider>
        </ProjectProvider>
      </UIProvider>
    </SwrRoot>
  );
}
