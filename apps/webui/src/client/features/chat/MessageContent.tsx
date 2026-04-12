import type { AssistantContentBlock } from "@/client/entities/session/index.js";
import { parseInlineMarkdown } from "@/client/shared/inlineMarkdown.js";
import { ToolCallDisplay } from "./ToolCallDisplay.js";

export function MessageContent({ content }: { content: AssistantContentBlock[] }) {
  return (
    <>
      {content.map((block, i) => {
        switch (block.type) {
          case "text":
            return (
              <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                {parseInlineMarkdown(block.text)}
              </div>
            );
          case "toolCall":
            return <ToolCallDisplay key={i} block={block} />;
          case "thinking":
            return (
              <details key={i} className="my-2 text-fg-3/60">
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
