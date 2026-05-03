import { useEffect, useRef } from "react";
import { CornerUpLeft } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import {
  aggregateUsage,
  useAgentState,
} from "@/client/entities/agent-state/index.js";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
  selectBranch,
  buildSiblingsByEntry,
} from "@/client/entities/session/index.js";
import type { SessionMessageEntry } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { MessageActionsProvider } from "./MessageActionsContext.js";
import { useSession } from "./useSession.js";
import { useStreaming } from "./useStreaming.js";
import { SessionTabs } from "./SessionTabs.js";
import {
  AssistantTurnBubble,
  CompactionBanner,
  SkillChipBubble,
  UserBubble,
} from "./MessageBubble.js";
import { StreamingMessage } from "./StreamingMessage.js";
import { groupBranch } from "./groupBranch.js";

// ── Model Info Popover ───────────────────────

function ModelInfoPopover({ entries }: { entries: SessionMessageEntry[] }) {
  const { t } = useI18n();

  // Model name comes from the last assistant entry (a tool-using turn may
  // span multiple assistant entries; the trailing one is what just produced
  // the final reply). Token + cost totals aggregate across the whole turn.
  const lastAssistant = [...entries]
    .reverse()
    .find((e) => e.message.role === "assistant");
  const lastMsg = lastAssistant?.message;
  const model = lastMsg?.role === "assistant" ? lastMsg.model : undefined;
  const provider = lastMsg?.role === "assistant" ? lastMsg.provider : undefined;

  const turnUsage = aggregateUsage(entries);
  const hasUsage = turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0;
  const totalInput =
    turnUsage.inputTokens + turnUsage.cachedInputTokens + turnUsage.cacheCreationTokens;
  const cachePercent =
    totalInput > 0 && turnUsage.cachedInputTokens > 0
      ? Math.round((turnUsage.cachedInputTokens / totalInput) * 100)
      : 0;
  const cost = turnUsage.cost > 0 ? turnUsage.cost : null;

  return (
    <Popover.Root>
      <Popover.Trigger className="text-[11px] text-fg-3 hover:text-accent transition-colors cursor-pointer">
        {model}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4}>
          <Popover.Popup className="bg-elevated border border-white/8 rounded-lg shadow-lg shadow-void/50 p-3 min-w-[220px] animate-fade text-[11px] z-50">
            <div className="text-fg-3 mb-2">
              <div className="text-fg">{model}</div>
              {provider && (
                <div className="text-fg-3/70 mt-0.5">{provider}</div>
              )}
            </div>
            {hasUsage && (
              <div className="border-t border-white/6 pt-2 space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-fg-3">{t("input.tokenIn")}</span>
                  <span className="text-fg">
                    {formatTokens(turnUsage.inputTokens)}
                  </span>
                </div>
                {cachePercent > 0 && (
                  <div className="flex justify-between gap-4 text-fg-3/60">
                    <span>{t("input.cacheHit")}</span>
                    <span>{formatTokens(turnUsage.cachedInputTokens)} ({cachePercent}%)</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-fg-3">{t("input.tokenOut")}</span>
                  <span className="text-fg">
                    {formatTokens(turnUsage.outputTokens)}
                  </span>
                </div>
                {cost !== null && (
                  <div className="flex justify-between gap-4 border-t border-white/6 pt-1 mt-1">
                    <span className="text-fg-3">{t("input.cost")}</span>
                    <span className="text-accent">{formatCost(cost)}</span>
                  </div>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Agent Panel ───────────────────────────────

export function AgentPanel() {
  const selection = useActiveSessionSelection();
  const state = useAgentState();
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const { data: sessionData } = useSessionData(
    activeProjectSlug,
    selection.openSessionId,
  );

  const entries = sessionData?.entries ?? [];
  const leafId = sessionData?.leafId ?? null;
  const branch = selectBranch(entries, leafId);
  const siblingsByEntry = buildSiblingsByEntry(entries);
  const siblingsOf = (id: string) => siblingsByEntry.get(id) ?? [id];

  const { t } = useI18n();
  const { switchBranch, setReplyTo } = useSession();
  const { regenerate } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [leafId, state.streamingMessage]);

  const groups = groupBranch(branch);

  if (!selection.openSessionId) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <SessionTabs />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-fg-3 tracking-wide">
            {t("chat.selectSession")}
          </p>
        </div>
      </div>
    );
  }

  const actions = {
    onSwitchBranch: switchBranch,
    onBranchFrom: setReplyTo,
    onRegenerate: regenerate,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SessionTabs />

      {selection.replyToEntryId && (
        <div className="px-3 py-2 bg-accent/5 border-b border-accent/10 flex items-center justify-between">
          <span className="text-[11px] text-accent tracking-wide flex items-center gap-1.5">
            <CornerUpLeft size={10} strokeWidth={2} />
            {t("chat.branching")}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="text-[11px] text-accent/60 hover:text-accent transition-colors"
          >
            {t("chat.cancel")}
          </button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <MessageActionsProvider
          switchBranch={switchBranch}
          branchFrom={setReplyTo}
          regenerate={regenerate}
          isStreaming={state.isStreaming}
        >
          {groups.map((g, idx) => {
            if (g.kind === "user") {
              const key = g.displayText !== undefined ? `${g.entry.id}:user` : g.entry.id;
              return (
                <UserBubble
                  key={key}
                  entry={g.entry}
                  siblings={siblingsOf(g.entry.id)}
                  actions={actions}
                  isStreaming={state.isStreaming}
                  variant="compact"
                  displayText={g.displayText}
                />
              );
            }
            if (g.kind === "skillLoad") {
              return (
                <SkillChipBubble
                  key={`${g.entry.id}:skill:${idx}`}
                  skillText={g.skillText}
                  variant="compact"
                />
              );
            }
            if (g.kind === "compaction") {
              return (
                <CompactionBanner
                  key={g.entry.id}
                  entry={g.entry}
                  variant="compact"
                />
              );
            }
            const first = g.entries[0];
            if (!first) return null;
            const lastAssistant = [...g.entries]
              .reverse()
              .find((e) => e.message.role === "assistant");
            const showFooter =
              lastAssistant?.message.role === "assistant" &&
              !!lastAssistant.message.model;
            return (
              <AssistantTurnBubble
                key={first.id}
                entries={g.entries}
                siblings={siblingsOf(first.id)}
                actions={actions}
                isStreaming={state.isStreaming}
                variant="compact"
                footer={
                  showFooter ? <ModelInfoPopover entries={g.entries} /> : undefined
                }
              />
            );
          })}
        </MessageActionsProvider>

        <StreamingMessage variant="compact" />

        {branch.length === 0 && !state.isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-fg-3 tracking-wide">
              {t("chat.awaitingInput")}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </ScrollArea>
    </div>
  );
}
