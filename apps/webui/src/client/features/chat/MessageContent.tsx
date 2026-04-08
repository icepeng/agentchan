import type { ContentBlock } from "@/client/entities/session/index.js";
import { ToolCallDisplay, ToolResultDisplay } from "./ToolCallDisplay.js";

export function MessageContent({ content }: { content: ContentBlock[] }) {
  return (
    <>
      {content.map((block, i) => {
        switch (block.type) {
          case "text":
            return (
              <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                {block.text}
              </div>
            );
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
