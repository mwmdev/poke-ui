const { test: base, expect, chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { prepareExtension } = require('./extension-dir');
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
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-'));
    const extension = prepareExtension();
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(extension, { recursive: true, force: true });
  },
});

const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const selectorsIn = (markdown) => [...markdown.matchAll(/^- Selector: `([^`]+)`$/gm)].map((m) => m[1]);

test('annotate, persist, edit, delete, copy one and all', async ({ context, server }) => {
  // The extension has no clipboardWrite permission: Chromium allows writes from a clicked button by default.
  // Playwright's explicit grant list switches every unlisted permission off, so clipboard-write is listed here.
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
  const markers = page.locator('poke-ui-root .marker:visible');
  const marker = (n) => page.getByRole('button', { name: `Note ${n}`, exact: true });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const addNote = async (testid, text) => {
    await page.locator(`[data-testid="${testid}"]`).click();
    await expect(page.locator('poke-ui-root .editor')).not.toContainText('null');
    await page.getByRole('textbox', { name: 'Note' }).fill(text);
    await page.getByRole('textbox', { name: 'Note' }).press('Enter');
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
  expect(await page.title()).toBe('poke-ui fixture');

  // Notes survive a reload, but the pins stay hidden until the extension is activated on the page again.
  await page.reload();
  await expect(markers).toHaveCount(0);
  await toggle();
  await expect(markers).toHaveCount(2);
  await expect(page.locator('poke-ui-root .panel')).toBeVisible();
  await toggle();
  await expect(page.locator('poke-ui-root .panel')).toBeHidden();
  await expect(markers).toHaveCount(2);

  // Clicking a pin while the panel is hidden opens the note and the panel.
  await expect(page.locator('poke-ui-root .panel')).toBeHidden();
  await marker(1).click();
  await expect(page.locator('poke-ui-root .panel')).toBeVisible();
  await expect(page.locator('poke-ui-root .editor button')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Note' }).fill('Make the button green');
  await page.getByRole('textbox', { name: 'Note' }).press('Enter');

  // Delete note 2 from its panel row (the first click only arms it), then add a third note.
  await button('Delete note 2').click();
  await expect(button('Confirm delete note 2')).toBeVisible();
  await expect(markers).toHaveCount(2);
  await button('Confirm delete note 2').click();
  await expect(markers).toHaveCount(1);
  await expect(page.locator('poke-ui-root .row')).toHaveText(['1  Make the button green']);
  await addNote('title', 'Tighten the heading');
  await expect(markers).toHaveCount(2);

  // Copy a single note (note 2 = heading) from its panel row.
  await button('Copy note 2').click();
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

  const panel = page.locator('poke-ui-root .panel');
  const before = await panel.boundingBox();
  // It first appears in the top-right corner.
  expect(Math.round(before.y)).toBe(16);
  expect(Math.round(page.viewportSize().width - (before.x + before.width))).toBe(16);
  const grip = await page.locator('poke-ui-root .grip').boundingBox();
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y + 150, { steps: 5 });
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(Math.round(before.x - after.x)).toBe(200);
  expect(Math.round(after.y - before.y)).toBe(150);

  // Hovering afterwards must not move it.
  await page.mouse.move(x - 200, y + 150);
  await page.mouse.move(x - 260, y + 190, { steps: 5 });
  expect(await panel.boundingBox()).toEqual(after);

  // A second drag still works.
  await page.mouse.move(x - 200, y + 150);
  await page.mouse.down();
  await page.mouse.move(x - 150, y + 150, { steps: 5 });
  await page.mouse.up();
  expect(Math.round((await panel.boundingBox()).x - after.x)).toBe(50);
});

test('clear all needs a second click and removes every note', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(server);
  await page.bringToFront();
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  await toggle();
  const markers = page.locator('poke-ui-root .marker:visible');
  for (const [id, text] of [['buy', 'one'], ['title', 'two']]) {
    await page.locator(`[data-testid="${id}"]`).click();
    await page.getByRole('textbox', { name: 'Note' }).fill(text);
    await page.getByRole('textbox', { name: 'Note' }).press('Enter');
  }
  await expect(markers).toHaveCount(2);

  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(markers).toHaveCount(2);
  await page.getByRole('button', { name: 'Confirm clear all', exact: true }).click();
  await expect(markers).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeDisabled();
  await page.reload();
  await toggle();
  await expect(markers).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeDisabled();
});

test('marker color is chosen from five and applies to every page', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const addNote = async (page, testid) => {
    await page.locator(`[data-testid="${testid}"]`).click();
    await page.getByRole('textbox', { name: 'Note' }).fill('note');
    await page.getByRole('textbox', { name: 'Note' }).press('Enter');
  };
  const markerColor = (page) => page.locator('poke-ui-root .marker').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  const a = await context.newPage();
  await a.goto(server);
  await a.bringToFront();
  await toggle();
  await addNote(a, 'buy');

  const b = await context.newPage();
  await b.goto(server + '?b');
  await b.bringToFront();
  await toggle();
  await addNote(b, 'title');
  expect(await markerColor(b)).toBe('rgb(229, 72, 77)');
  await expect(b.locator('poke-ui-root .panel')).not.toContainText(/false|null/);

  await b.getByRole('button', { name: 'Marker color' }).click();
  const swatches = b.locator('poke-ui-root .swatch');
  await expect(swatches).toHaveCount(5);
  await b.getByRole('button', { name: 'Green', exact: true }).click();
  await expect(swatches).toHaveCount(0);
  await expect(b.locator('poke-ui-root .panel')).not.toContainText(/false|null/);
  await expect.poll(() => markerColor(b)).toBe('rgb(48, 164, 108)');
  await expect.poll(() => markerColor(a)).toBe('rgb(48, 164, 108)');

  await a.reload();
  await a.bringToFront();
  await toggle();
  await expect.poll(() => markerColor(a)).toBe('rgb(48, 164, 108)');
  await b.bringToFront();
  await b.getByRole('button', { name: 'Marker color' }).click();
  await expect(b.getByRole('button', { name: 'Green', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Every selectable color has a toolbar icon (setIcon rejects when the image is missing).
  const hexes = await swatches.evaluateAll((els) => els.map((el) => el.getAttribute('style').match(/#[0-9a-f]{6}/i)[0]));
  expect(hexes).toHaveLength(5);
  await worker.evaluate((list) => Promise.all(list.map((hex) => chrome.action.setIcon(iconFor(hex)))), hexes);
});

test('Enter saves a note and Esc cancels the editor', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(server);
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const markers = page.locator('poke-ui-root .marker:visible');
  const field = page.getByRole('textbox', { name: 'Note' });
  const editor = page.locator('poke-ui-root .editor');
  const rows = page.locator('poke-ui-root .row');

  // Enter saves a new note.
  await page.locator('[data-testid="buy"]').click();
  await expect(field).toBeFocused();
  await field.pressSequentially('Bigger button');
  await field.press('Enter');
  await expect(editor).toBeHidden();
  await expect(markers).toHaveCount(1);
  await expect(rows).toHaveText(['1  Bigger button']);
  // No caret is left behind in the panel (it used to land at the end of the new row's text).
  expect(await page.evaluate(() => document.querySelector('poke-ui-root').shadowRoot.getSelection().rangeCount)).toBe(0);

  // Esc on a new note discards it.
  await page.locator('[data-testid="title"]').click();
  await field.pressSequentially('Throwaway');
  await field.press('Escape');
  await expect(editor).toBeHidden();
  await expect(markers).toHaveCount(1);

  // Esc while editing keeps the saved text; Enter saves the edit.
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await field.fill('Changed my mind');
  await field.press('Escape');
  await expect(rows).toHaveText(['1  Bigger button']);
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await expect(field).toHaveValue('Bigger button');
  await field.fill('Much bigger button');
  await field.press('Enter');
  await expect(rows).toHaveText(['1  Much bigger button']);

  // Esc only closed the editor, not annotation mode.
  await expect(page.locator('poke-ui-root .panel')).toBeVisible();

  // Clicking a pin again closes its note; clicking once more reopens it with the saved text.
  const pin = page.getByRole('button', { name: 'Note 1', exact: true });
  await pin.click();
  await expect(editor).toBeVisible();
  await pin.click();
  await expect(editor).toBeHidden();
  await expect(page.locator('poke-ui-root .highlight')).toBeHidden();
  await expect(page.locator('poke-ui-root .panel')).toBeVisible();
  await pin.click();
  await expect(field).toHaveValue('Much bigger button');
  await field.press('Escape');

  // The field starts one line tall and grows as the text wraps; Enter still saves without a line break.
  await page.locator('[data-testid="title"]').click();
  const height = async () => (await field.boundingBox()).height;
  const oneLine = await height();
  await field.pressSequentially('Tighten the heading and reduce');
  expect(await height()).toBe(oneLine);
  await field.pressSequentially(' the space below it so the list starts closer to it');
  const grown = await height();
  expect(grown).toBeGreaterThan(oneLine * 1.5);
  await field.pressSequentially(' please');
  await field.press('Enter');
  await expect(editor).toBeHidden();
  await expect(rows.nth(1)).toHaveText(
    '2  Tighten the heading and reduce the space below it so the list starts closer to it please',
  );
});

test('the element of the open note stays highlighted', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(server);
  await page.bringToFront();
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const highlight = page.locator('poke-ui-root .highlight');
  const field = page.getByRole('textbox', { name: 'Note' });
  const boxOf = async (locator) => {
    const b = await locator.boundingBox();
    return b && [b.x, b.y, b.width, b.height].map(Math.round);
  };
  const buy = page.locator('[data-testid="buy"]');
  const title = page.locator('[data-testid="title"]');

  await toggle();
  await buy.click();
  await expect(highlight).toBeVisible();
  expect(await boxOf(highlight)).toEqual(await boxOf(buy));

  // Hovering other elements while the note is open doesn't move the box.
  await title.hover();
  await page.locator('[data-testid="li-two"]').hover();
  expect(await boxOf(highlight)).toEqual(await boxOf(buy));

  // Saving releases it; the box follows the hover again.
  await field.fill('Bigger');
  await field.press('Enter');
  await title.hover();
  expect(await boxOf(highlight)).toEqual(await boxOf(title));

  // Opening a saved note from its marker, outside annotation mode, highlights its element.
  await toggle();
  await expect(highlight).toBeHidden();
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await expect(highlight).toBeVisible();
  expect(await boxOf(highlight)).toEqual(await boxOf(buy));
  await field.press('Escape');
  await expect(highlight).toBeHidden();
});

test('theme button cycles Auto, Light and Dark and applies everywhere', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const DARK = 'rgb(28, 28, 31)';
  const LIGHT = 'rgb(255, 255, 255)';
  const bg = (page, part) => page.locator(`poke-ui-root .${part}`).evaluate((el) => getComputedStyle(el).backgroundColor);
  const themeBtn = (page, name) => page.getByRole('button', { name: `Theme: ${name}`, exact: true });

  const a = await context.newPage();
  await a.goto(server);
  await a.bringToFront();
  await toggle();
  await a.getByRole('button', { name: 'Marker color' }).click();

  // Auto follows the browser's color scheme.
  await a.emulateMedia({ colorScheme: 'dark' });
  expect(await bg(a, 'panel')).toBe(DARK);
  await a.emulateMedia({ colorScheme: 'light' });
  expect(await bg(a, 'panel')).toBe(LIGHT);

  // The theme button sits after the five colors, against the right edge of the row.
  const [lastSwatch, btn, row] = await Promise.all([
    a.locator('poke-ui-root .swatch').last().boundingBox(),
    themeBtn(a, 'Auto').boundingBox(),
    a.locator('poke-ui-root .swatches').boundingBox(),
  ]);
  expect(btn.x).toBeGreaterThan(lastSwatch.x + lastSwatch.width);
  expect(Math.round(row.x + row.width - (btn.x + btn.width))).toBe(4);

  // Light and Dark override the browser; the picker stays open while cycling.
  await themeBtn(a, 'Auto').click();
  await a.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => bg(a, 'panel')).toBe(LIGHT);
  await themeBtn(a, 'Light').click();
  await a.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => bg(a, 'panel')).toBe(DARK);
  await expect(themeBtn(a, 'Dark')).toBeVisible();

  // Stored globally: another tab and a reload use it, including the note editor.
  const b = await context.newPage();
  await b.emulateMedia({ colorScheme: 'light' });
  await b.goto(server + '?b');
  await b.bringToFront();
  await toggle();
  await b.locator('[data-testid="buy"]').click();
  expect(await bg(b, 'panel')).toBe(DARK);
  expect(await bg(b, 'editor')).toBe(DARK);
  await b.keyboard.press('Escape');
  await a.reload();
  await a.bringToFront();
  await toggle();
  await expect.poll(() => bg(a, 'panel')).toBe(DARK);

  // Back to Auto.
  await a.getByRole('button', { name: 'Marker color' }).click();
  await themeBtn(a, 'Dark').click();
  await expect(themeBtn(a, 'Auto')).toBeVisible();
  await expect.poll(() => bg(a, 'panel')).toBe(LIGHT);
  await expect.poll(() => bg(b, 'panel')).toBe(LIGHT);
});

test('notes follow in-page navigation', async ({ context, server }) => {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(server + 'a');
  await page.bringToFront();
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await toggleTab(tab);
  });
  const markers = page.locator('poke-ui-root .marker:visible');
  const rows = page.locator('poke-ui-root .row');
  const addNote = async (testid, text) => {
    await page.locator(`[data-testid="${testid}"]`).click();
    await page.getByRole('textbox', { name: 'Note' }).fill(text);
    await page.getByRole('textbox', { name: 'Note' }).press('Enter');
  };

  await toggle();
  await addNote('buy', 'on a');
  await expect(markers).toHaveCount(1);

  // pushState keeps the script alive: page a's note must neither show on /b nor be overwritten by /b's.
  await page.evaluate(() => history.pushState({}, '', '/b'));
  await expect(markers).toHaveCount(0);
  await expect(rows).toHaveCount(0);
  await addNote('title', 'on b');
  await expect(markers).toHaveCount(1);

  await page.goBack();
  await expect(markers).toHaveCount(1);
  await expect(rows).toHaveText(['1  on a']);

  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  const textsAt = (suffix) => Object.entries(stored)
    .filter(([key]) => key.endsWith(suffix))
    .flatMap(([, list]) => list.map((note) => note.text));
  expect(textsAt('/a')).toEqual(['on a']);
  expect(textsAt('/b')).toEqual(['on b']);
});
