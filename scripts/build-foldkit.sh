#!/usr/bin/env bash
# Builds the Foldkit packages from the repos/foldkit subtree (the Blocks preview), which the
# workspace installs as `file:` dependencies until the preview publishes a canary on Effect 4.1.
# Run it after pulling the subtree, then `pnpm install`.
set -euo pipefail

cd "$(dirname "$0")/../repos/foldkit"

# --ignore-scripts: Foldkit's `prepare` installs git hooks, which would land in this repository's .git.
SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install --frozen-lockfile --ignore-scripts \
  --filter foldkit... --filter @foldkit/ui... --filter @foldkit/devtools... \
  --filter @foldkit/vite-plugin... --filter @foldkit/oxlint-plugin... --filter @foldkit/devtools-mcp...

# Dependency order: ui and devtools brand their output with the Vite plugin.
for package in foldkit vite-plugin-foldkit ui devtools oxlint-plugin-foldkit devtools-mcp; do
  pnpm --dir "packages/$package" run build
done
