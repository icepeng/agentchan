import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  CompactionEntry,
  SessionMessageEntry,
  TextContent,
  ThinkingContent,
  ToolCall,
} from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { parseBlockMarkdown } from "@/client/shared/blockMarkdown.js";
import { formatTokens } from "@/client/shared/pricing.utils.js";
import { UserAvatar, AgentAvatar } from "./Avatars.js";
import { MessageContent } from "./MessageContent.js";

// ── Helpers ─────────────────────────────────────

/** Extract text from a user message's content (string or array of text blocks). */
function getUserText(entry: SessionMessageEntry): string {
  const msg = entry.message;
  if (msg.role !== "user") return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

interface ParsedSkillContent {
  name: string;
  content: string;
  userMessage: string | undefined;
}

function parseSkillContent(text: string): ParsedSkillContent | null {
  const match = text.match(/^<skill_content name="([^"]+)">\n([\s\S]*?)\n<\/skill_content>(?:\n\n([\s\S]+))?$/);
  if (!match) return null;
  return {
    name: match[1]!,
    content: match[2]!,
    userMessage: match[3]?.trim() || undefined,
  };
}

function formatSerializedCommandForDisplay(text: string): string {
  const match = text.match(/^<command-name>\/([^<]+)<\/command-name>(?:\n<command-args>([\s\S]*)<\/command-args>)?$/);
  if (!match) return text;
  const name = match[1]!;
  const args = match[2]?.trim();
  return args ? `/${name} ${args}` : `/${name}`;
}

function SkillInvocationBlock({ skill }: { skill: ParsedSkillContent }) {
  const { t } = useI18n();
  return (
    <details className="mb-2 rounded-md border border-accent/12 bg-accent/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none text-accent">
        {t("chat.skillLoaded")}: {skill.name}
      </summary>
      <div className="mt-2 max-h-64 overflow-auto border-t border-accent/10 pt-2 text-fg-2">
        {parseBlockMarkdown(skill.content)}
      </div>
    </details>
  );
}

// ── Bubble Wrap ───────────────────────────────
// All chat bubbles share the same outer wrapper rules. Wide variant adds a
// max-w-3xl content column; padding is "tight" (py-1) for chips/summaries
// or "loose" (py-3/py-4) for full message rows.

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
  onSwitch: (leafId: string) => void;
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

// ── Message Bubble ────────────────────────────

export interface MessageBubbleActions {
  onSelectLeaf?: (leafId: string) => void;
  onBranchFrom?: (entryId: string) => void;
  onRegenerate?: (entryId: string) => void;
}

export interface MessageBubbleProps {
  entry: SessionMessageEntry;
  siblings: string[];
  actions?: MessageBubbleActions;
  isStreaming?: boolean;
  variant?: "compact" | "wide";
  footer?: ReactNode;
}

type BubbleKind =
  | { type: "user" }
  | { type: "assistant"; regenerateFromId: string | null };

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
            {actions?.onSelectLeaf && (
              <BranchNavigator
                entryId={anchorEntryId}
                siblings={siblings}
                onSwitch={actions.onSelectLeaf}
              />
            )}
            <div className="opacity-0 group-hover:opacity-100 ml-auto flex items-center gap-0.5 transition-all">
              {kind.type === "assistant" && kind.regenerateFromId && actions?.onRegenerate && (
                <button
                  onClick={() => actions.onRegenerate!(kind.regenerateFromId!)}
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

export function MessageBubble({
  entry,
  siblings,
  actions,
  isStreaming,
  variant = "compact",
  footer,
}: MessageBubbleProps) {
  const role = entry.message.role;

  if (role !== "user") return null;

  const userText = getUserText(entry);
  const skill = parseSkillContent(userText);
  const visibleText = skill?.userMessage
    ? formatSerializedCommandForDisplay(skill.userMessage)
    : skill
      ? ""
      : userText;
  const displayContent: Array<TextContent | ThinkingContent | ToolCall> = [
    { type: "text" as const, text: visibleText ?? "" },
  ];

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
      {skill && <SkillInvocationBlock skill={skill} />}
      {visibleText && <MessageContent content={displayContent} />}
    </BubbleShell>
  );
}

export function CompactionBubble({
  entry,
  variant = "compact",
}: {
  entry: CompactionEntry;
  variant?: "compact" | "wide";
}) {
  const { t } = useI18n();
  return (
    <BubbleWrap variant={variant} padding="tight" className="bg-accent/4">
      <details className="max-w-3xl mx-auto rounded-md border border-accent/10 bg-surface/70 px-3 py-2 text-xs text-fg-2">
        <summary className="cursor-pointer select-none text-accent">
          {t("chat.compactSummary")} · {formatTokens(entry.tokensBefore)}
        </summary>
        <div className="mt-2 border-t border-accent/10 pt-2">
          {parseBlockMarkdown(entry.summary)}
        </div>
      </details>
    </BubbleWrap>
  );
}

// ── Assistant Turn Bubble ─────────────────────
// Renders one or more consecutive assistant/toolResult entries as a single bubble
// so that post-stream rendering matches the streaming UX (all tool calls in one
// agent block). toolResult entries contribute no content; they're retained in the
// group only so actions/boundaries line up with the entry graph.

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
  const firstAssistant = entries.find((entry) => entry.message.role === "assistant");
  const mergedContent: Array<TextContent | ThinkingContent | ToolCall> = entries.flatMap((entry) =>
    entry.message.role === "assistant" ? entry.message.content : [],
  );

  if (!firstAssistant) return null;

  return (
    <BubbleShell
      kind={{ type: "assistant", regenerateFromId: firstAssistant.parentId }}
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
