#!/usr/bin/env bash
# Builds the Chrome Web Store upload: dist/poke-ui-<version>.zip with only the runtime files.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
# -FS keeps the archive in sync with the file list (drops stale entries) without deleting files.
zip -q -X -FS -r "dist/poke-ui-$version.zip" manifest.json background.js content.js \
  icons/icon48.png icons/icon128.png icons/toolbar
echo "dist/poke-ui-$version.zip"
