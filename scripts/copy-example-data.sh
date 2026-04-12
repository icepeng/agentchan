#!/bin/bash
# Copy example_data to apps/webui/data
# Usage: bash scripts/copy-example-data.sh [--force]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT/apps/webui/data"
EXAMPLE_DIR="$ROOT/example_data"

if [ "$1" = "--force" ]; then
  rm -rf "$DATA_DIR/projects" "$DATA_DIR/library"
fi

if [ -d "$DATA_DIR/projects" ] && [ -d "$DATA_DIR/library/templates" ]; then
  echo "[copy-example-data] Data already exists (use --force to overwrite)"
  exit 0
fi

mkdir -p "$DATA_DIR"
cp -r "$EXAMPLE_DIR"/* "$DATA_DIR/"
echo "[copy-example-data] Copied example_data → apps/webui/data"
