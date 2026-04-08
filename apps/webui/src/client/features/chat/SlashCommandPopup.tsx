import { useEffect, useRef } from "react";
import type { SlashEntry } from "./commands.js";

interface SlashCommandPopupProps {
  commands: SlashEntry[];
  selectedIndex: number;
  onSelect: (cmd: SlashEntry) => void;
  onHover: (index: number) => void;
}

export function SlashCommandPopup({ commands, selectedIndex, onSelect, onHover }: SlashCommandPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const item = container.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-elevated border border-white/8 rounded-xl shadow-lg shadow-void/50 overflow-y-auto max-h-[240px] animate-fade z-50"
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => onHover(i)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            i === selectedIndex
              ? "bg-accent/10 text-accent"
              : "text-fg-2 hover:bg-white/4"
          }`}
        >
          <span className="font-mono text-sm">/{cmd.name}</span>
          <span className="text-xs text-fg-3 flex-1 truncate">{cmd.description}</span>
          {cmd.source !== "local" && (
            <span className="text-[10px] text-fg-3 font-mono uppercase tracking-wider opacity-70">{cmd.source}</span>
          )}
          {cmd.source === "local" && cmd.needsArg && cmd.argPlaceholder && (
            <span className="text-[10px] text-fg-3 font-mono opacity-70">{cmd.argPlaceholder}</span>
          )}
        </button>
      ))}
    </div>
  );
}
