import type { ReactNode } from "react";
import { SwrRoot } from "@/client/shared/swr.js";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ProjectProvider } from "@/client/entities/project/index.js";
import { ProjectRuntimeProvider } from "@/client/entities/project-runtime/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";
import { RendererActionProvider } from "@/client/entities/renderer-action/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ProjectProvider>
          <ProjectRuntimeProvider>
            <RendererActionProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </RendererActionProvider>
          </ProjectRuntimeProvider>
        </ProjectProvider>
      </UIProvider>
    </SwrRoot>
  );
}
