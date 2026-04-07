import type { ContentBlock } from "@/client/entities/session/index.js";
import { ToolCallDisplay, ToolResultDisplay } from "./ToolCallDisplay.js";

export function MessageContent({ content }: { content: ContentBlock[] }) {
  return (
    <>
      {content.map((block, i) => {
        switch (block.type) {
          case "text": {
            // Prefer displayText (e.g. raw "/skillname" the user typed)
            // over the expanded body that the model received.
            const text = block.displayText ?? block.text;
            return (
              <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                {text}
              </div>
            );
          }
          case "tool_use":
            return <ToolCallDisplay key={i} block={block} />;
          case "tool_result":
            return <ToolResultDisplay key={i} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}
