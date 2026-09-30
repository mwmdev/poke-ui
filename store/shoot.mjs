// Generates the Web Store images in store/assets/ with the real extension running in headless Chromium:
// three 1280x800 screenshots and the 440x280 promo tile, plus the README header lockup. Run: npm run store-assets
import fs from 'node:fs';
import path from 'node:path';
import { installOverlay } from './overlay.mjs';
import { HOST, openStage, root } from './stage.mjs';

const outDir = path.join(root, 'store', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const { context, worker, toggle, close } = await openStage();
try {
  // The caption label; screenshots never place the cursor, so it stays hidden.
  await context.addInitScript(installOverlay);

  const page = await context.newPage();
  await page.bringToFront();
  // Fast-forwards the panel/editor fades and the caption's entrance, so nothing is captured half-done.
  const shot = (name) => page.screenshot({ path: path.join(outDir, name), animations: 'disabled' });
  // Replacing a visible caption swaps its text after a 160ms fade-out, so wait until the new text is the one shown.
  const caption = async (n, text) => {
    await page.evaluate(([n, text]) => window.__caption(text, n), [n, text]);
    await page.locator('.caption.on').filter({ hasText: text }).waitFor();
  };
  const target = (demo) => page.locator(`[data-demo="${demo}"]`);
  const note = page.getByRole('textbox', { name: 'Note' });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const markers = page.locator('poke-ui-root .marker:visible');

  // 1. Annotating, light theme, Rust: two saved notes, the third typed into the editor on its (selected) element.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(HOST + '/subscriptions');
  await toggle();
  for (const [demo, text, count] of [
    ['cta-grower', 'Make this the primary button: 48px tall, bolder label', 1],
    ['hero', 'Tighten line height and reduce the gap below', 2],
  ]) {
    await target(demo).click();
    await note.fill(text);
    await note.press('Enter');
    await markers.nth(count - 1).waitFor();
  }
  await target('cta-collector').click();
  await note.fill('Match the Grower button style');
  await target('cta-collector').hover();
  await caption('01', 'Point at anything. Say what should change.');
  await shot('screenshot-1-annotate.png');

  // 2. The list: note 3 saved, dark theme, Teal pins, the color picker open, the first row hovered.
  await note.press('Enter');
  await markers.nth(2).waitFor();
  await worker.evaluate(() => chrome.storage.local.set({ theme: 'dark', markerColor: '#22696f' }));
  await page.waitForFunction(() => {
    const el = document.querySelector('poke-ui-root')?.shadowRoot?.querySelector('.panel');
    return el && getComputedStyle(el).backgroundColor === 'rgb(31, 27, 23)';
  });
  await button('Marker color').click();
  await page.locator('poke-ui-root .row').first().hover();
  await caption('02', 'Every note in one list, ready to copy.');
  await shot('screenshot-2-panel.png');

  // 3. The hand-off: the copied markdown pasted into an assistant's terminal.
  await button('Marker color').click();
  await button('Copy all').click();
  await button('Copied').waitFor();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(HOST + '/paste');
  const count = (markdown.match(/^### Annotation /gm) || []).length;
  await page.evaluate(([markdown, count]) => {
    window.showPaste(markdown, count);
    // The same 520px window as the video's scroll clip, so the text stops above the caption instead of running under it.
    Object.assign(document.querySelector('#out').style, { height: '520px', overflow: 'hidden' });
  }, [markdown, count]);
  await caption('03', 'Paste it into your assistant.');
  await shot('screenshot-3-handoff.png');

  // README header: the title card's lockup on a transparent background, one per GitHub theme.
  for (const scheme of ['light', 'dark']) {
    await page.goto(`${HOST}/card?lockup=${scheme}`);
    await page.locator('.card.in').waitFor();
    await page.locator('.lockup').screenshot({
      path: path.join(outDir, `lockup-${scheme}.png`), animations: 'disabled', omitBackground: true,
    });
  }

  // Promo tile.
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(HOST + '/promo');
  await shot('promo-440x280.png');
} finally {
  await close();
}
