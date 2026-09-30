// Draws the logo, "the poke": a parchment tile with an ink edge, an element, and a marker-colored tag
// whose sharp bottom-right corner points into the element. Only the tag takes the marker color.
// `small` is the toolbar variant: full bleed, on an 8-unit grid, solid element, no text lines.
// usage: node logo.mjs out.svg '{"dot":"#b4432a","small":true}'
import { writeFileSync } from 'node:fs';

const INK = '#2a241e';
const PAPER = '#f4ecdc';

// Rounded square of side s at (x, y); the bottom-right corner is sharp (radius c).
function tagPath(x, y, s, c) {
  const r = s / 2;
  return `M${x + r} ${y}H${x + s - r}A${r} ${r} 0 0 1 ${x + s} ${y + r}V${y + s - c}`
    + `Q${x + s} ${y + s} ${x + s - c} ${y + s}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const out = process.argv[2];
const o = { dot: '#b4432a', small: false, ...JSON.parse(process.argv[3] || '{}') };

const parts = o.small
  ? [
    `<rect x="4" y="4" width="120" height="120" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="8"/>`,
    `<rect x="64" y="64" width="48" height="48" rx="8" fill="${INK}"/>`,
  ]
  : [
    `<rect x="6" y="6" width="116" height="116" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`,
    `<rect x="59" y="59" width="46" height="46" rx="3" fill="none" stroke="${INK}" stroke-width="6"/>`,
    `<path d="M72 82H94M72 93H86" stroke="${INK}" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/>`,
  ];
const tag = o.small ? tagPath(16, 16, 56, 3) : tagPath(18, 18, 48, 2.5);
parts.push(
  `<path d="${tag}" fill="none" stroke="${PAPER}" stroke-width="${o.small ? 16 : 10}" stroke-linejoin="round"/>`,
  `<path d="${tag}" fill="${o.dot}"/>`,
);

writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">\n${parts.join('\n')}\n</svg>\n`);
