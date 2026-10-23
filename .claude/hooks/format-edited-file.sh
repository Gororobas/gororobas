#!/usr/bin/env bash
# PostToolUse: format the file Claude just edited, the same way `pnpm run fix` would.
set -euo pipefail
file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
case "$file" in
  *.ts | *.tsx | *.mts | *.mjs | *.js | *.css | *.json) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
cd "$(dirname "$0")/../.."
pnpm --silent exec oxfmt "$file" >/dev/null
