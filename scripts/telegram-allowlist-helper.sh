#!/bin/bash
# Helper script to manage Telegram allowlist

case "$1" in
  list)
    pnpm openclaw config get channels.telegram.allowFrom
    ;;
  add)
    if [ -z "$2" ]; then
      echo "Usage: $0 add <@username or user_id>"
      exit 1
    fi
    # Extract JSON from pnpm output (skip pnpm log lines, get last JSON block)
    CURRENT=$(pnpm openclaw config get channels.telegram.allowFrom 2>/dev/null | grep -E '^\[' | jq -r '. // []')
    if [ -z "$CURRENT" ] || [ "$CURRENT" = "[]" ]; then
      CURRENT="[]"
    fi
    NEW=$(echo "$CURRENT" | jq ". + [\"$2\"]")
    pnpm openclaw config set channels.telegram.allowFrom "$NEW" --json
    echo "Added $2 to allowlist"
    ;;
  remove)
    if [ -z "$2" ]; then
      echo "Usage: $0 remove <@username or user_id>"
      exit 1
    fi
    # Extract JSON from pnpm output (skip pnpm log lines, get last JSON block)
    CURRENT=$(pnpm openclaw config get channels.telegram.allowFrom 2>/dev/null | grep -E '^\[' | jq -r '. // []')
    if [ -z "$CURRENT" ] || [ "$CURRENT" = "[]" ]; then
      echo "Allowlist is empty, nothing to remove"
      exit 0
    fi
    NEW=$(echo "$CURRENT" | jq "map(select(. != \"$2\"))")
    pnpm openclaw config set channels.telegram.allowFrom "$NEW" --json
    echo "Removed $2 from allowlist"
    ;;
  *)
    echo "Usage: $0 {list|add|remove} [username]"
    exit 1
    ;;
esac
