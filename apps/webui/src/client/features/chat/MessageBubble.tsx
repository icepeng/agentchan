import { useState, type ReactNode } from "react";
import { AlignLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  AssistantContentBlock,
  CompactionEntry,
  ImageContent,
  Message,
  SessionMessageEntry,
  TextContent,
} from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { formatTokens } from "@/client/shared/pricing.utils.js";
import { UserAvatar, AgentAvatar } from "./Avatars.js";
import { MessageContent } from "./MessageContent.js";

// ── Helpers ─────────────────────────────────────

function getUserContentBlocks(
  entry: SessionMessageEntry,
  override?: string,
): (TextContent | ImageContent)[] {
  if (override !== undefined) return [{ type: "text", text: override }];
  const msg = entry.message as Message;
  if (msg.role !== "user") return [];
  if (typeof msg.content === "string") return [{ type: "text", text: msg.content }];
  return msg.content;
}

// ── Bubble Wrap ───────────────────────────────

export function BubbleWrap({
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
  entryId,
  siblings,
  onSwitch,
}: {
  entryId: string;
  siblings: string[];
  onSwitch: (entryId: string) => void;
}) {
  const currentIndex = siblings.indexOf(entryId);
  if (siblings.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-0.5 text-xs text-fg-3 bg-elevated rounded-full px-1.5 py-0.5 border border-edge/6">
      <button
        onClick={() => {
          const prev = siblings[currentIndex - 1];
          if (prev) onSwitch(prev);
        }}
        disabled={currentIndex === 0}
        className="px-1 hover:text-accent disabled:opacity-20 disabled:cursor-default transition-colors"
      >
        <ChevronLeft size={10} strokeWidth={1.5} />
      </button>
      <span className="px-0.5 text-fg-3 tabular-nums select-none">
        {currentIndex + 1}/{siblings.length}
      </span>
      <button
        onClick={() => {
          const next = siblings[currentIndex + 1];
          if (next) onSwitch(next);
        }}
        disabled={currentIndex === siblings.length - 1}
        className="px-1 hover:text-accent disabled:opacity-20 disabled:cursor-default transition-colors"
      >
        <ChevronRight size={10} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Compaction Banner ────────────────────────

export function CompactionBanner({
  entry,
  variant = "compact",
}: {
  entry: CompactionEntry;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <BubbleWrap variant={variant}>
      <div className="flex items-center gap-2 text-xs text-fg-3 py-1.5">
        <AlignLeft size={14} strokeWidth={2} className="shrink-0 opacity-50" />
        <span className="opacity-70">
          {t("chat.compactSummary")} · {formatTokens(entry.tokensBefore)}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-accent/60 hover:text-accent transition-colors ml-1"
        >
          {expanded ? t("chat.compactHideDetails") : t("chat.compactShowDetails")}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 pl-[22px] text-xs text-fg-3/70 border-l-2 border-edge/10 ml-[6px]">
          <ScrollArea className="max-h-[300px]" viewportClassName="whitespace-pre-wrap text-[11px] leading-relaxed p-2">
            {entry.summary}
          </ScrollArea>
        </div>
      )}
    </BubbleWrap>
  );
}

// ── Skill Chip Bubble ────────────────────────

export function SkillChipBubble({
  skillText,
  variant = "compact",
}: {
  skillText: string;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const skillMatches = [
    ...skillText.matchAll(/<skill_content name="([^"]+)"/g),
  ].map((m) => m[1]);
  const names = skillMatches.length > 0 ? skillMatches : ["unknown"];

  return (
    <BubbleWrap variant={variant} padding="tight">
      <div className="flex items-center gap-2 text-xs text-fg-3 py-1 opacity-70">
        <span>{"⚙"}</span>
        <span>
          {t("chat.skillLoaded")}:{" "}
          <span className="text-accent/80">{names.join(", ")}</span>
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
          <ScrollArea className="max-h-[300px]" viewportClassName="whitespace-pre-wrap text-[11px] leading-relaxed p-2">
            {skillText}
          </ScrollArea>
        </div>
      )}
    </BubbleWrap>
  );
}

// ── Message Bubble ────────────────────────────

export interface MessageBubbleActions {
  onSwitchBranch?: (entryId: string) => void;
  onBranchFrom?: (entryId: string) => void;
  onRegenerate?: (assistantEntryId: string) => void;
}

export interface UserBubbleProps {
  entry: SessionMessageEntry;
  siblings: string[];
  actions?: MessageBubbleActions;
  isStreaming?: boolean;
  variant?: "compact" | "wide";
  footer?: ReactNode;
  /**
   * Override the text rendered inside the bubble. Used by `groupBranch`
   * when a slash-skill activation is split into a `skillLoad` chip plus a
   * trailing user bubble that should only show the command portion.
   */
  displayText?: string;
}

type BubbleKind =
  | { type: "user" }
  | { type: "assistant"; regenerateAssistantId: string | null };

function BubbleShell({
  kind,
  variant,
  siblings,
  anchorEntryId,
  actions,
  isStreaming,
  footer,
  children,
}: {
  kind: BubbleKind;
  variant: "compact" | "wide";
  siblings: string[];
  anchorEntryId: string;
  actions?: MessageBubbleActions;
  isStreaming?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const isWide = variant === "wide";
  const isUser = kind.type === "user";
  const headerLabel = isUser ? t("chat.you") : t("chat.agent");
  const headerLabelClass = isUser ? "text-warm" : "text-accent";

  return (
    <BubbleWrap
      variant={variant}
      padding="loose"
      className={`group ${isUser ? "animate-fade-slide" : "bg-surface/40"}`}
    >
      <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
        {isUser ? <UserAvatar /> : <AgentAvatar />}

        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${headerLabelClass}`}>
              {headerLabel}
            </span>
            {footer}
            {actions?.onSwitchBranch && (
              <BranchNavigator
                entryId={anchorEntryId}
                siblings={siblings}
                onSwitch={actions.onSwitchBranch}
              />
            )}
            <div className="opacity-0 group-hover:opacity-100 ml-auto flex items-center gap-0.5 transition-all">
              {kind.type === "assistant" && kind.regenerateAssistantId && actions?.onRegenerate && (
                <button
                  onClick={() => actions.onRegenerate!(kind.regenerateAssistantId!)}
                  disabled={isStreaming}
                  className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-accent disabled:opacity-30 px-1.5 py-0.5 rounded-md hover:bg-accent/8 transition-all"
                  title={t("chat.regenerate")}
                >
                  {t("chat.regenerate")}
                </button>
              )}
              {actions?.onBranchFrom && (
                <button
                  onClick={() => actions.onBranchFrom!(anchorEntryId)}
                  className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-accent px-1.5 py-0.5 rounded-md hover:bg-accent/8 transition-all"
                  title={t("chat.branchFromHere")}
                >
                  {t("chat.fork")}
                </button>
              )}
            </div>
          </div>

          <div className="text-sm text-fg">{children}</div>
        </div>
      </div>
    </BubbleWrap>
  );
}

export function UserBubble({
  entry,
  siblings,
  actions,
  isStreaming,
  variant = "compact",
  footer,
  displayText,
}: UserBubbleProps) {
  const displayContent: AssistantContentBlock[] = getUserContentBlocks(entry, displayText).map(
    (b): AssistantContentBlock =>
      b.type === "text" ? { type: "text", text: b.text } : { type: "text", text: "[image]" },
  );

  return (
    <BubbleShell
      kind={{ type: "user" }}
      variant={variant}
      siblings={siblings}
      anchorEntryId={entry.id}
      actions={actions}
      isStreaming={isStreaming}
      footer={footer}
    >
      <MessageContent content={displayContent} />
    </BubbleShell>
  );
}

// ── Assistant Turn Bubble ─────────────────────

export interface AssistantTurnBubbleProps {
  entries: SessionMessageEntry[];
  siblings: string[];
  actions?: MessageBubbleActions;
  isStreaming?: boolean;
  variant?: "compact" | "wide";
  footer?: ReactNode;
}

export function AssistantTurnBubble({
  entries,
  siblings,
  actions,
  isStreaming,
  variant = "compact",
  footer,
}: AssistantTurnBubbleProps) {
  const firstAssistant = entries.find((e) => (e.message as Message).role === "assistant");
  const mergedContent: AssistantContentBlock[] = entries.flatMap((e) => {
    const msg = e.message as Message;
    return msg.role === "assistant" ? msg.content : [];
  });

  if (!firstAssistant) return null;

  return (
    <BubbleShell
      kind={{ type: "assistant", regenerateAssistantId: firstAssistant.id }}
      variant={variant}
      siblings={siblings}
      anchorEntryId={firstAssistant.id}
      actions={actions}
      isStreaming={isStreaming}
      footer={footer}
    >
      <MessageContent content={mergedContent} />
    </BubbleShell>
  );
}
