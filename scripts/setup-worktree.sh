#!/bin/bash
# Worktree setup: copy example data and assign dev port
# Triggered by SessionStart hook — only runs inside git worktrees

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

# 3. Find available port (3001-3099) and export to session env
for port in $(seq 3001 3099); do
  if ! (echo > /dev/tcp/localhost/$port) 2>/dev/null; then
    if [ -n "$CLAUDE_ENV_FILE" ]; then
      echo "DEV_PORT=$port" >> "$CLAUDE_ENV_FILE"
      echo "DEV_CLIENT_PORT=$((port + 1100))" >> "$CLAUDE_ENV_FILE"
    fi

    echo "[worktree] Port assigned — $port (client: $((port + 1100))). Start server with: cd apps/webui && bun scripts/dev.ts --port $port"
    exit 0
  fi
done

echo "[worktree] Warning: No available port in 3001-3099"
exit 1
