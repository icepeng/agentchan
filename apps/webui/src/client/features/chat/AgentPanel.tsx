import { useEffect, useRef } from "react";
import { CornerUpLeft } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useSessionState } from "@/client/entities/session/index.js";
import type { TreeNode } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { formatCost, formatTokens } from "@/client/shared/pricing.utils.js";
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
  const session = useSessionState();
  const { t } = useI18n();
  const { switchBranch, setReplyTo, deleteNode } = useConversation();
  const { regenerate } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tail-key matching: the streaming wrapper div and the completed MessageBubble
  // share the same React key, so React reuses the DOM element and the entry
  // animation (on the wrapper) doesn't re-trigger when streaming ends.
  // Refs are mutated during render (not useEffect) to avoid a one-frame key
  // mismatch that would re-mount the wrapper and replay the animation.
  // StrictMode double-render is safe: the edge-detection consumes the transition
  // on the first invocation, so the second sees no change.
  const prevStreamingRef = useRef(false);
  const tailCountRef = useRef(0);
  const tailKeysRef = useRef(new Map<string, string>());

  if (!prevStreamingRef.current && session.isStreaming) {
    tailCountRef.current++;
  }
  if (prevStreamingRef.current && !session.isStreaming) {
    const lastId = session.activePath.at(-1);
    if (lastId) tailKeysRef.current.set(lastId, `tail-${tailCountRef.current}`);
  }
  prevStreamingRef.current = session.isStreaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.activePath, session.streamingText, session.streamingToolCalls]);

  const getSiblings = (node: TreeNode): string[] => {
    if (!node.parentId) return [node.id];
    const parent = session.nodes.get(node.parentId);
    return parent?.children ?? [node.id];
  };

  if (!session.activeConversationId) {
    return (
      <div className="flex flex-col h-full">
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
    <div className="flex flex-col h-full">
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
      <div className="flex-1 overflow-y-auto">
        <MessageActionsProvider
          switchBranch={switchBranch}
          branchFrom={setReplyTo}
          deleteNode={deleteNode}
          regenerate={regenerate}
          isStreaming={session.isStreaming}
        >
          {session.activePath.map((nodeId) => {
            const node = session.nodes.get(nodeId);
            if (!node) return null;
            return (
              <div key={tailKeysRef.current.get(nodeId) ?? nodeId} className="animate-fade-slide">
                <MessageBubble
                  node={node}
                  siblings={getSiblings(node)}
                  actions={actions}
                  isStreaming={session.isStreaming}
                  variant="compact"
                  footer={
                    node.message.role === "assistant" && node.message.model
                      ? <ModelInfoPopover node={node} />
                      : undefined
                  }
                />
              </div>
            );
          })}
          {(session.isStreaming || session.streamingText || session.streamingToolCalls.length > 0) && (
            <div key={`tail-${tailCountRef.current}`} className="animate-fade-slide">
              <StreamingMessage variant="compact" />
            </div>
          )}
        </MessageActionsProvider>

        {session.activePath.length === 0 && !session.isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-fg-3 tracking-wide">
              {t("chat.awaitingInput")}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
