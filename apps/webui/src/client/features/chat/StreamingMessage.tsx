import { useActiveAgentState } from "@/client/entities/agent-state/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { parseInlineMarkdown } from "@/client/shared/inlineMarkdown.js";
import { BubbleWrap } from "./MessageBubble.js";
import { AgentAvatar } from "./Avatars.js";
import { MessageContent } from "./MessageContent.js";
import { useSentenceAnimation } from "./useSentenceAnimation.js";

function Sentence({ text, animating }: { text: string; animating: boolean }) {
  return (
    <span className={animating ? "animate-sentence-fade" : undefined}>
      {parseInlineMarkdown(text)}
    </span>
  );
}

/**
 * 스트리밍 중 in-flight 어시스턴트 버블. `state.streamingMessage.content`를
 * `MessageContent`로 그대로 그려, 완료 후 `AssistantTurnBubble`이 그리는 순서와
 * 동일한 path를 공유한다 — 이게 "텍스트 위 / 툴 아래" 하드코딩으로 인한 플리커를
 * 제거하는 핵심.
 *
 * 마지막 content block이 text인 경우(스트림 끝쪽이 텍스트일 때) 그 부분에만
 * sentence animation을 적용한다. 그 외 블록은 `MessageContent` 통합 경로로.
 */
export function StreamingMessage({ variant = "compact" }: { variant?: "compact" | "wide" }) {
  const state = useActiveAgentState();
  const { t } = useI18n();

  const isWide = variant === "wide";
  const content = state.streamingMessage?.content ?? [];
  const lastBlock = content.length > 0 ? content[content.length - 1] : null;
  const liveText = lastBlock?.type === "text" ? lastBlock.text : "";

  const { confirmedSentences, animatingIndices } = useSentenceAnimation(
    liveText,
    state.isStreaming,
  );

  if (state.errorMessage) {
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
              <p className="leading-relaxed">{state.errorMessage}</p>
              <p className="text-xs text-fg-3 mt-1">{t("chat.streamErrorRetry")}</p>
            </div>
          </div>
        </div>
      </BubbleWrap>
    );
  }

  if (!state.isStreaming && !state.streamingMessage) return null;

  const showCursor = lastBlock?.type === "text";
  const head = lastBlock?.type === "text" ? content.slice(0, -1) : content;

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
            <MessageContent content={head} runningToolIds={state.pendingToolCalls} />
            {showCursor && (
              <div className="whitespace-pre-wrap break-words leading-relaxed">
                {confirmedSentences.map((sentence, i) => (
                  <Sentence
                    key={i}
                    text={sentence}
                    animating={animatingIndices.has(i)}
                  />
                ))}
                <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 rounded-full animate-blink" />
              </div>
            )}
          </div>
        </div>
      </div>
    </BubbleWrap>
  );
}
