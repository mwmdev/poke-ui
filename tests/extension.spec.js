const { test: base, expect, chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION = path.resolve(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture', 'index.html'));

const test = base.extend({
  server: [async ({}, use) => {
    const server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(FIXTURE);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use(`http://127.0.0.1:${server.address().port}/`);
    server.close();
  }, { scope: 'worker' }],

  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anot-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
});

const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const selectorsIn = (markdown) => [...markdown.matchAll(/^- Selector: `([^`]+)`$/gm)].map((m) => m[1]);

test('annotate, persist, edit, delete, copy one and all', async ({ context, server }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server).origin });
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');

  const page = await context.newPage();
  await page.goto(server);
  await page.bringToFront();

  // Same code path as the toolbar icon / keyboard shortcut.
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const markers = page.locator('anot-root .marker:visible');
  const marker = (n) => page.getByRole('button', { name: `Note ${n}`, exact: true });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const addNote = async (testid, text) => {
    await page.locator(`[data-testid="${testid}"]`).click();
    await expect(page.locator('anot-root .editor')).not.toContainText('null');
    await page.getByRole('textbox', { name: 'Note' }).fill(text);
    await button('Save').click();
  };
  const testidFor = (selector) => page.evaluate((sel) => {
    const all = document.querySelectorAll(sel);
    return all.length === 1 ? all[0].dataset.testid : `matches:${all.length}`;
  }, selector);

  // Create two notes; the page's own click handler must not fire in annotation mode.
  await toggle();
  await addNote('buy', 'Make the button larger');
  await addNote('li-two', 'Align this list item');
  await expect(markers).toHaveCount(2);
  expect(await page.title()).toBe('anot fixture');

  // Notes survive a reload.
  await page.reload();
  await expect(markers).toHaveCount(2);

  // Update note 1, delete note 2, add a third note.
  await marker(1).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Make the button green');
  await button('Save').click();
  await marker(2).click();
  await button('Delete').click();
  await expect(markers).toHaveCount(1);
  await toggle();
  await addNote('title', 'Tighten the heading');
  await expect(markers).toHaveCount(2);

  // Copy a single note (note 2 = heading).
  await marker(2).click();
  await button('Copy').click();
  await expect(button('Copied')).toBeVisible();
  const single = await readClipboard(page);
  expect(single).toContain('Tighten the heading');
  expect(single).not.toContain('Make the button green');
  expect(single).toContain(`- URL: ${server}`);
  expect(single).toMatch(/- Box \(document px\): x=\d+ y=\d+ width=\d+ height=\d+/);
  expect(single).toMatch(/- Styles: `.*font-size: .*`/);
  expect(single).toContain('<h1 class="title" data-testid="title">');
  expect(selectorsIn(single)).toHaveLength(1);
  expect(await testidFor(selectorsIn(single)[0])).toBe('title');
  await page.keyboard.press('Escape');

  // Copy all notes.
  await button('Copy all').click();
  await expect(button('Copied')).toBeVisible();
  const all = await readClipboard(page);
  expect(all).toContain('Make the button green');
  expect(all).toContain('Tighten the heading');
  expect(all).not.toContain('Align this list item');
  const selectors = selectorsIn(all);
  expect(selectors).toHaveLength(2);
  expect(await testidFor(selectors[0])).toBe('buy');
  expect(await testidFor(selectors[1])).toBe('title');

  // A note on an element with no id gets a unique structural selector.
  await addNote('li-three', 'Third item spacing');
  await button('Copy all').click();
  const withList = selectorsIn(await readClipboard(page));
  expect(await testidFor(withList[2])).toBe('li-three');
});

test('panel can be dragged by its grip', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(server);
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });

  const panel = page.locator('anot-root .panel');
  const before = await panel.boundingBox();
  const grip = await page.locator('anot-root .grip').boundingBox();
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y - 150, { steps: 5 });
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(Math.round(before.x - after.x)).toBe(200);
  expect(Math.round(before.y - after.y)).toBe(150);

  // Hovering afterwards must not move it.
  await page.mouse.move(x - 200, y - 150);
  await page.mouse.move(x - 260, y - 190, { steps: 5 });
  expect(await panel.boundingBox()).toEqual(after);

  // A second drag still works.
  await page.mouse.move(x - 200, y - 150);
  await page.mouse.down();
  await page.mouse.move(x - 150, y - 150, { steps: 5 });
  await page.mouse.up();
  expect(Math.round((await panel.boundingBox()).x - after.x)).toBe(50);
});
