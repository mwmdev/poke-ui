// Generates the Web Store images in store/assets/ with the real extension running in headless Chromium:
// three 1280x800 screenshots and the 440x280 promo tile. Run: npm run store-assets
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
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
  '/promo': ['store/promo.html', 'text/html'],
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-shoot-'));
const extension = prepareExtension();
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

try {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  // Playwright switches off every permission that isn't listed; Chromium itself allows the copy by default.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });

  // Same code path as the toolbar icon / keyboard shortcut.
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });

  const page = await context.newPage();
  await page.bringToFront();
  const shot = (name) => page.screenshot({ path: path.join(outDir, name) });
  const target = (demo) => page.locator(`[data-demo="${demo}"]`);
  const note = page.getByRole('textbox', { name: 'Note' });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const panel = page.locator('poke-ui-root .panel');
  const markers = page.locator('poke-ui-root .marker:visible');

  // 1. Annotating: two saved notes, a third being typed.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(base + '/');
  await toggle();
  for (const [demo, text, count] of [
    ['cta-pro', 'Make this the primary button: 48px tall, bolder label', 1],
    ['hero', 'Tighten line height and reduce the gap below', 2],
  ]) {
    await target(demo).click();
    await note.fill(text);
    await note.press('Enter');
    await markers.nth(count - 1).waitFor();
  }
  await target('cta-business').click();
  await note.fill('Match the Pro button style');
  await target('cta-business').hover();
  await shot('screenshot-1-annotate.png');

  // 2. The panel: dark theme, blue pins, marker color row open, first row hovered.
  await note.press('Escape');
  await worker.evaluate(() => chrome.storage.local.set({ theme: 'dark', markerColor: '#0090ff' }));
  await page.waitForFunction(() => {
    const el = document.querySelector('poke-ui-root')?.shadowRoot?.querySelector('.panel');
    return el && getComputedStyle(el).backgroundColor === 'rgb(28, 28, 31)';
  });
  await button('Marker color').click();
  await page.locator('poke-ui-root .row').first().hover();
  await shot('screenshot-2-panel.png');

  // 3. The hand-off: the copied markdown pasted into a terminal.
  await button('Marker color').click();
  await button('Copy all').click();
  await button('Copied').waitFor();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(base + '/paste');
  const count = (markdown.match(/^### Annotation /gm) || []).length;
  await page.evaluate(({ markdown, count }) => {
    document.querySelector('#chip').textContent = `[Pasted: ${count} annotation${count === 1 ? '' : 's'}]`;
    document.querySelector('#out').textContent = markdown;
  }, { markdown, count });
  await shot('screenshot-3-handoff.png');

  // Promo tile.
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(base + '/promo');
  await shot('promo-440x280.png');
} finally {
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(extension, { recursive: true, force: true });
}
