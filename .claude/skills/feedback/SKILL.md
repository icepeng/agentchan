---
name: feedback
description: Process feedback by spawning a subagent in an isolated worktree that implements changes, reviews quality, and creates a PR. Designed for continuous feedback processing (e.g., from Discord) without accumulating main context. Invoke with "/feedback" followed by feedback content.
---

# Feedback Processing

Spawn an isolated subagent per feedback to keep the main conversation context clean.

## Workflow

For each piece of feedback, use the `Agent` tool with `isolation: "worktree"` to handle the full cycle. The main agent only dispatches and reports results.

### Agent Prompt Construction

Build the agent prompt with these sections:

1. **Feedback** — The exact feedback content from the user
2. **Codebase context** — Any relevant context you already know (file paths, architecture) that saves the agent from re-discovering it
3. **Instructions** — The step-by-step workflow below

Use this template for the agent prompt:

```
## Feedback to implement

{paste the feedback here}

## Codebase context

{any relevant file paths, architecture notes, or prior context}

## Instructions

Execute these steps sequentially:

### 1. Implement

1. Read relevant files to understand current state
2. Plan the changes needed
3. Implement following existing code conventions
4. Verify: run `bunx tsc --noEmit` from the relevant package dir, and `bun run lint`
5. Fix any errors before proceeding

### 2. Review

Review all your changes for:
- Code reuse — did you duplicate something that already exists?
- Quality — are there edge cases, naming issues, or unclear logic?
- Efficiency — any unnecessary allocations, loops, or complexity?

Fix any issues found.

### 3. Commit, Push & PR

1. Stage changed files: `git add <specific files>`
2. Create a commit with a clear message (include Co-Authored-By trailer)
3. Push: `git push -u origin HEAD`
4. Create PR: `gh pr create --title "<title>" --body "<description>"`
5. Return the PR URL as your final output
```

### Handling Results

After the agent completes:
- Report the PR URL (or error) to the user
- If processing Discord feedback, reply to the Discord message with the result

### Parallel Processing

Multiple independent feedbacks can be dispatched as concurrent Agent calls. Each gets its own worktree and PR.

## Guidelines

- **One feedback = one agent = one worktree = one PR** — never batch unrelated feedback into one PR
- **Pass context forward** — include file paths and architecture notes in the agent prompt so it doesn't waste tokens re-exploring
- **Don't duplicate work** — once dispatched, trust the agent. Do not repeat its searches or edits in the main context
- **Stay focused** — the agent should only change what the feedback asks for
