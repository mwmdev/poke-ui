#!/usr/bin/env bash
# Regenerates the icons. Needs node and inkscape.
# Toolbar icons are drawn once per marker color (keep in sync with COLORS in content.js);
# background.js switches between them by the color's hex.
set -euo pipefail
cd "$(dirname "$0")"

SMALL='"sp":32,"s":0.75,"sw":6,"dotR":19,"ring":6,"rim":8'
png() { inkscape "$1" --export-type=png --export-filename="$2" -w "$3" -h "$3" >/dev/null 2>&1; }

node pinch.mjs logo.svg
png logo.svg icon48.png 48
png logo.svg icon128.png 128

mkdir -p toolbar
tmp=$(mktemp -d)
for c in e5484d f76b15 30a46c 0090ff 8e4ec6; do
  node pinch.mjs "$tmp/$c.svg" "{$SMALL,\"dot\":\"#$c\"}"
  png "$tmp/$c.svg" "toolbar/$c-16.png" 16
  png "$tmp/$c.svg" "toolbar/$c-32.png" 32
done
