import { ChevronsRight, Plus, Settings, X } from "lucide-react";
import {
  useSessions,
  useActiveSessionSelection,
} from "@/client/entities/session/index.js";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import { useUIDispatch, EditModeToggle } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { useSession } from "./useSession.js";

export function SessionTabs() {
  const selection = useActiveSessionSelection();
  const view = useViewState();
  const activeProjectSlug = selectActiveProjectSlug(view);
  const { data: sessions = [] } = useSessions(activeProjectSlug);
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { create, load, remove } = useSession();

  return (
    <div className="flex items-center border-b border-edge/6">
      {/* Scrollable tab area */}
      <ScrollArea
        orientation="horizontal"
        hideScrollbar
        className="flex-1 min-w-0"
        viewportClassName="flex items-center gap-0.5 px-1.5 py-1.5"
      >
        {sessions.map((sess) => {
          const isActive = selection.openSessionId === sess.id;
          return (
            <button
              key={sess.id}
              onClick={() => load(sess.id)}
              className={`group relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-wide transition-all duration-150 max-w-[160px] ${
                isActive
                  ? "bg-elevated text-accent border border-accent/15"
                  : "text-fg-3 hover:text-fg-2 hover:bg-elevated/40 border border-transparent"
              }`}
            >
              {sess.mode === "meta" ? (
                <Settings size={10} strokeWidth={2} className="flex-shrink-0 text-fg-4" />
              ) : isActive ? (
                <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
              ) : null}
              <span className="truncate">{sess.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(t("session.deleteConfirm", { title: sess.title }))) return;
                  void remove(sess.id);
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
          onClick={() => create()}
          className="flex-shrink-0 p-1.5 rounded-md text-fg-3 hover:text-accent hover:bg-accent/8 transition-all duration-150"
          title={t("session.new")}
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      </ScrollArea>

      <EditModeToggle />
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
