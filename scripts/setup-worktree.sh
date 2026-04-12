#!/bin/bash
# Worktree setup: copy example data and install dependencies
# Triggered by SessionStart hook — only runs inside git worktrees
# Port management is handled by portless (bun run dev)

ROOT="${CLAUDE_PROJECT_DIR:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Only run in worktrees (.git is a file pointing to main repo, not a directory)
if [ ! -f "$ROOT/.git" ]; then
  exit 0
fi

# 1. Copy example_data
bash "$SCRIPT_DIR/copy-example-data.sh"

# 2. Install dependencies if needed
if [ ! -d "$ROOT/node_modules" ]; then
  cd "$ROOT" && bun install --frozen-lockfile 2>/dev/null
  echo "[worktree] Dependencies installed"
fi

echo "[worktree] Ready. Start server with: bun run dev"
