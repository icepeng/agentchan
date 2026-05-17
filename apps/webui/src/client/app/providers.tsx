import type { ReactNode } from "react";
import { SwrRoot } from "@/client/platform/index.js";
import { UIProvider } from "@/client/platform/index.js";
import { ViewProvider } from "@/client/entities/view/index.js";
import { SessionProvider } from "@/client/session/index.js";
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
          <SessionProvider>
            <RendererViewProvider>
              <RendererActionProvider>
                <EditorProvider>
                  {children}
                </EditorProvider>
              </RendererActionProvider>
            </RendererViewProvider>
          </SessionProvider>
        </ViewProvider>
      </UIProvider>
    </SwrRoot>
  );
}
