import { useProviderMutations } from "@/client/provider/index.js";
import { useSkills } from "@/client/creative-agent/skill/index.js";
import {
  useSessions,
  useActiveSessionSelection,
} from "@/client/creative-agent/session/index.js";
import { useI18n } from "@/client/platform/index.js";
import { useSession } from "../useSession.js";
import { useStreaming } from "../stream/useStreaming.js";
import { useSessionRoot } from "../SessionRootContext.js";
import { buildSlashEntries, LOCAL_COMMAND_DEFS, type SlashEntry, type SkillSlashCommand } from "./commands.js";
import { useCommandPalette } from "./useCommandPalette.js";

export function useSlashCommands(text: string, setText: (s: string) => void) {
  const { update: updateConfig } = useProviderMutations();
  const selection = useActiveSessionSelection();
  const root = useSessionRoot();
  const activeProjectSlug = root.slug;
  const { data: skills = [] } = useSkills(activeProjectSlug);
  const { data: sessions = [] } = useSessions(activeProjectSlug);
  const { create, compact } = useSession();
  const { send } = useStreaming();
  const { t } = useI18n();

  const entries = buildSlashEntries(skills, t);

  const executeLocalCommand = async (name: string, arg: string) => {
    switch (name) {
      case "new":
        await create();
        break;
      case "compact":
        await compact();
        break;
      case "edit":
        root.onToggleViewMode();
        break;
      case "readme":
        root.onRequestProjectReadme();
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

    const local = LOCAL_COMMAND_DEFS.find((c) => c.name === cmdName);
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
