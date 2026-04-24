import { useState, useRef, useEffect } from "react";
import { ArrowUp, ChevronsLeft } from "lucide-react";
import { useActiveUsage } from "@/client/entities/agent-state/index.js";
import { useActiveSessionSelection } from "@/client/entities/session/index.js";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/client/shared/notifications.js";
import { localStore } from "@/client/shared/storage.js";
import { useConfig, useCurrentModel, DEFAULT_CONTEXT_WINDOW } from "@/client/entities/config/index.js";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  useRendererActionState,
  useRendererActionDispatch,
} from "@/client/entities/renderer/index.js";
import { useStreaming } from "./useStreaming.js";
import { useSession } from "./useSession.js";
import { useSlashCommands } from "./useSlashCommands.js";
import { SlashCommandPopup } from "./SlashCommandPopup.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";

interface BottomInputProps {
  variant?: "standalone" | "embedded";
}

export function BottomInput({ variant = "standalone" }: BottomInputProps) {
  const selection = useActiveSessionSelection();
  const usage = useActiveUsage();
  const { data: config } = useConfig();
  const { model: currentModel } = useCurrentModel();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { send, isStreaming } = useStreaming();
  const { create } = useSession();
  const rendererAction = useRendererActionState();
  const rendererActionDispatch = useRendererActionDispatch();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands(text, setText);

  const contextTokens = usage.contextTokens;
  const contextWindow = config?.contextWindow ?? currentModel?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
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

  // Focus on mount and session change
  useEffect(() => {
    textareaRef.current?.focus();
  }, [selection.openSessionId]);

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
      if (!selection.openSessionId) {
        void create().then((sess) => {
          if (sess) void send(action.text, sess.id);
        });
      } else {
        void send(action.text);
      }
    }
  }, [rendererAction.pending, rendererActionDispatch, selection.openSessionId, create, send]);

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

    if (!selection.openSessionId) {
      const sess = await create();
      if (sess) await send(trimmed, sess.id);
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
              selection.replyToNodeId
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
        {config?.provider ?? ""}/{config?.model ?? ""}
        {config?.temperature !== undefined && ` · t=${config.temperature}`}
        {config?.thinkingLevel && config.thinkingLevel !== "off" && ` · think=${config.thinkingLevel}`}
        {(usage.inputTokens > 0 || usage.outputTokens > 0) && (
          <span>
            {" · "}
            {formatTokens(usage.inputTokens)} {t("input.tokenIn")} / {formatTokens(usage.outputTokens)} {t("input.tokenOut")}
            {usage.cost ? ` · ${formatCost(usage.cost)}` : ""}
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
