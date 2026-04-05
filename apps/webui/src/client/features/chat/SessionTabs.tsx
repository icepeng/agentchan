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
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
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
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
          </svg>
        </button>
      </div>

      {/* Close panel */}
      <button
        onClick={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
        className="flex-shrink-0 px-2 py-1.5 text-fg-3 hover:text-fg-2 transition-colors"
        title={t("session.closePanel")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M13 17l5-5-5-5" />
          <path d="M6 17l5-5-5-5" />
        </svg>
      </button>
    </div>
  );
}
