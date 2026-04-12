import { useState, useMemo, useCallback } from "react";
import { useConfigDispatch, updateConfig } from "@/client/entities/config/index.js";
import { useSkillState } from "@/client/entities/skill/index.js";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useConversation } from "./useConversation.js";
import { buildSlashEntries, LOCAL_COMMANDS, type SlashEntry } from "./commands.js";

export function useSlashCommands(text: string, setText: (s: string) => void) {
  const configDispatch = useConfigDispatch();
  const skillState = useSkillState();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { create, compact } = useConversation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const query = text.startsWith("/") ? text.slice(1) : "";
  const isOpen = text.startsWith("/") && !query.includes(" ");

  const entries = useMemo(
    () => buildSlashEntries(skillState.skills),
    [skillState.skills],
  );

  const filteredCommands = useMemo<SlashEntry[]>(() => {
    if (!isOpen) return [];
    if (query === "") return entries;
    return entries.filter((cmd) => cmd.name.startsWith(query.toLowerCase()));
  }, [isOpen, query, entries]);

  // Clamp selectedIndex when filtered list changes
  const clampedIndex = Math.min(selectedIndex, Math.max(filteredCommands.length - 1, 0));

  const executeLocalCommand = useCallback(
    async (name: string, arg: string) => {
      switch (name) {
        case "new":
          await create();
          break;
        case "compact":
          await compact();
          break;
        case "edit":
          uiDispatch({ type: "SET_VIEW_MODE", mode: ui.viewMode === "edit" ? "chat" : "edit" });
          break;
        case "model": {
          const result = await updateConfig({ model: arg });
          configDispatch({ type: "SET_CONFIG", provider: result.provider, model: result.model });
          break;
        }
        case "provider": {
          const result = await updateConfig({ provider: arg });
          configDispatch({ type: "SET_CONFIG", provider: result.provider, model: result.model });
          break;
        }
      }
      setText("");
    },
    [create, compact, configDispatch, uiDispatch, ui.viewMode, setText],
  );

  const selectCommand = useCallback(
    (cmd: SlashEntry) => {
      // Skill commands always allow free-form args; local commands ask
      // explicitly via needsArg. Both cases just prefill the textbox.
      const needsTextInsert = cmd.kind === "skill" || cmd.needsArg;
      if (needsTextInsert) setText("/" + cmd.name + " ");
      else void executeLocalCommand(cmd.name, "");
      setSelectedIndex(0);
    },
    [executeLocalCommand, setText],
  );

  const tryExecuteCommand = useCallback(
    (input: string): boolean => {
      if (!input.startsWith("/")) return false;

      const withoutSlash = input.slice(1).trim();
      const spaceIdx = withoutSlash.indexOf(" ");
      const cmdName = spaceIdx >= 0 ? withoutSlash.slice(0, spaceIdx) : withoutSlash;
      const arg = spaceIdx >= 0 ? withoutSlash.slice(spaceIdx + 1).trim() : "";

      const local = LOCAL_COMMANDS.find((c) => c.name === cmdName);
      if (!local) return false; // skill commands fall through to send()
      if (local.needsArg && !arg) return false;

      void executeLocalCommand(cmdName, arg);
      return true;
    },
    [executeLocalCommand],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || filteredCommands.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredCommands.length);
          return true;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
          return true;
        case "Enter":
        case "Tab":
          e.preventDefault();
          selectCommand(filteredCommands[clampedIndex]);
          return true;
        case "Escape":
          e.preventDefault();
          setText("");
          setSelectedIndex(0);
          return true;
        default:
          return false;
      }
    },
    [isOpen, filteredCommands, clampedIndex, selectCommand, setText],
  );

  return {
    isOpen,
    filteredCommands,
    selectedIndex: clampedIndex,
    handleKeyDown,
    selectCommand,
    tryExecuteCommand,
    setSelectedIndex,
  };
}
