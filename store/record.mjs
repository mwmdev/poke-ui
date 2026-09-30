// Records the demo video with the real extension running in headless Chromium:
// store/assets/demo.mp4 (listing/social) and store/assets/demo.gif (README hero). Run: npm run demo-video
// Needs ffmpeg on PATH. Playwright videos show neither cursor nor keys, so an overlay draws both.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { prepareExtension } = createRequire(import.meta.url)('../tests/extension-dir.js');

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const outDir = path.join(root, 'store', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const routes = {
  '/': ['store/demo.html', 'text/html'],
  '/paste': ['store/paste.html', 'text/html'],
};
const server = http.createServer((req, res) => {
  const route = routes[new URL(req.url, 'http://x').pathname];
  if (!route) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('content-type', route[1]);
  res.end(fs.readFileSync(path.join(root, route[0])));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Runs in every page before its own scripts: a cursor, a click ripple and a caption pill.
// The cursor glides on its own (CSS transition) while the real mouse jumps once on arrival: gliding the real mouse
// across the page would make the extension's hover highlight cover whatever is under the path.
function installOverlay() {
  const css = `
    .cursor { position: absolute; left: 0; top: 0; opacity: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
      transition: transform var(--ms, 0ms) cubic-bezier(.45, 0, .2, 1); }
    .ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
      border: 3px solid #f76b15; animation: ripple .55s ease-out forwards; }
    @keyframes ripple { to { transform: scale(4); opacity: 0; } }
    .caption { position: absolute; left: 50%; bottom: 28px; transform: translate(-50%, 8px); opacity: 0;
      transition: opacity .25s, transform .25s; padding: 13px 24px; border-radius: 999px; white-space: nowrap;
      background: rgba(18,18,22,.9); color: #fff; font: 600 22px/1 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.3); }
    .caption.on { opacity: 1; transform: translate(-50%, 0); }
    kbd { margin: 0 3px; padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,.16);
      border-bottom: 2px solid rgba(255,255,255,.32); font: inherit; }`;
  let shadow;
  const place = (x, y, ms) => {
    const cursor = shadow?.querySelector('.cursor');
    if (!cursor) return;
    cursor.style.setProperty('--ms', ms + 'ms');
    cursor.style.opacity = '1';
    cursor.style.transform = `translate(${x - 5}px, ${y - 3}px)`;
  };
  window.__cursorTo = (x, y, ms) => {
    sessionStorage.setItem('demo-cursor', JSON.stringify([x, y]));
    place(x, y, ms);
  };
  addEventListener('mousedown', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    ripple.addEventListener('animationend', () => ripple.remove());
    shadow?.append(ripple);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${css}</style>
      <svg class="cursor" width="26" height="26" viewBox="0 0 24 24">
        <path d="M5 3l14 7.5-6 1.8-2.4 6.2z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <div class="caption"></div>`;
    document.documentElement.append(host);
    const saved = sessionStorage.getItem('demo-cursor');
    if (saved) place(...JSON.parse(saved), 0);
  });
  window.__caption = (html) => {
    const caption = shadow.querySelector('.caption');
    if (html) caption.innerHTML = html;
    caption.classList.toggle('on', Boolean(html));
  };
}

const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-video-'));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-record-'));
const extension = prepareExtension();
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
});

let webm;
try {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  // Playwright switches off every permission that isn't listed; Chromium itself allows the copy by default.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await context.addInitScript(installOverlay);

  // Same code path as the toolbar icon / keyboard shortcut.
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });

  const page = await context.newPage();
  await page.bringToFront();
  webm = page.video();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const say = (html) => page.evaluate((h) => window.__caption(h), html);
  const target = (demo) => page.locator(`[data-demo="${demo}"]`);
  const note = page.getByRole('textbox', { name: 'Note' });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const markers = page.locator('poke-ui-root .marker:visible');

  // The fake cursor glides (see installOverlay); the real mouse then jumps to where it landed.
  let pos = { x: 640, y: 430 };
  const glide = async (x, y, ms = 700) => {
    await page.evaluate(([px, py, t]) => window.__cursorTo(px, py, t), [x, y, ms]);
    await sleep(ms);
    await page.mouse.move(x, y);
    pos = { x, y };
  };
  const glideTo = async (locator, ms) => {
    const box = await locator.boundingBox();
    await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
  };
  const annotate = async (demo, text, delay, captions = {}) => {
    if (captions.click) await say(captions.click);
    await glideTo(target(demo), 800);
    await sleep(450);
    await page.mouse.click(pos.x, pos.y);
    await note.waitFor();
    if (captions.type) await say(captions.type);
    await sleep(250);
    await note.pressSequentially(text, { delay });
    await sleep(350);
    await note.press('Enter');
  };

  await page.goto(base + '/');
  await page.evaluate(([px, py]) => window.__cursorTo(px, py, 0), [pos.x, pos.y]);
  await sleep(900);

  await say('Press <kbd>Alt</kbd><kbd>Shift</kbd><kbd>A</kbd> on any page');
  await sleep(1500);
  await toggle();
  await sleep(900);

  await annotate('cta-pro', 'Make this the primary button: 48px tall, bolder label', 42, {
    click: 'Click any element',
    type: 'Say what should change',
  });
  await markers.nth(0).waitFor();
  await sleep(500);
  await annotate('hero', 'Tighten line height and reduce the gap below', 30);
  await markers.nth(1).waitFor();
  await sleep(400);
  await annotate('cta-business', 'Match the Pro button style', 30);
  await markers.nth(2).waitFor();
  await sleep(900);

  await say('Copy every note as markdown');
  await glideTo(button('Copy all'), 900);
  await sleep(350);
  await page.mouse.click(pos.x, pos.y);
  await button('Copied').waitFor();
  await sleep(900);
  const markdown = await page.evaluate(() => navigator.clipboard.readText());

  await say(null);
  await page.goto(base + '/paste');
  const count = (markdown.match(/^### Annotation /gm) || []).length;
  await page.evaluate(({ markdown, count }) => {
    document.querySelector('#chip').textContent = `[Pasted: ${count} annotations]`;
    const out = document.querySelector('#out');
    out.textContent = markdown;
    // Scroll inside a clip below the prompt line, not over it.
    const clip = document.createElement('div');
    clip.style.cssText = 'height: 520px; overflow: hidden';
    out.replaceWith(clip);
    clip.append(out);
  }, { markdown, count });
  await sleep(400);
  await say('Paste it into your AI assistant');
  await sleep(900);
  // Scroll the pasted text so the viewer sees it is more than a title.
  await page.evaluate(() => document.querySelector('#out').animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(-420px)' }],
    { duration: 3200, easing: 'ease-in-out', fill: 'forwards' },
  ));
  await sleep(4000);
} finally {
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(extension, { recursive: true, force: true });
}

try {
  const source = await webm.path();
  const mp4 = path.join(outDir, 'demo.mp4');
  const gif = path.join(outDir, 'demo.gif');
  // The first half second is the blank page before the first navigation.
  const trim = ['-ss', '0.5'];
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', ...trim, '-i', source,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4,
  ]);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', ...trim, '-i', source,
    '-vf', 'fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];'
      + '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', gif,
  ]);
  for (const file of [mp4, gif]) console.log(path.relative(root, file), `${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
} finally {
  fs.rmSync(videoDir, { recursive: true, force: true });
}
