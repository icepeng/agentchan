import { useEffect, useRef } from "react";
import { CornerUpLeft } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
  branchFromLeaf,
} from "@/client/entities/session/index.js";
import type { SessionEntry, SessionMessageEntry } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { useSession } from "./useSession.js";
import { useStreaming } from "./useStreaming.js";
import { SessionTabs } from "./SessionTabs.js";
import { AssistantTurnBubble, MessageBubble } from "./MessageBubble.js";
import { StreamingMessage } from "./StreamingMessage.js";

// ── Model Info Popover ───────────────────────

function ModelInfoPopover({ entry }: { entry: SessionMessageEntry }) {
  const { t } = useI18n();

  const msg = entry.message;
  const model = msg.role === "assistant" ? msg.model : undefined;
  const provider = msg.role === "assistant" ? msg.provider : undefined;
  const usage = msg.role === "assistant" ? msg.usage : undefined;

  const hasUsage = !!(usage?.input || usage?.output);
  const cost = usage?.cost?.total ?? null;
  const cachedInput = usage?.cacheRead ?? 0;
  const cacheCreation = usage?.cacheWrite ?? 0;
  const totalInput = (usage?.input ?? 0) + cachedInput + cacheCreation;
  const cachePercent = totalInput > 0 && cachedInput > 0
    ? Math.round((cachedInput / totalInput) * 100) : 0;

  return (
    <Popover.Root>
      <Popover.Trigger className="text-[11px] text-fg-3 font-mono hover:text-accent transition-colors cursor-pointer">
        {model}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4}>
          <Popover.Popup className="bg-elevated border border-white/8 rounded-lg shadow-lg shadow-void/50 p-3 min-w-[220px] animate-fade text-[11px] z-50">
            <div className="text-fg-3 mb-2">
              <div className="text-fg font-mono">{model}</div>
              {provider && (
                <div className="text-fg-3/70 mt-0.5">{provider}</div>
              )}
            </div>
            {hasUsage && (
              <div className="border-t border-white/6 pt-2 space-y-1 font-mono">
                <div className="flex justify-between gap-4">
                  <span className="text-fg-3">{t("input.tokenIn")}</span>
                  <span className="text-fg">
                    {formatTokens(usage?.input ?? 0)}
                  </span>
                </div>
                {cachePercent > 0 && (
                  <div className="flex justify-between gap-4 text-fg-3/60">
                    <span>{t("input.cacheHit")}</span>
                    <span>{formatTokens(cachedInput)} ({cachePercent}%)</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-fg-3">{t("input.tokenOut")}</span>
                  <span className="text-fg">
                    {formatTokens(usage?.output ?? 0)}
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

const EMPTY_ENTRIES: readonly SessionEntry[] = [];

function messageEntriesOf(entries: readonly SessionEntry[]): SessionMessageEntry[] {
  return entries.filter((entry): entry is SessionMessageEntry => entry.type === "message");
}

function siblingMessageEntryIds(
  entries: readonly SessionEntry[],
  entry: SessionMessageEntry,
): string[] {
  const siblings = entries
    .filter((candidate): candidate is SessionMessageEntry =>
      candidate.type === "message" && candidate.parentId === entry.parentId,
    )
    .map((candidate) => candidate.id);
  return siblings.length > 0 ? siblings : [entry.id];
}

type BubbleGroup =
  | { kind: "user"; entry: SessionMessageEntry }
  | { kind: "assistantTurn"; entries: SessionMessageEntry[] };

function groupBranchMessages(entries: readonly SessionMessageEntry[]): BubbleGroup[] {
  const groups: BubbleGroup[] = [];
  for (const entry of entries) {
    if (entry.message.role === "user") {
      groups.push({ kind: "user", entry });
      continue;
    }
    const prev = groups[groups.length - 1];
    if (prev?.kind === "assistantTurn") {
      prev.entries.push(entry);
    } else {
      groups.push({ kind: "assistantTurn", entries: [entry] });
    }
  }
  return groups;
}

export function AgentPanel() {
  const selection = useActiveSessionSelection();
  const state = useAgentState();
  const { activeProjectSlug } = useProjectSelectionState();
  const { data: sessionData } = useSessionData(
    activeProjectSlug,
    selection.openSessionId,
  );
  const entries = sessionData?.entries ?? EMPTY_ENTRIES;
  const branch = sessionData ? branchFromLeaf(sessionData.entries, sessionData.leafId) : EMPTY_ENTRIES;
  const branchMessages = messageEntriesOf(branch);

  const { t } = useI18n();
  const { selectLeaf, setAppendLeaf } = useSession();
  const { regenerate } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [branchMessages.length, state.streamingMessage]);

  const getSiblings = (entry: SessionMessageEntry): string[] =>
    siblingMessageEntryIds(entries, entry);

  const groups = groupBranchMessages(branchMessages);

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
    onSelectLeaf: selectLeaf,
    onBranchFrom: setAppendLeaf,
    onRegenerate: regenerate,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Session tabs */}
      <SessionTabs />

      {/* Reply-to banner */}
      {selection.replyToLeafId && (
        <div className="px-3 py-2 bg-accent/5 border-b border-accent/10 flex items-center justify-between">
          <span className="text-[11px] text-accent tracking-wide flex items-center gap-1.5">
            <CornerUpLeft size={10} strokeWidth={2} />
            {t("chat.branching")}
          </span>
          <button
            onClick={() => setAppendLeaf(null)}
            className="text-[11px] text-accent/60 hover:text-accent transition-colors"
          >
            {t("chat.cancel")}
          </button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        {groups.map((g) => {
          if (g.kind === "user") {
            return (
              <MessageBubble
                key={g.entry.id}
                entry={g.entry}
                siblings={getSiblings(g.entry)}
                actions={actions}
                isStreaming={state.isStreaming}
                variant="compact"
              />
            );
          }
          const first = g.entries[0];
          if (!first) return null;
          const lastAssistant = [...g.entries]
            .reverse()
            .find((entry) => entry.message.role === "assistant");
          return (
            <AssistantTurnBubble
              key={first.id}
              entries={g.entries}
              siblings={getSiblings(first)}
              actions={actions}
              isStreaming={state.isStreaming}
              variant="compact"
              footer={
                lastAssistant && lastAssistant.message.role === "assistant" && lastAssistant.message.model
                  ? <ModelInfoPopover entry={lastAssistant} />
                  : undefined
              }
            />
          );
        })}

        <StreamingMessage variant="compact" />

        {branchMessages.length === 0 && !state.isStreaming && (
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
