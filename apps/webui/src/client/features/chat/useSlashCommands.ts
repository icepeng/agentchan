import { useConfigMutations } from "@/client/entities/config/index.js";
import { useSkills } from "@/client/entities/skill/index.js";
import {
  useSessions,
  useActiveSessionSelection,
} from "@/client/entities/session/index.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useSession } from "./useSession.js";
import { useStreaming } from "./useStreaming.js";
import { buildSlashEntries, LOCAL_COMMANDS, type SlashEntry, type SkillSlashCommand } from "./commands.js";
import { useCommandPalette } from "./useCommandPalette.js";

export function useSlashCommands(text: string, setText: (s: string) => void) {
  const { update: updateConfig } = useConfigMutations();
  const selection = useActiveSessionSelection();
  const { activeProjectSlug } = useProjectSelectionState();
  const { data: skills = [] } = useSkills(activeProjectSlug);
  const { data: sessions = [] } = useSessions(activeProjectSlug);
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { create, compact } = useSession();
  const { send } = useStreaming();

  const entries = buildSlashEntries(skills);

  const executeLocalCommand = async (name: string, arg: string) => {
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
      case "readme":
        uiDispatch({ type: "OPEN_README" });
        break;
      case "model": {
        await updateConfig({ model: arg });
        break;
      }
      case "provider": {
        await updateConfig({ provider: arg });
        break;
      }
    }
    setText("");
  };

  const selectCommand = (cmd: SlashEntry) => {
    // Skill commands always allow free-form args; local commands ask
    // explicitly via needsArg. Both cases just prefill the textbox.
    const needsTextInsert = cmd.kind === "skill" || cmd.needsArg;
    if (needsTextInsert) setText("/" + cmd.name + " ");
    else void executeLocalCommand(cmd.name, "");
  };

  const palette = useCommandPalette({ text, setText, entries, onSelect: selectCommand });

  const tryExecuteCommand = (input: string): boolean => {
    if (!input.startsWith("/")) return false;

    const withoutSlash = input.slice(1).trim();
    const spaceIdx = withoutSlash.indexOf(" ");
    const cmdName = spaceIdx >= 0 ? withoutSlash.slice(0, spaceIdx) : withoutSlash;
    const arg = spaceIdx >= 0 ? withoutSlash.slice(spaceIdx + 1).trim() : "";

    const local = LOCAL_COMMANDS.find((c) => c.name === cmdName);
    if (local) {
      if (local.needsArg && !arg) return false;
      void executeLocalCommand(cmdName, arg);
      return true;
    }

    // Meta skill: auto-create meta session and send the command there.
    // If already in a meta session, fall through to normal send.
    const entry = entries.find(
      (e): e is SkillSlashCommand => e.kind === "skill" && e.name === cmdName,
    );
    if (entry?.environment === "meta") {
      const activeSession = sessions.find(
        (s) => s.id === selection.openSessionId,
      );
      if (activeSession?.mode === "meta") return false;

      setText("");
      void create("meta").then((sess) => {
        if (sess) void send(input, sess.id);
      });
      return true;
    }

    return false; // skill commands fall through to send()
  };

  return { palette, selectCommand, tryExecuteCommand };
}
