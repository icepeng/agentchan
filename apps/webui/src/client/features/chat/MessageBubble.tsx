import { useMemo, useState, type ReactNode } from "react";
import { AlignLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { TreeNode } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { UserAvatar, AgentAvatar } from "./Avatars.js";
import { MessageContent } from "./MessageContent.js";

// ── Bubble Wrap ───────────────────────────────
// All chat bubbles share the same outer wrapper rules. Wide variant adds a
// max-w-3xl content column; padding is "tight" (py-1) for chips/summaries
// or "loose" (py-3/py-4) for full message rows.

function BubbleWrap({
  variant,
  padding = "tight",
  className = "",
  children,
}: {
  variant: "compact" | "wide";
  padding?: "tight" | "loose";
  className?: string;
  children: ReactNode;
}) {
  if (variant === "wide") {
    const py = padding === "loose" ? "py-4" : "py-1";
    return (
      <div className={`px-4 ${py} ${className}`.trimEnd()}>
        <div className="max-w-3xl mx-auto">{children}</div>
      </div>
    );
  }
  const py = padding === "loose" ? "py-3" : "py-1";
  return <div className={`px-3 ${py} ${className}`.trimEnd()}>{children}</div>;
}

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
        <ChevronLeft size={10} strokeWidth={1.5} />
      </button>
      <span className="px-0.5 text-fg-3 tabular-nums select-none">
        {currentIndex + 1}/{siblings.length}
      </span>
      <button
        onClick={() => onSwitch(siblings[currentIndex + 1])}
        disabled={currentIndex === siblings.length - 1}
        className="px-1 hover:text-accent disabled:opacity-20 disabled:cursor-default transition-colors"
      >
        <ChevronRight size={10} strokeWidth={1.5} />
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

  return (
    <BubbleWrap variant={variant}>
      <div className="flex items-center gap-2 text-xs text-fg-3 py-1.5">
        <AlignLeft size={14} strokeWidth={2} className="shrink-0 opacity-50" />
        <span className="opacity-70">{t("chat.compactSummary")}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-accent/60 hover:text-accent transition-colors ml-1"
        >
          {expanded ? t("chat.compactHideDetails") : t("chat.compactShowDetails")}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 pl-[22px] text-xs text-fg-3/70 border-l-2 border-edge/10 ml-[6px]">
          <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed p-2">
            <MessageContent content={node.content} />
          </div>
        </div>
      )}
    </BubbleWrap>
  );
}

// ── Skill Chip Bubble ────────────────────────
// Renders any user node tagged `meta: "skill-load"` — covers all three
// injection paths (always-active seed, slash invocation chip, activate_skill
// steer). The chip extracts skill names from the canonical
// `<skill_content name="...">` blocks for the header label.

function SkillChipBubble({
  node,
  variant = "compact",
}: {
  node: TreeNode;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const firstText =
    node.content[0]?.type === "text" ? node.content[0].text : "";
  const names = useMemo(() => {
    const matches = [...firstText.matchAll(/<skill_content name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    return matches.length > 0 ? matches : ["unknown"];
  }, [firstText]);

  return (
    <BubbleWrap variant={variant}>
      <div className="flex items-center gap-2 text-xs text-fg-3 py-1 opacity-70">
        <span>{"\u2699"}</span>
        <span>
          {t("chat.skillLoaded")}:{" "}
          <span className="font-mono text-accent/80">{names.join(", ")}</span>
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-accent/60 hover:text-accent transition-colors ml-1"
        >
          {expanded ? t("chat.hideBody") : t("chat.showBody")}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 pl-[22px] text-xs text-fg-3/70 border-l-2 border-edge/10 ml-[6px]">
          <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed p-2">
            <MessageContent content={node.content} />
          </div>
        </div>
      )}
    </BubbleWrap>
  );
}

// ── Slash Invocation Bubble ──────────────────
// Body is now in a sibling skill-load node (rendered by SkillChipBubble),
// so this bubble only needs to display the parsed `/name args` line.

function SlashInvocationBubble({
  node,
  variant = "compact",
}: {
  node: TreeNode;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  const firstBlock = node.content[0];
  const text =
    firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
  const { name, args } = useMemo(() => {
    const m = text.match(
      /^<command-name>\/([a-z0-9][a-z0-9-]*)<\/command-name>(?:\s*<command-args>([\s\S]*?)<\/command-args>)?/,
    );
    return { name: m?.[1] ?? "unknown", args: m?.[2] ?? "" };
  }, [text]);

  return (
    <BubbleWrap variant={variant} padding="loose" className="group animate-fade-slide">
      <div className="flex items-start gap-2.5">
        <UserAvatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-warm">
              {t("chat.you")}
            </span>
          </div>
          <div className="text-sm text-fg">
            <span className="font-mono text-accent">/{name}</span>
            {args && <span className="ml-1 whitespace-pre-wrap">{args}</span>}
          </div>
        </div>
      </div>
    </BubbleWrap>
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
    return (
      <BubbleWrap variant={variant}>
        <MessageContent content={node.content} />
      </BubbleWrap>
    );
  }

  // skill-catalog is conversation infrastructure (the <system-reminder>-wrapped
  // skill catalog injected at session start). Not user-visible.
  if (node.role === "user" && node.meta === "skill-catalog") {
    return null;
  }

  if (node.role === "user" && node.meta === "skill-load") {
    return <SkillChipBubble node={node} variant={variant} />;
  }

  if (
    node.role === "user" &&
    node.content[0]?.type === "text" &&
    node.content[0].text.startsWith("<command-name>")
  ) {
    return <SlashInvocationBubble node={node} variant={variant} />;
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

  return (
    <BubbleWrap
      variant={variant}
      padding="loose"
      className={`group animate-fade-slide ${isUser ? "" : "bg-surface/40"}`}
    >
      {content}
    </BubbleWrap>
  );
}
