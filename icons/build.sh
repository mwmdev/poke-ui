#!/usr/bin/env bash
# Regenerates the icons. Needs node, inkscape and ImageMagick (magick).
# Toolbar icons are drawn once per marker color (keep in sync with COLORS in content.js);
# background.js switches between them by the color's hex.
set -euo pipefail
cd "$(dirname "$0")"

png() { inkscape "$1" --export-type=png --export-filename="$2" -w "$3" -h "$3" >/dev/null 2>&1; }

tmp=$(mktemp -d)
# The logo (and so the 48/128 icons) uses the default Rust marker color; toolbar icons below cover every color.
node logo.mjs logo.svg '{"dot":"#b4432a"}'
png logo.svg icon48.png 48
# The Web Store wants 96x96 artwork inside a 128x128 icon, with 16px of transparent padding.
# The large logo's tile spans 4…124 (outer stroke edge) in its 128 viewBox: export just that area at 96px.
inkscape logo.svg --export-type=png --export-filename="$tmp/icon96.png" --export-area=4:4:124:124 -w 96 -h 96 >/dev/null 2>&1
magick "$tmp/icon96.png" -background none -gravity center -extent 128x128 icon128.png

# Toolbar sizes use the small variant (full bleed, 8-unit grid, no text lines), which stays crisp at 16 px.
mkdir -p toolbar
for c in b4432a 8c6310 4d6b2c 22696f 7a4577; do
  node logo.mjs "$tmp/$c.svg" "{\"small\":true,\"dot\":\"#$c\"}"
  png "$tmp/$c.svg" "toolbar/$c-16.png" 16
  png "$tmp/$c.svg" "toolbar/$c-32.png" 32
done
