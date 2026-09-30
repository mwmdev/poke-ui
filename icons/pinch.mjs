// Draws the logo: a page grid pulled into the point where it was poked, with the marker dot in the well.
// usage: node pinch.mjs out.svg '{"dot":"#e5484d","sp":16,...}'
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
const o = {
  sp: 16, s: 0.9, sigma: 34, px: 64, py: 64, sw: 2.6, dotR: 11, ring: 4, well: 0.75, lineOpacity: 0.7,
  t1: '#34343c', t2: '#16161b', shade: '#000000', line: '#c9c9d6', dot: '#e5484d', ringColor: '#ffffff', rim: 4,
  ...JSON.parse(process.argv[3] || '{}'),
};

// Pull every point toward the poke point, strongest near it.
const warp = (x, y) => {
  const dx = o.px - x, dy = o.py - y;
  const k = o.s * Math.exp(-(dx * dx + dy * dy) / (o.sigma * o.sigma));
  return [x + dx * k, y + dy * k];
};

const f = (n) => n.toFixed(2);
const lines = [];
for (let v = o.px % o.sp; v <= 128; v += o.sp) {
  if (v < 10 || v > 118) continue; // lines on the tile edge warp inward and look like a border
  const h = [], w = [];
  for (let t = -4; t <= 132; t += 1) {
    h.push(warp(t, v));
    w.push(warp(v, t));
  }
  for (const pts of [h, w]) lines.push('M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L'));
}

const mix = (a, b, t) => '#' + [1, 3, 5]
  .map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
    .toString(16).padStart(2, '0'))
  .join('');

writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs>
 <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.t1}"/><stop offset="1" stop-color="${o.t2}"/></linearGradient>
 <radialGradient id="well" cx="${o.px / 128}" cy="${o.py / 128}" r="0.36"><stop offset="0" stop-color="${o.shade}" stop-opacity="${o.well}"/><stop offset="1" stop-color="${o.shade}" stop-opacity="0"/></radialGradient>
 <radialGradient id="dot" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="${mix(o.dot, '#ffffff', 0.45)}"/><stop offset=".5" stop-color="${o.dot}"/><stop offset="1" stop-color="${mix(o.dot, '#000000', 0.22)}"/></radialGradient>
 <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
 <clipPath id="c"><rect x="4" y="4" width="120" height="120" rx="28"/></clipPath>
</defs>
<rect x="4" y="4" width="120" height="120" rx="28" fill="url(#tile)"/>
<g clip-path="url(#c)">
 <rect width="128" height="128" fill="url(#well)"/>
 <path d="${lines.join('')}" fill="none" stroke="${o.line}" stroke-opacity="${o.lineOpacity}" stroke-width="${o.sw}" stroke-linejoin="round" stroke-linecap="round"/>
 <circle cx="${o.px + 2.5}" cy="${o.py + 4}" r="${o.dotR + o.ring / 2}" fill="${o.shade}" opacity=".55" filter="url(#blur)"/>
</g>
<rect x="${4 + o.rim / 2}" y="${4 + o.rim / 2}" width="${120 - o.rim}" height="${120 - o.rim}" rx="${28 - o.rim / 2}" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="${o.rim}"/>
<circle cx="${o.px}" cy="${o.py}" r="${o.dotR}" fill="url(#dot)" stroke="${o.ringColor}" stroke-width="${o.ring}"/>
</svg>
`);
