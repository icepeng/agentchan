import type { ReactNode } from "react";
import { SwrRoot } from "@/client/platform/index.js";
import { UIProvider } from "@/client/platform/index.js";
import { ViewProvider } from "@/client/entities/view/index.js";
import { SessionProvider } from "@/client/session/index.js";
import { ProjectEditorProvider } from "@/client/project-editor/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SwrRoot>
      <UIProvider>
        <ViewProvider>
          <SessionProvider>
            <ProjectEditorProvider>
              {children}
            </ProjectEditorProvider>
          </SessionProvider>
        </ViewProvider>
      </UIProvider>
    </SwrRoot>
  );
}
