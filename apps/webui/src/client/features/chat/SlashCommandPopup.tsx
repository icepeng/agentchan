import { useEffect, useRef } from "react";
import type { SlashEntry } from "./commands.js";
import { optionId } from "./useCommandPalette.js";
import { useI18n } from "@/client/i18n/index.js";

interface SlashCommandPopupProps {
  listboxId: string;
  commands: SlashEntry[];
  selectedIndex: number;
  onSelect: (cmd: SlashEntry) => void;
  onHover: (index: number) => void;
}

export function SlashCommandPopup({
  listboxId,
  commands,
  selectedIndex,
  onSelect,
  onHover,
}: SlashCommandPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const item = container.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const isEmpty = commands.length === 0;

  return (
    <div
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-label={t("slash.listboxLabel")}
      className="absolute bottom-full left-0 right-0 mb-2 bg-elevated/95 backdrop-blur-md border border-edge/12 rounded-xl shadow-xl shadow-void/60 max-h-[240px] overflow-y-auto animate-fade z-50"
    >
      {isEmpty ? (
        <div className="px-4 py-3 text-xs text-fg-3 text-center">{t("slash.noMatches")}</div>
      ) : (
        commands.map((cmd, i) => (
          <button
            key={`${cmd.kind}:${cmd.name}`}
            id={optionId(listboxId, cmd)}
            role="option"
            aria-selected={i === selectedIndex}
            tabIndex={-1}
            data-index={i}
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
            {cmd.kind === "skill" && (
              <span className="text-[10px] uppercase tracking-wider text-accent/70 font-mono px-1.5 py-0.5 rounded bg-accent/10">
                {t("slash.skillTag")}
              </span>
            )}
            {cmd.kind === "local" && cmd.needsArg && cmd.argPlaceholder && (
              <span className="text-[10px] text-fg-3 font-mono opacity-70">{cmd.argPlaceholder}</span>
            )}
          </button>
        ))
      )}
    </div>
  );
}
