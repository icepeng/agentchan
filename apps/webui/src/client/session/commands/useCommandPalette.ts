import { useId, useState } from "react";
import { MIN_SCORE, scoreEntry, type SlashEntry } from "./commands.js";

export function optionId(listboxId: string, entry: SlashEntry): string {
  return `${listboxId}-${entry.kind}-${entry.name}`;
}

interface UseCommandPaletteArgs {
  text: string;
  setText: (s: string) => void;
  entries: SlashEntry[];
  onSelect: (entry: SlashEntry) => void;
}

export interface CommandPalette {
  /** Palette visible? */
  isOpen: boolean;
  /** Fuzzy-filtered + scored entries, already sorted. */
  items: SlashEntry[];
  /** Highlighted index (clamped into items range). */
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  /** aria ids for listbox + aria-activedescendant wiring. */
  listboxId: string;
  activeOptionId: string | undefined;
  /** Handles ArrowUp/Down/Enter/Tab/Escape. Returns true when event was consumed. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

export function useCommandPalette({
  text,
  setText,
  entries,
  onSelect,
}: UseCommandPaletteArgs): CommandPalette {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listboxId = useId();

  const query = text.startsWith("/") ? text.slice(1).toLowerCase() : "";
  const isOpen = text.startsWith("/") && !query.includes(" ");

  const items: SlashEntry[] = isOpen
    ? entries
        .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
        .filter((x) => x.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.entry)
    : [];

  const clampedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0));
  const activeOptionId = items[clampedIndex] ? optionId(listboxId, items[clampedIndex]) : undefined;

  const handleKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!isOpen) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      setText("");
      setSelectedIndex(0);
      return true;
    }

    // Empty-result state: consume nav keys so stray Enter doesn't submit.
    if (items.length === 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab") {
        e.preventDefault();
        return true;
      }
      return false;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      case "Enter":
      case "Tab": {
        e.preventDefault();
        const selected = items[clampedIndex];
        if (selected) onSelect(selected);
        setSelectedIndex(0);
        return true;
      }
      default:
        return false;
    }
  };

  return {
    isOpen,
    items,
    selectedIndex: clampedIndex,
    setSelectedIndex,
    listboxId,
    activeOptionId,
    handleKeyDown,
  };
}
