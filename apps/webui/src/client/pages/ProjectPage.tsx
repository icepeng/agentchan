import { useProjectState } from "@/client/entities/project/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { RenderedView } from "@/client/features/project/index.js";
import { AgentPanel, BottomInput, useConversation } from "@/client/features/chat/index.js";

interface ProjectPageProps {
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
}

export function ProjectPage({ agentPanelOpen, onToggleAgentPanel }: ProjectPageProps) {
  const project = useProjectState();
  const { t } = useI18n();
  const { create } = useConversation();

  return (
    <>
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 35% at 50% 100%, rgba(45,212,191,0.025) 0%, transparent 70%)",
        }}
      />

      {/* Top area: split pane */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Left: Rendered View */}
        <div className={`flex-1 flex flex-col min-w-0 border-r border-edge/6 ${agentPanelOpen ? "" : "border-r-0"}`}>
          {project.activeProjectSlug ? (
            <RenderedView />
          ) : (
            <EmptyState onCreate={async () => {
              await create();
              if (!agentPanelOpen) onToggleAgentPanel();
            }} />
          )}
        </div>

        {/* Right: Agent Panel (collapsible) */}
        {agentPanelOpen ? (
          <div className="w-[420px] flex-shrink-0 flex flex-col border-l border-edge/6 bg-base/40 hidden lg:flex">
            <AgentPanel />
          </div>
        ) : (
          <button
            onClick={onToggleAgentPanel}
            className="hidden lg:flex flex-shrink-0 w-7 items-center justify-center border-l border-edge/6 bg-base/20 hover:bg-accent/8 text-fg-3 hover:text-accent transition-all duration-200 cursor-pointer group"
            title={t("empty.openAgentPanel")}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="group-hover:scale-110 transition-transform"
            >
              <path d="M11 17l-5-5 5-5" />
              <path d="M18 17l-5-5 5-5" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom: Input */}
      <BottomInput />
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center">
          <div className="w-5 h-5 rounded-lg bg-accent/20 animate-glow" />
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-fg mb-2">
          agent<span className="text-accent">chan</span>
        </h2>
        <p className="text-sm text-fg-3 mb-8 tracking-wide">
          {t("empty.subtitle")}
        </p>
        <button
          onClick={onCreate}
          className="px-6 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm font-medium hover:bg-accent/15 hover:border-accent/30 active:scale-[0.98] transition-all duration-200"
        >
          {t("session.new")}
        </button>
      </div>
    </div>
  );
}
