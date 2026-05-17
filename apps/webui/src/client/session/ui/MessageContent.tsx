import type { AssistantContentBlock } from "@/client/session/data/index.js";
import { parseInlineMarkdown } from "@/client/session/ui/inlineMarkdown.js";
import { ToolCallDisplay } from "./ToolCallDisplay.js";

/**
 * Render an assistant message's `content` array in canonical pi order.
 *
 * Streaming and persisted paths share this single component, which is what
 * eliminates the legacy "text-above-tools" reflow flicker — the partial
 * AssistantMessage that arrives mid-stream uses the same iteration as the
 * final persisted one.
 *
 * `pendingToolCalls` (optional) marks toolCall blocks whose execution is still
 * pending so `ToolCallDisplay` can show the pulse indicator. Persisted bubbles
 * pass nothing (every tool has already completed).
 */
export function MessageContent({
  content,
  pendingToolCalls,
}: {
  content: ReadonlyArray<AssistantContentBlock>;
  pendingToolCalls?: ReadonlySet<string>;
}) {
  return (
    <>
      {content.map((block, i) => {
        switch (block.type) {
          case "text":
            return (
              <div key={`text-${i}`} className="whitespace-pre-wrap break-words leading-relaxed">
                {parseInlineMarkdown(block.text)}
              </div>
            );
          case "toolCall":
            return (
              <ToolCallDisplay
                key={`tc-${block.id}`}
                block={block}
                running={pendingToolCalls?.has(block.id) ?? false}
              />
            );
          case "thinking":
            return (
              <details key={`thinking-${i}`} className="my-2 text-fg-3/60">
                <summary className="text-xs cursor-pointer select-none">thinking…</summary>
                <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed pl-2 border-l border-edge/10">
                  {block.thinking}
                </div>
              </details>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
