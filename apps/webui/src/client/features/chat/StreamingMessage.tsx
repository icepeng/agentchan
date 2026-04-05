import { useSessionState } from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { AgentAvatar } from "./Avatars.js";
import { StreamingToolCall } from "./ToolCallDisplay.js";

interface StreamingMessageProps {
  variant?: "compact" | "wide";
}

export function StreamingMessage({ variant = "compact" }: StreamingMessageProps) {
  const session = useSessionState();
  const { t } = useI18n();

  const isWide = variant === "wide";

  const wrap = (bg: string, children: React.ReactNode) => {
    const cls = `${isWide ? "px-4 py-4" : "px-3 py-3"} ${bg} animate-fade`;
    return isWide ? (
      <div className={cls}><div className="max-w-3xl mx-auto">{children}</div></div>
    ) : (
      <div className={cls}>{children}</div>
    );
  };

  if (session.streamError) {
    return wrap("bg-danger/5 border-l-2 border-danger/30",
      <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
        <AgentAvatar />
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
            <span className="text-[11px] font-semibold text-danger uppercase tracking-[0.1em]">
              {t("chat.streamError")}
            </span>
          </div>
          <div className="text-sm text-danger/80">
            <p className="leading-relaxed">{session.streamError}</p>
            <p className="text-xs text-fg-3 mt-1">{t("chat.streamErrorRetry")}</p>
          </div>
        </div>
      </div>,
    );
  }

  if (
    !session.isStreaming &&
    !session.streamingText &&
    session.streamingToolCalls.length === 0
  ) {
    return null;
  }

  return wrap("bg-surface/40",
    <div className={`flex items-start ${isWide ? "gap-3" : "gap-2.5"}`}>
      <AgentAvatar />
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 ${isWide ? "mb-1.5" : "mb-1"}`}>
          <span className="text-[11px] font-semibold text-accent uppercase tracking-[0.1em]">
            {t("chat.agent")}
          </span>
          {session.isStreaming && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-glow" />
          )}
        </div>
        <div className="text-sm text-fg">
          {session.streamingText && (
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {session.streamingText}
              {session.isStreaming &&
                session.streamingToolCalls.length === 0 && (
                  <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 rounded-full animate-blink" />
                )}
            </div>
          )}
          {session.streamingToolCalls.map((tc) => (
            <StreamingToolCall key={tc.id} tc={tc} />
          ))}
        </div>
      </div>
    </div>,
  );
}
