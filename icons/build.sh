#!/usr/bin/env bash
# Regenerates the icons. Needs node, inkscape and ImageMagick (magick).
# Toolbar icons are drawn once per marker color (keep in sync with COLORS in content.js);
# background.js switches between them by the color's hex.
set -euo pipefail
cd "$(dirname "$0")"

SMALL='"sp":32,"s":0.75,"sw":6,"dotR":19,"ring":6,"rim":8'
png() { inkscape "$1" --export-type=png --export-filename="$2" -w "$3" -h "$3" >/dev/null 2>&1; }

tmp=$(mktemp -d)
# The logo (and so the 48/128 icons) uses the orange marker color; toolbar icons below cover every color.
node pinch.mjs logo.svg '{"dot":"#f76b15"}'
png logo.svg icon48.png 48
# The Web Store wants 96x96 artwork inside a 128x128 icon, with 16px of transparent padding.
# The logo's tile is 120x120 at (4,4) in its 128 viewBox: export just the tile at 96px.
inkscape logo.svg --export-type=png --export-filename="$tmp/icon96.png" --export-area=4:4:124:124 -w 96 -h 96 >/dev/null 2>&1
magick "$tmp/icon96.png" -background none -gravity center -extent 128x128 icon128.png

mkdir -p toolbar
for c in e5484d f76b15 30a46c 0090ff 8e4ec6; do
  node pinch.mjs "$tmp/$c.svg" "{$SMALL,\"dot\":\"#$c\"}"
  png "$tmp/$c.svg" "toolbar/$c-16.png" 16
  png "$tmp/$c.svg" "toolbar/$c-32.png" 32
done
