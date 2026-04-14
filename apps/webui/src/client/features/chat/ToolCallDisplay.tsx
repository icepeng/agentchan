import type { ToolCallContent, ToolCallState } from "@/client/entities/session/index.js";
import { Indicator, ScrollArea } from "@/client/shared/ui/index.js";

const SUMMARY_CLASS =
  "px-3 py-2 flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden";
const CHEVRON_CLASS =
  "ml-auto w-3 h-3 text-fg-4 transition-transform duration-150 group-open:rotate-90";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={CHEVRON_CLASS}
    >
      <path d="M4.5 2.5 L8 6 L4.5 9.5" />
    </svg>
  );
}

export function ToolCallDisplay({ block }: { block: ToolCallContent }) {
  return (
    <details className="group my-3 rounded-xl overflow-hidden border border-edge/6 bg-elevated/50">
      <summary className={SUMMARY_CLASS}>
        <Indicator />
        <span className="font-mono text-xs text-accent font-medium">{block.name}</span>
        <Chevron />
      </summary>
      <ScrollArea orientation="horizontal" className="max-h-40 border-t border-edge/4">
        <pre className="px-3 py-2.5 text-xs text-fg-3 font-mono leading-relaxed">
          {JSON.stringify(block.arguments, null, 2)}
        </pre>
      </ScrollArea>
    </details>
  );
}

export function StreamingToolCall({ tc }: { tc: ToolCallState }) {
  return (
    <details className="group my-3 rounded-xl overflow-hidden border border-edge/6 bg-elevated/50 animate-fade">
      <summary className={SUMMARY_CLASS}>
        <Indicator />
        <span className="font-mono text-xs text-accent font-medium">{tc.name}</span>
        {!tc.done && <Indicator pulse />}
        <Chevron />
      </summary>
      {tc.inputJson && (
        <ScrollArea orientation="horizontal" className="max-h-40 border-t border-edge/4">
          <pre className="px-3 py-2.5 text-xs text-fg-3 font-mono leading-relaxed">
            {tc.inputJson}
          </pre>
        </ScrollArea>
      )}
    </details>
  );
}
