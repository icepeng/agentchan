---
name: vercel-react-best-practices
description: React and Next.js performance guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React client code, data fetching, bundle behavior, or performance-sensitive UI.
---

# Vercel React best practices

Use the shared skill in `.claude/skills/vercel-react-best-practices/SKILL.md`.

For detailed review or refactor work, read the compiled reference first:

```text
.claude/skills/vercel-react-best-practices/AGENTS.md
```

Apply these guidelines together with this repo's React Compiler rule: avoid
`useMemo`, `useCallback`, and `React.memo` unless they have semantic value.
