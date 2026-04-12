import type { ReactNode } from "react";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ConfigProvider } from "@/client/entities/config/index.js";
import { ProjectProvider } from "@/client/entities/project/index.js";
import { SessionProvider } from "@/client/entities/session/index.js";
import { SkillProvider } from "@/client/entities/skill/index.js";
import { EditorProvider } from "@/client/entities/editor/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <ConfigProvider>
        <ProjectProvider>
          <SessionProvider>
            <SkillProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </SkillProvider>
          </SessionProvider>
        </ProjectProvider>
      </ConfigProvider>
    </UIProvider>
  );
}
