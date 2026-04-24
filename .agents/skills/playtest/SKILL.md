---
name: playtest
description: Use to self-test agentchan templates through the server API without the UI, observing system rules, file updates, OOC boundaries, branches, and regressions turn by turn.
---

# playtest

Use the shared workflow in `.claude/skills/playtest/SKILL.md`.

Codex notes:

- The CLI script is `bun .claude/skills/playtest/scripts/play.ts <cmd>`.
- If the dev server is not running, start it with `bun run dev` and use the
  server URL reported by the command.
- `https://agentchan.localhost` may not work with Bun fetch; use
  `AGENTCHAN_URL=http://localhost:<server-port>` for the playtest CLI when
  needed.
- After patching `example_data/`, run `bash scripts/copy-example-data.sh --force`
  and create a fresh project for regression checks.
