import type { ReactNode } from "react";
import { UIProvider } from "@/client/entities/ui/index.js";
import { ConfigProvider } from "@/client/entities/config/index.js";
import { ProjectProvider } from "@/client/entities/project/index.js";
import { SessionProvider } from "@/client/entities/session/index.js";
import { SkillProvider } from "@/client/entities/skill/index.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <ConfigProvider>
        <ProjectProvider>
          <SessionProvider>
            <SkillProvider>
              {children}
            </SkillProvider>
          </SessionProvider>
        </ProjectProvider>
      </ConfigProvider>
    </UIProvider>
  );
}
