import { useRef, useState } from "react";
import { Check, ChevronsRight, Plus, Settings, SquarePen, X } from "lucide-react";
import {
  useSessions,
  useActiveSessionSelection,
} from "@/client/entities/session/index.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useUIDispatch, EditModeToggle } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { ScrollArea, TextInput } from "@/client/shared/ui/index.js";
import { useSession } from "./useSession.js";

export function SessionTabs() {
  const selection = useActiveSessionSelection();
  const { activeProjectSlug } = useProjectSelectionState();
  const { data: sessions = [] } = useSessions(activeProjectSlug);
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { create, load, remove, rename } = useSession();
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const cancelRenameRef = useRef(false);

  const commitRename = async (id: string, currentTitle: string, nextValue: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditing(null);
      return;
    }
    setEditing(null);
    if (nextValue.trim() === currentTitle) return;
    await rename(id, nextValue);
  };

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
          const isEditing = editing?.id === sess.id;
          const tabClassName = `group relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs tracking-wide transition-all duration-150 max-w-[160px] ${
            isActive
              ? "bg-elevated text-accent border border-accent/15"
              : "text-fg-3 hover:text-fg-2 hover:bg-elevated/40 border border-transparent"
          }`;
          if (isEditing) {
            return (
              <div key={sess.id} className={`${tabClassName} w-[160px]`}>
                {sess.mode === "meta" ? (
                  <Settings size={10} strokeWidth={2} className="flex-shrink-0 text-fg-4" />
                ) : null}
                <TextInput
                  size="sm"
                  value={editing.value}
                  onChange={(e) => setEditing({ id: sess.id, value: e.currentTarget.value })}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => void commitRename(sess.id, sess.title, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename(sess.id, sess.title, e.currentTarget.value);
                    if (e.key === "Escape") {
                      cancelRenameRef.current = true;
                      setEditing(null);
                    }
                  }}
                  className="h-5 min-w-0 !px-1.5 !py-0 text-xs"
                  aria-label={t("session.rename")}
                />
                <Check size={10} strokeWidth={2} className="flex-shrink-0 text-accent" />
              </div>
            );
          }
          return (
            <button
              key={sess.id}
              onClick={() => load(sess.id)}
              onDoubleClick={() => {
                cancelRenameRef.current = false;
                setEditing({ id: sess.id, value: sess.title });
              }}
              className={tabClassName}
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
                  cancelRenameRef.current = false;
                  setEditing({ id: sess.id, value: sess.title });
                }}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 hover:text-accent transition-all cursor-pointer"
                title={t("session.rename")}
              >
                <SquarePen size={8} strokeWidth={1.5} />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(t("session.deleteConfirm", { title: sess.title }))) return;
                  void remove(sess.id);
                }}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 hover:text-danger transition-all cursor-pointer"
                title={t("session.delete")}
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
