import type { ReactNode } from "react";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ConfigProvider } from "@/client/entities/config/index.js";
import { ProjectProvider } from "@/client/entities/project/index.js";
import { SessionProvider } from "@/client/entities/session/index.js";
import { SkillProvider } from "@/client/entities/skill/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";
import { RendererActionProvider } from "@/client/entities/renderer-action/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <ConfigProvider>
        <ProjectProvider>
          <SessionProvider>
            <RendererActionProvider>
              <SkillProvider>
                <EditorProvider>
                  {children}
                </EditorProvider>
              </SkillProvider>
            </RendererActionProvider>
          </SessionProvider>
        </ProjectProvider>
      </ConfigProvider>
    </UIProvider>
  );
}
