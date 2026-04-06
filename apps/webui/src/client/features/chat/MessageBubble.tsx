import { useState, type ReactNode } from "react";
import type { TreeNode } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { UserAvatar, AgentAvatar } from "./Avatars.js";
import { MessageContent } from "./MessageContent.js";

// ── Branch Navigator ──────────────────────────

function BranchNavigator({
  nodeId,
  siblings,
  onSwitch,
}: {
  nodeId: string;
  siblings: string[];
  onSwitch: (nodeId: string) => void;
}) {
  const currentIndex = siblings.indexOf(nodeId);
  if (siblings.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-0.5 text-xs text-fg-3 bg-elevated rounded-full px-1.5 py-0.5 border border-edge/6">
      <button
        onClick={() => onSwitch(siblings[currentIndex - 1])}
        disabled={currentIndex === 0}
        className="px-1 hover:text-accent disabled:opacity-20 disabled:cursor-default transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 2L3 5L6 8" />
        </svg>
      </button>
      <span className="px-0.5 text-fg-3 tabular-nums select-none">
        {currentIndex + 1}/{siblings.length}
      </span>
      <button
        onClick={() => onSwitch(siblings[currentIndex + 1])}
        disabled={currentIndex === siblings.length - 1}
        className="px-1 hover:text-accent disabled:opacity-20 disabled:cursor-default transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 2L7 5L4 8" />
        </svg>
      </button>
    </div>
  );
}

// ── Compact Summary Bubble ───────────────────

function CompactSummaryBubble({
  node,
  variant = "compact",
}: {
  node: TreeNode;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isWide = variant === "wide";

  const inner = (
    <div className="flex items-center gap-2 text-xs text-fg-3 py-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
      <span className="opacity-70">{t("chat.compactSummary")}</span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-accent/60 hover:text-accent transition-colors ml-1"
      >
        {expanded ? t("chat.compactHideDetails") : t("chat.compactShowDetails")}
      </button>
    </div>
  );

  const details = expanded ? (
    <div className="mt-1.5 pl-[22px] text-xs text-fg-3/70 border-l-2 border-edge/10 ml-[6px]">
      <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed p-2">
        <MessageContent content={node.content} />
      </div>
    </div>
  ) : null;

  if (isWide) {
    return (
      <div className="px-4 py-1">
        <div className="max-w-3xl mx-auto">
          {inner}
          {details}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-1">
      {inner}
      {details}
    </div>
  );
}

// ── Message Bubble ────────────────────────────

export interface MessageBubbleActions {
  onSwitchBranch?: (nodeId: string) => void;
  onBranchFrom?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onRegenerate?: (nodeId: string) => void;
}

export interface MessageBubbleProps {
  node: TreeNode;
  siblings: string[];
  actions?: MessageBubbleActions;
  isStreaming?: boolean;
  variant?: "compact" | "wide";
  footer?: ReactNode;
}

export function MessageBubble({
  node,
  siblings,
  actions,
  isStreaming,
  variant = "compact",
  footer,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const isWide = variant === "wide";

  const isToolResultOnly =
    node.role === "user" &&
    node.content.every((b) => b.type === "tool_result");

  if (isToolResultOnly) {
    if (isWide) {
      return (
        <div className="px-4 py-1">
          <div className="max-w-3xl mx-auto">
            <MessageContent content={node.content} />
          </div>
        </div>
      );
    }
    return (
      <div className="px-3 py-1">
        <MessageContent content={node.content} />
      </div>
    );
  }

  if (
    node.role === "user" &&
    node.content.length === 1 &&
    node.content[0].type === "text" &&
    (node.content[0].text.startsWith("<skill_activated") || node.content[0].text.startsWith("<skill_content"))
  ) {
    const nameMatch = node.content[0].text.match(/name="([^"]+)"/);
    const skillName = nameMatch?.[1] ?? "unknown";
    const inner = (
      <div className="flex items-center gap-2 text-xs text-fg-3 py-1 opacity-60">
        <span>{"\u2699"}</span>
        <span>
          Skill loaded: <span className="font-mono text-accent/80">{skillName}</span>
        </span>
      </div>
    );
    return isWide ? (
      <div className="px-4 py-1">
        <div className="max-w-3xl mx-auto">{inner}</div>
      </div>
    ) : (
      <div className="px-3 py-1">{inner}</div>
    );
  }

  if (node.meta === "compact-summary") {
    return <CompactSummaryBubble node={node} variant={variant} />;
  }

  const isUser = node.role === "user";

  const content = (
    <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
      {isUser ? <UserAvatar /> : <AgentAvatar />}

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
              isUser ? "text-warm" : "text-accent"
            }`}
          >
            {isUser ? t("chat.you") : t("chat.agent")}
          </span>
          {footer}
          {actions?.onSwitchBranch && (
            <BranchNavigator
              nodeId={node.id}
              siblings={siblings}
              onSwitch={actions.onSwitchBranch}
            />
          )}
          <div className="opacity-0 group-hover:opacity-100 ml-auto flex items-center gap-0.5 transition-all">
            {!isUser && node.parentId && actions?.onRegenerate && (
              <button
                onClick={() => actions.onRegenerate!(node.parentId!)}
                disabled={isStreaming}
                className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-accent disabled:opacity-30 px-1.5 py-0.5 rounded-md hover:bg-accent/8 transition-all"
                title={t("chat.regenerate")}
              >
                {t("chat.regenerate")}
              </button>
            )}
            {actions?.onBranchFrom && (
              <button
                onClick={() => actions.onBranchFrom!(node.id)}
                className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-accent px-1.5 py-0.5 rounded-md hover:bg-accent/8 transition-all"
                title={t("chat.branchFromHere")}
              >
                {t("chat.fork")}
              </button>
            )}
            {actions?.onDelete && (
              <button
                onClick={() => actions.onDelete!(node.id)}
                disabled={isStreaming}
                className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-danger disabled:opacity-30 px-1.5 py-0.5 rounded-md hover:bg-danger/8 transition-all"
                title={t("chat.delete")}
              >
                {t("chat.delete")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="text-sm text-fg">
          <MessageContent content={node.content} />
        </div>
      </div>
    </div>
  );

  if (isWide) {
    return (
      <div
        className={`group px-4 py-4 animate-fade-slide ${
          isUser ? "" : "bg-surface/40"
        }`}
      >
        <div className="max-w-3xl mx-auto">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group px-3 py-3 animate-fade-slide ${
        isUser ? "" : "bg-surface/40"
      }`}
    >
      {content}
    </div>
  );
}
