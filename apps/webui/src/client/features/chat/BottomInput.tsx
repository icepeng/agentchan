import { useState, useRef, useEffect } from "react";
import { ArrowUp, ChevronsLeft } from "lucide-react";
import { useSessionState } from "@/client/entities/session/index.js";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/client/shared/notifications.js";
import { localStore } from "@/client/shared/storage.js";
import { useConfigState } from "@/client/entities/config/index.js";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  useRendererActionState,
  useRendererActionDispatch,
} from "@/client/entities/renderer-action/index.js";
import { useStreaming } from "./useStreaming.js";
import { useConversation } from "./useConversation.js";
import { useSlashCommands } from "./useSlashCommands.js";
import { SlashCommandPopup } from "./SlashCommandPopup.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";

interface BottomInputProps {
  variant?: "standalone" | "embedded";
}

export function BottomInput({ variant = "standalone" }: BottomInputProps) {
  const session = useSessionState();
  const config = useConfigState();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { send, isStreaming } = useStreaming();
  const { create } = useConversation();
  const rendererAction = useRendererActionState();
  const rendererActionDispatch = useRendererActionDispatch();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands(text, setText);

  const contextTokens = session.sessionUsage.contextTokens;
  const contextWindow = config.contextWindow ?? 128_000;
  const contextPercent = contextTokens > 0
    ? Math.round((contextTokens / contextWindow) * 100)
    : null;

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [text]);

  // Focus on mount and conversation change
  useEffect(() => {
    textareaRef.current?.focus();
  }, [session.activeConversationId]);

  // Handle renderer actions (send / fill)
  useEffect(() => {
    const action = rendererAction.pending;
    if (!action) return;
    rendererActionDispatch({ type: "CLEAR" });

    if (action.type === "fill") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderer action은 외부 시스템 이벤트 처리
      setText(action.text);
      textareaRef.current?.focus();
    } else if (action.type === "send") {
      if (!session.activeConversationId) {
        void create().then((conv) => {
          if (conv) void send(action.text, conv.id);
        });
      } else {
        void send(action.text);
      }
    }
  }, [rendererAction.pending, rendererActionDispatch, session.activeConversationId, create, send]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // Check slash command first
    if (slash.tryExecuteCommand(trimmed)) return;

    // First send in this session: opportunistically request Notification
    // permission. Must happen in a user gesture handler (click/keydown) to
    // satisfy browser policy. Fire-and-forget — we don't block send.
    if (localStore.notifications.read() === "on" && notificationPermission() === "default") {
      void requestNotificationPermission();
    }

    setText("");

    if (!session.activeConversationId) {
      const conv = await create();
      if (conv) await send(trimmed, conv.id);
      return;
    }

    await send(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slash.palette.handleKeyDown(e)) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const inputContent = (
    <div className={variant === "standalone" ? "max-w-4xl mx-auto" : ""}>
      <div className="relative">
        {slash.palette.isOpen && (
          <SlashCommandPopup
            listboxId={slash.palette.listboxId}
            commands={slash.palette.items}
            selectedIndex={slash.palette.selectedIndex}
            onSelect={slash.selectCommand}
            onHover={slash.palette.setSelectedIndex}
          />
        )}
        <div className="relative flex items-end gap-2 bg-surface rounded-2xl border border-edge/8 input-glow transition-all duration-200">
          {/* Agent panel toggle (when collapsed, standalone only) */}
          {variant === "standalone" && !ui.agentPanelOpen && (
            <button
              onClick={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
              className="m-1.5 p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
              title={t("empty.showAgentPanel")}
            >
              <ChevronsLeft size={16} strokeWidth={2} />
            </button>
          )}

          <textarea
            ref={textareaRef}
            data-testid="bottom-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              session.replyToNodeId
                ? t("input.branchPlaceholder")
                : t("input.placeholder")
            }
            rows={1}
            aria-autocomplete="list"
            aria-expanded={slash.palette.isOpen}
            aria-controls={slash.palette.isOpen ? slash.palette.listboxId : undefined}
            aria-activedescendant={slash.palette.isOpen ? slash.palette.activeOptionId : undefined}
            className="flex-1 bg-transparent px-5 py-3.5 text-sm resize-none focus:outline-none text-fg placeholder-fg-4 max-h-[200px] font-body"
          />
          <button
            data-testid="send-button"
            onClick={handleSubmit}
            disabled={!text.trim() || isStreaming}
            className="m-1.5 p-2.5 rounded-xl bg-accent text-void disabled:opacity-20 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-fg-3 tracking-wide">
        {config.provider}/{config.model}
        {config.temperature !== undefined && ` · t=${config.temperature}`}
        {config.thinkingLevel && config.thinkingLevel !== "off" && ` · think=${config.thinkingLevel}`}
        {(session.sessionUsage.inputTokens > 0 || session.sessionUsage.outputTokens > 0) && (
          <span>
            {" · "}
            {formatTokens(session.sessionUsage.inputTokens)} {t("input.tokenIn")} / {formatTokens(session.sessionUsage.outputTokens)} {t("input.tokenOut")}
            {session.sessionUsage.cost ? ` · ${formatCost(session.sessionUsage.cost)}` : ""}
          </span>
        )}
        {contextPercent !== null && (
          <span
            className={contextPercent >= 80 ? "text-amber-400" : ""}
            title={`${formatTokens(contextTokens)} / ${formatTokens(contextWindow)} tokens`}
          >
            {" · "}{t("input.context")} {contextPercent}%
          </span>
        )}
      </p>
    </div>
  );

  if (variant === "embedded") {
    return (
      <div className="border-t border-edge/6 p-3">
        {inputContent}
      </div>
    );
  }

  return (
    <div className="relative z-20 border-t border-edge/6 bg-base/80 backdrop-blur-sm p-3 pb-4 transition-colors duration-300">
      {inputContent}
    </div>
  );
}
