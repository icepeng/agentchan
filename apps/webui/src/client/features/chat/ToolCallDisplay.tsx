import type { ToolCallContent, ToolCallState } from "@/client/entities/session/index.js";
import { Indicator } from "@/client/shared/ui/index.js";

export function ToolCallDisplay({ block }: { block: ToolCallContent }) {
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-edge/6 bg-elevated/50">
      <div className="px-3 py-2 border-b border-edge/4 flex items-center gap-2">
        <Indicator />
        <span className="font-mono text-xs text-accent font-medium">{block.name}</span>
      </div>
      <pre className="px-3 py-2.5 text-xs text-fg-3 overflow-x-auto max-h-40 font-mono leading-relaxed">
        {JSON.stringify(block.arguments, null, 2)}
      </pre>
    </div>
  );
}

export function StreamingToolCall({ tc }: { tc: ToolCallState }) {
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-edge/6 bg-elevated/50 animate-fade">
      <div className="px-3 py-2 border-b border-edge/4 flex items-center gap-2">
        <Indicator />
        <span className="font-mono text-xs text-accent font-medium">{tc.name}</span>
        {!tc.done && (
          <Indicator pulse />
        )}
      </div>
      {tc.inputJson && (
        <pre className="px-3 py-2.5 text-xs text-fg-3 overflow-x-auto max-h-40 font-mono leading-relaxed">
          {tc.inputJson}
        </pre>
      )}
    </div>
  );
}
