#!/bin/bash
# Called from git hooks (post-merge, post-rewrite) to refresh apps/webui/data
# only when example_data/ actually changed across the merge/rebase.
# ORIG_HEAD is set by git to the pre-operation tip.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! git rev-parse --verify --quiet ORIG_HEAD >/dev/null; then
  exit 0
fi

if git diff --quiet ORIG_HEAD HEAD -- example_data/; then
  exit 0
fi

bash "$SCRIPT_DIR/copy-example-data.sh" --force
