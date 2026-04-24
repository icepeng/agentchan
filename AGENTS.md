# agentchan agent instructions

This repository is used by Claude Code and Codex. `CLAUDE.md` remains the
canonical long-form project notebook; this file is the Codex entry point and
the shared checklist for day-to-day work.

## Read order

1. Read this file first.
2. Read `CLAUDE.md` before non-trivial code changes. It contains the detailed
   architecture notes and project-specific edge cases.
3. If `CLAUDE.local.md` exists, treat it as local, uncommitted workspace context.
   Read it when relevant, but do not edit it unless the user asks.
4. For directory-specific work, also check for nested `AGENTS.md` files.

## Tooling

- Package manager: Bun (`packageManager` is `bun@1.3.11`).
- Install dependencies with `bun install`.
- Start the app with `bun run dev`.
- Start without portless by passing a manual port, for example
  `bun run dev -- --port 3001`.
- Build with `bun run build`.
- Lint with `bun run lint`.
- Run the default tests with `bun run test`.
- Type-check with `bunx tsc --noEmit` from the package being checked, usually
  `apps/webui/` or `packages/creative-agent/`.
- Do not use `npx tsc`.

## Claude-specific automation

- `.claude/settings.json` contains Claude Code hooks and plugin settings. Codex
  cannot rely on those hooks having run.
- The Claude `SessionStart` hook runs `scripts/setup-worktree.sh`, which copies
  `example_data/` into `apps/webui/data/` for Claude worktrees. Under Codex, run
  `bash scripts/copy-example-data.sh --force` manually when runtime data must be
  refreshed after editing `example_data/`.
- `.claude/worktrees/`, `.claude/memory/`, `apps/webui/data/`, and `research/`
  are local/generated/reference areas. Read them when useful, but do not edit
  them unless the task explicitly targets them.

## Repository structure

- `packages/creative-agent`: core agent library, tools, skills, sessions, and
  orchestration. It is source-first; `main` and `types` point at `src/index.ts`.
- `packages/estimate-tokens`: shared token estimation utility, plain `.mjs` plus
  `.d.ts`, no build step.
- `packages/grep`: pure file-search package used by the creative-agent grep
  tool.
- `apps/webui`: React 19 + Hono + Vite + Tailwind v4 web UI.
- `example_data/`: source of truth for committed templates, skills, renderers,
  and sample files.

## Architecture rules

Server code uses Route -> Service -> Repository:

- Routes own HTTP parsing, validation, and responses.
- Services own business logic.
- Repositories own filesystem, SQLite, and creative-agent data access.
- Dependencies flow downward only: routes -> services -> repositories.
- Use factory functions such as `createXxxRoutes`, `createXxxService`, and
  `createXxxRepo`.
- Export service/repo types with `ReturnType<typeof createXxxService>` style
  unless the local code already requires another shape.
- Hono services are injected through `c.set()` / `c.get()` using `AppEnv`.

Client code follows the existing feature-sliced layering:

- `app/` -> `pages/` -> `features/` -> `entities/` -> `shared/`.
- Dependencies flow downward only.
- Cross-domain orchestration belongs in `features/`.
- Domain state and API types belong in `entities/`.
- Pure UI and utilities belong in `shared/`.
- Use `@/client/...` for cross-module imports and `./` for module-local imports.
- Respect each module's `index.ts` boundary; do not import another module's
  private internal file.

## Client constraints

- User-visible text must go through i18n. Update `apps/webui/src/client/i18n/en.ts`
  and `apps/webui/src/client/i18n/ko.ts` together.
- Browser storage must go through `apps/webui/src/client/shared/storage.ts`.
  Register new keys in `localStore`; do not call `localStorage.*` directly
  outside that file.
- In browser/client runtime code, import `@agentchan/creative-agent` as types
  only. Runtime imports can pull Node-only stubs into Vite dev.
- React Compiler is enabled in `apps/webui`. Do not add `useMemo`,
  `useCallback`, or `React.memo` only for generic render-performance reasons.
  Keep or add memoization only when it has semantic value, such as a stable
  subscription key, effect dependency contract, or explicit cache.

## Renderer rules

- Renderer architecture decisions live in
  `docs/adr/0001-renderer-primary-surface-react-contract.md`. Follow that ADR
  when it conflicts with older renderer drafts or in-progress implementation.
- Per-project renderers use the React primary-surface contract and live at
  `renderer/index.tsx`.
- Renderers default-export a React component receiving
  `Agentchan.RendererProps`. Optional project theme is a named
  `theme(snapshot)` export.
- Renderers import the V1 helper with
  `import { Agentchan } from "agentchan:renderer/v1"` for types and
  `Agentchan.fileUrl()`. Do not add `Agentchan.vanilla()` or public
  `mount(host)` authoring to committed templates without a later ADR.
- Renderer imports are limited to relative imports inside `renderer/`, CSS
  imports in that graph, and `agentchan:renderer/v1`. Vendored browser
  libraries must live under `renderer/`.
- Renderers receive a snapshot containing `slug`, `baseUrl`, `files`, and
  `state`. Use `actions.send()` and `actions.fill()` for host commands.
- Use `Agentchan.fileUrl(snapshot, fileOrPath)` for project file URLs when
  practical; file `digest` values are opaque cache keys.
- Renderers own the viewport. `RenderedView` does not add outer padding, so
  spacing and layout belong inside the renderer CSS/markup.
- Renderer `theme(snapshot)` may override project page color tokens only. Fonts
  and detailed layout stay inside renderer CSS.
- Do not use monospace fonts for areas that may contain Korean text.

## Data rules

- `example_data/` is committed source data.
- `apps/webui/data/` is runtime data and is gitignored.
- Edit templates and sample content in `example_data/`, then copy to runtime data
  only when needed with `bash scripts/copy-example-data.sh --force`.
- Existing projects snapshot their own `SYSTEM.md`, `skills/`, and `renderer/`
  at creation time. Template changes do not affect existing projects.

## LLM instruction files

`SYSTEM.md`, `SYSTEM.meta.md`, and `skills/*/SKILL.md` are live prompts that the
agent reads every turn. Keep them operational and compact:

- Remove history/deprecation notes.
- Remove design rationale that does not change behavior.
- Avoid repeating a rule in both prose and a warning section.
- Keep constraints and edge cases that change model behavior.
- Use examples when they are clearer than another guard paragraph.

## Verification

- For narrow changes, run the closest relevant check first.
- For web UI changes, usually run `cd apps/webui && bunx tsc --noEmit`.
- For creative-agent changes, run
  `cd packages/creative-agent && bunx tsc --noEmit`.
- Run `bun run lint` when touching lint-covered code.
- Run `bun run test` or focused `bun test` commands when behavior changes.
- If a dev server is needed for user-facing work, start it and report the URL.

## Codex repo skills

Codex scans repository skills under `.agents/skills`. This repo keeps the
original Claude skills under `.claude/skills`, and `.agents/skills` contains
thin bridge skills that point Codex to compatible Claude skill content. When a
bridge skill asks you to read a `.claude/skills/...` file, treat that file as
the source of instructions for the current task.
