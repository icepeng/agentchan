import { useState, useRef, useEffect, useCallback } from "react";
import { useSessionState } from "@/client/entities/session/index.js";
import { useConfigState } from "@/client/entities/config/index.js";
import { useUIState, useUIDispatch } from "@/client/app/context/UIContext.js";
import { useI18n } from "@/client/i18n/index.js";
import { useStreaming } from "./useStreaming.js";
import { useConversation } from "./useConversation.js";
import { useSlashCommands } from "./useSlashCommands.js";
import { SlashCommandPopup } from "./SlashCommandPopup.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";

export function BottomInput() {
  const session = useSessionState();
  const config = useConfigState();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const { send, isStreaming } = useStreaming();
  const { create } = useConversation();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendText = useCallback(async (message: string) => {
    if (!session.activeConversationId) {
      await create();
      setText(message);
      return;
    }
    setText("");
    await send(message);
  }, [session.activeConversationId, create, send]);

  const slash = useSlashCommands(text, setText, sendText);

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

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    if (slash.tryExecuteCommand(trimmed)) return;
    await sendText(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slash.handleKeyDown(e)) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="border-t border-edge/6 bg-base/80 backdrop-blur-sm p-3 pb-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          {slash.isOpen && (
            <SlashCommandPopup
              commands={slash.filteredCommands}
              selectedIndex={slash.selectedIndex}
              onSelect={slash.selectCommand}
              onHover={slash.setSelectedIndex}
            />
          )}
        <div className="relative flex items-end gap-2 bg-surface rounded-2xl border border-edge/8 input-glow transition-all duration-200">
          {/* Agent panel toggle (when collapsed) */}
          {!ui.agentPanelOpen && (
            <button
              onClick={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
              className="m-1.5 p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
              title={t("empty.showAgentPanel")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M11 17l-5-5 5-5" />
                <path d="M18 17l-5-5 5-5" />
              </svg>
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              session.replyToNodeId
                ? t("input.branchPlaceholder")
                : t("input.placeholder")
            }
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent px-5 py-3.5 text-sm resize-none focus:outline-none text-fg placeholder-fg-4 disabled:opacity-40 max-h-[200px] font-body"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isStreaming}
            className="m-1.5 p-2.5 rounded-xl bg-accent text-void disabled:opacity-20 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
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
    </div>
  );
}
