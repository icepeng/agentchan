import { useState, useMemo, useCallback } from "react";
import { useConfigDispatch, updateConfig } from "@/client/entities/config/index.js";
import { useSkillState } from "@/client/entities/skill/index.js";
import { useConversation } from "./useConversation.js";
import { COMMANDS, type SlashCommand } from "./commands.js";

export function useSlashCommands(text: string, setText: (s: string) => void) {
  const configDispatch = useConfigDispatch();
  const skillState = useSkillState();
  const { create, compact } = useConversation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const query = text.startsWith("/") ? text.slice(1) : "";
  const isOpen = text.startsWith("/") && !query.includes(" ");

  // Built-in commands + slash-invocable project skills.
  // Always-active skills are intentionally hidden from autocomplete: their
  // body is already in the system prompt and re-injecting via slash would be
  // redundant. The server's findSlashInvocableSkill enforces the same rule.
  const allCommands = useMemo<SlashCommand[]>(() => {
    const skillCommands: SlashCommand[] = skillState.skills
      .filter((s) => !s.alwaysActive)
      .map((s) => ({
        name: s.name,
        description: s.description,
        needsArg: false,
        isSkill: true,
      }));
    return [...COMMANDS, ...skillCommands];
  }, [skillState.skills]);

  const filteredCommands = useMemo(() => {
    if (!isOpen) return [];
    if (query === "") return allCommands;
    return allCommands.filter((cmd) => cmd.name.startsWith(query.toLowerCase()));
  }, [isOpen, query, allCommands]);

  // Clamp selectedIndex when filtered list changes
  const clampedIndex = Math.min(selectedIndex, Math.max(filteredCommands.length - 1, 0));

  const executeCommand = useCallback(
    async (name: string, arg: string) => {
      switch (name) {
        case "new":
        case "clear":
          await create();
          break;
        case "compact":
          await compact();
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
        case "help":
          // Show full command list by setting text to "/"
          setText("/");
          return;
      }
      setText("");
    },
    [create, compact, configDispatch, setText],
  );

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      if (cmd.isSkill) {
        // Skills are dispatched server-side. Just fill the input with
        // "/name " so the user can either add args or press Enter.
        setText("/" + cmd.name + " ");
      } else if (cmd.needsArg) {
        setText("/" + cmd.name + " ");
      } else {
        void executeCommand(cmd.name, "");
      }
      setSelectedIndex(0);
    },
    [executeCommand, setText],
  );

  const tryExecuteCommand = useCallback(
    (input: string): boolean => {
      if (!input.startsWith("/")) return false;

      const withoutSlash = input.slice(1).trim();
      const spaceIdx = withoutSlash.indexOf(" ");
      const cmdName = spaceIdx >= 0 ? withoutSlash.slice(0, spaceIdx) : withoutSlash;
      const arg = spaceIdx >= 0 ? withoutSlash.slice(spaceIdx + 1).trim() : "";

      const cmd = COMMANDS.find((c) => c.name === cmdName);
      if (!cmd) return false;
      if (cmd.needsArg && !arg) return false;

      void executeCommand(cmdName, arg);
      return true;
    },
    [executeCommand],
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
