---
name: portless
description: Use when working with named local dev server URLs, `*.localhost` routing, portless proxy setup, worktree subdomains, or port/proxy troubleshooting.
---

# portless

Use the shared portless reference in `.claude/skills/portless/SKILL.md`.

For this repo, `bun run dev` is already wired for portless. The expected main
worktree URL is:

```text
https://agentchan.localhost
```

In linked worktrees, check `portless list` for the branch-prefixed subdomain.
