import { ChevronsRight, Plus, X } from "lucide-react";
import { useSessionState } from "@/client/entities/session/index.js";
import { useUIDispatch } from "@/client/app/context/UIContext.js";
import { useI18n } from "@/client/i18n/index.js";
import { useConversation } from "./useConversation.js";

export function SessionTabs() {
  const session = useSessionState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { create, load, remove } = useConversation();

  return (
    <div className="flex items-center border-b border-edge/6">
      {/* Scrollable tab area */}
      <div
        className="flex-1 flex items-center gap-0.5 px-1.5 py-1.5 overflow-x-auto min-w-0"
        style={{ scrollbarWidth: "none" }}
      >
        {session.conversations.map((conv) => {
          const isActive = session.activeConversationId === conv.id;
          return (
            <button
              key={conv.id}
              onClick={() => load(conv.id)}
              className={`group relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-wide transition-all duration-150 max-w-[160px] ${
                isActive
                  ? "bg-elevated text-accent border border-accent/15"
                  : "text-fg-3 hover:text-fg-2 hover:bg-elevated/40 border border-transparent"
              }`}
            >
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
              )}
              <span className="truncate">{conv.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(t("session.deleteConfirm", { title: conv.title }))) return;
                  void remove(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 hover:text-danger transition-all cursor-pointer"
              >
                <X size={8} strokeWidth={1.5} />
              </span>
            </button>
          );
        })}

        {/* New session */}
        <button
          onClick={create}
          className="flex-shrink-0 p-1.5 rounded-md text-fg-3 hover:text-accent hover:bg-accent/8 transition-all duration-150"
          title={t("session.new")}
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Close panel */}
      <button
        onClick={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
        className="flex-shrink-0 px-2 py-1.5 text-fg-3 hover:text-fg-2 transition-colors"
        title={t("session.closePanel")}
      >
        <ChevronsRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
