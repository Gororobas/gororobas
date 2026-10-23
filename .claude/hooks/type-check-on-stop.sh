#!/usr/bin/env bash
# Stop: when TypeScript files changed, type-check the workspace before Claude finishes.
# Exit code 2 sends the errors back so Claude fixes them instead of stopping.
set -uo pipefail
input=$(cat)
# A Stop hook that already blocked once lets Claude stop, avoiding loops.
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0
cd "$(dirname "$0")/../.."
git status --porcelain -- '*.ts' '*.tsx' | grep -q . || exit 0
if ! output=$(pnpm --silent run type-check 2>&1); then
  echo "Type errors after your changes (pnpm run type-check):" >&2
  grep -E "error TS" <<<"$output" | head -30 >&2
  exit 2
fi
