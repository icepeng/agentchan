import { useEffect, useRef } from "react";
import { CornerUpLeft } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useActiveSession, useActiveStream } from "@/client/entities/session/index.js";
import type { TreeNode } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { MessageActionsProvider } from "./MessageActionsContext.js";
import { useConversation } from "./useConversation.js";
import { useStreaming } from "./useStreaming.js";
import { SessionTabs } from "./SessionTabs.js";
import { MessageBubble } from "./MessageBubble.js";
import { StreamingMessage } from "./StreamingMessage.js";

// ── Model Info Popover ───────────────────────

function ModelInfoPopover({ node }: { node: TreeNode }) {
  const { t } = useI18n();

  const msg = node.message;
  const model = msg.role === "assistant" ? msg.model : undefined;
  const provider = msg.role === "assistant" ? msg.provider : undefined;

  const u = node.usage;
  const hasUsage = !!(u?.inputTokens || u?.outputTokens);
  const cost = u?.cost ?? null;
  const cachedInput = u?.cachedInputTokens ?? 0;
  const cacheCreation = u?.cacheCreationTokens ?? 0;
  const totalInput = (u?.inputTokens ?? 0) + cachedInput + cacheCreation;
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
                    {formatTokens(u?.inputTokens ?? 0)}
                  </span>
                </div>
                {cachePercent > 0 && (
                  <div className="flex justify-between gap-4 text-fg-3/60">
                    <span>cache hit</span>
                    <span>{formatTokens(cachedInput)} ({cachePercent}%)</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-fg-3">{t("input.tokenOut")}</span>
                  <span className="text-fg">
                    {formatTokens(u?.outputTokens ?? 0)}
                  </span>
                </div>
                {cost !== null && (
                  <div className="flex justify-between gap-4 border-t border-white/6 pt-1 mt-1">
                    <span className="text-fg-3">cost</span>
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
  const session = useActiveSession();
  const stream = useActiveStream();
  const { t } = useI18n();
  const { switchBranch, setReplyTo, deleteNode } = useConversation();
  const { regenerate } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.activePath, stream.streamingText, stream.streamingToolCalls]);

  const getSiblings = (node: TreeNode): string[] => {
    if (!node.parentId) return [node.id];
    const parent = session.nodes.get(node.parentId);
    return parent?.children ?? [node.id];
  };

  if (!session.conversationId) {
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
    onDelete: deleteNode,
    onRegenerate: regenerate,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Session tabs */}
      <SessionTabs />

      {/* Reply-to banner */}
      {session.replyToNodeId && (
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

      {/* Messages */}
      <ScrollArea className="flex-1">
        <MessageActionsProvider
          switchBranch={switchBranch}
          branchFrom={setReplyTo}
          deleteNode={deleteNode}
          regenerate={regenerate}
          isStreaming={stream.isStreaming}
        >
          {session.activePath.map((nodeId) => {
            const node = session.nodes.get(nodeId);
            if (!node) return null;
            return (
              <MessageBubble
                key={nodeId}
                node={node}
                siblings={getSiblings(node)}
                actions={actions}
                isStreaming={stream.isStreaming}
                variant="compact"
                footer={
                  node.message.role === "assistant" && node.message.model
                    ? <ModelInfoPopover node={node} />
                    : undefined
                }
              />
            );
          })}
        </MessageActionsProvider>

        <StreamingMessage variant="compact" />

        {session.activePath.length === 0 && !stream.isStreaming && (
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
