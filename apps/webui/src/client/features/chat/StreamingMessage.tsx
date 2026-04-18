import { useActiveStream } from "@/client/entities/stream/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { parseInlineMarkdown } from "@/client/shared/inlineMarkdown.js";
import { BubbleWrap } from "./MessageBubble.js";
import { AgentAvatar } from "./Avatars.js";
import { StreamingToolCall } from "./ToolCallDisplay.js";
import { useSentenceAnimation } from "./useSentenceAnimation.js";

function Sentence({ text, animating }: { text: string; animating: boolean }) {
  return (
    <span className={animating ? "animate-sentence-fade" : undefined}>
      {parseInlineMarkdown(text)}
    </span>
  );
}

export function StreamingMessage({ variant = "compact" }: { variant?: "compact" | "wide" }) {
  const stream = useActiveStream();
  const { t } = useI18n();
  const { confirmedSentences, animatingIndices } =
    useSentenceAnimation(stream.streamingText, stream.isStreaming);

  const isWide = variant === "wide";

  if (stream.streamError) {
    return (
      <BubbleWrap variant={variant} padding="loose" className="bg-danger/5 border-l-2 border-danger/30 animate-fade">
        <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
          <AgentAvatar />
          <div className="flex-1 min-w-0">
            <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
              <span className="text-[11px] font-semibold text-danger uppercase tracking-[0.1em]">
                {t("chat.streamError")}
              </span>
            </div>
            <div className="text-sm text-danger/80">
              <p className="leading-relaxed">{stream.streamError}</p>
              <p className="text-xs text-fg-3 mt-1">{t("chat.streamErrorRetry")}</p>
            </div>
          </div>
        </div>
      </BubbleWrap>
    );
  }

  if (!stream.isStreaming) return null;

  const hasText = confirmedSentences.length > 0;
  const showCursor = stream.streamingToolCalls.length === 0;

  return (
    <BubbleWrap variant={variant} padding="loose" className="bg-surface/40 animate-fade">
      <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
        <AgentAvatar />
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
            <span className="text-[11px] font-semibold text-accent uppercase tracking-[0.1em]">
              {t("chat.agent")}
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-glow" />
          </div>
          <div className="text-sm text-fg">
            {hasText && (
              <div className="whitespace-pre-wrap break-words leading-relaxed">
                {confirmedSentences.map((sentence, i) => (
                  <Sentence
                    key={i}
                    text={sentence}
                    animating={animatingIndices.has(i)}
                  />
                ))}
                {showCursor && (
                  <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 rounded-full animate-blink" />
                )}
              </div>
            )}
            {stream.streamingToolCalls.map((tc) => (
              <StreamingToolCall key={tc.id} tc={tc} />
            ))}
          </div>
        </div>
      </div>
    </BubbleWrap>
  );
}
