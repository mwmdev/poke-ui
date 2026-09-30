// Records the demo video with the real extension running in headless Chromium:
// store/assets/demo.mp4 (listing/social: title card, demo, end card) and store/assets/demo.gif (README hero: the demo
// only). Run: npm run demo-video
// Needs ffmpeg on PATH. Playwright videos show no cursor, so an overlay draws it along with the captions (store/overlay.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installOverlay } from './overlay.mjs';
import { HOST, openStage, root } from './stage.mjs';

const outDir = path.join(root, 'store', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const GIF_BUDGET = 3e6;

const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-video-'));
const { context, toggle, close } = await openStage({
  colorScheme: 'light',
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
});

let webm;
// Wall-clock seconds (from page creation) where the title card, the demo page and the end card start, and where recording
// stops. The video's first frame comes a moment after page creation; the ffmpeg step converts these to video time.
const marks = {};
try {
  await context.addInitScript(installOverlay);

  // Playwright records from the page's creation.
  const page = await context.newPage();
  const start = Date.now();
  const mark = (name) => { marks[name] = (Date.now() - start) / 1000; };
  await page.bringToFront();
  webm = page.video();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const say = (html) => page.evaluate((h) => window.__caption(h), html);
  const target = (demo) => page.locator(`[data-demo="${demo}"]`);
  const note = page.getByRole('textbox', { name: 'Note' });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const markers = page.locator('poke-ui-root .marker:visible');

  // The drawn cursor glides (see installOverlay); the real mouse then jumps to where it landed.
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
  // `pace` = [glide, pause before the click, pause before typing, pause before Enter] in ms. Note 1 is shown at a
  // teaching pace; notes 2 and 3 repeat the gesture, so they move quicker.
  const annotate = async (demo, text, delay, { captions = {}, pace = [800, 450, 250, 350] } = {}) => {
    const [glideMs, aim, read, review] = pace;
    if (captions.click) await say(captions.click);
    await glideTo(target(demo), glideMs);
    await sleep(aim);
    await page.mouse.click(pos.x, pos.y);
    await note.waitFor();
    if (captions.type) await say(captions.type);
    await sleep(read);
    // Paced against the clock: each key press has its own round-trip, which would otherwise stretch every delay.
    await note.focus();
    const typing = Date.now();
    for (let i = 0; i < text.length; i++) {
      await page.keyboard.type(text[i]);
      await sleep(typing + (i + 1) * delay - Date.now());
    }
    await sleep(review);
    await note.press('Enter');
  };

  // Blank paper while the recorder warms up (its first frames arrive late and are trimmed), so the title card's own
  // fade-in is recorded. Cuts between segments are hard.
  await page.setContent('<body style="margin:0;background:#f4ecdc"></body>');
  await sleep(1000);
  await page.goto(HOST + '/card');
  mark('title');
  await sleep(1800);

  // The page, cursor at rest.
  await page.goto(HOST + '/subscriptions');
  await page.evaluate(([px, py]) => window.__cursorTo(px, py, 0), [pos.x, pos.y]);
  mark('page');
  await sleep(900);

  // Headless Chromium has no toolbar: the caption shows the icon, then the same code path as clicking it.
  await say('Click <img src="/icons/toolbar/b4432a-32.png" alt=""> Poke UI in the toolbar');
  await sleep(1500);
  await toggle();
  await sleep(900);

  await annotate('cta-grower', 'Make this the primary button: 48px tall, bolder label', 42, {
    captions: { click: 'Click any element', type: 'Say what should change' },
  });
  await markers.nth(0).waitFor();
  await sleep(500);
  const quick = [600, 300, 150, 250];
  await annotate('hero', 'Tighten line height and reduce the gap below', 30, { pace: quick });
  await markers.nth(1).waitFor();
  await sleep(300);
  await annotate('cta-collector', 'Match the Grower button style', 30, { pace: quick });
  await markers.nth(2).waitFor();
  await sleep(600);

  await say('Copy every note as markdown');
  await glideTo(button('Copy all'), 900);
  await sleep(350);
  await page.mouse.click(pos.x, pos.y);
  await button('Copied').waitFor();
  await sleep(900);
  const markdown = await page.evaluate(() => navigator.clipboard.readText());

  await page.goto(HOST + '/paste');
  const count = (markdown.match(/^### Annotation /gm) || []).length;
  await page.evaluate(([markdown, count]) => {
    window.showPaste(markdown, count);
    // Scroll inside a clip below the prompt line, not over it.
    const out = document.querySelector('#out');
    const clip = document.createElement('div');
    clip.style.cssText = 'height: 520px; overflow: hidden';
    out.replaceWith(clip);
    clip.append(out);
  }, [markdown, count]);
  await sleep(400);
  await say('Paste it into your assistant');
  await sleep(900);
  // Scroll the pasted text to its end so the viewer sees it is more than a title.
  await page.evaluate(() => {
    const out = document.querySelector('#out');
    const distance = Math.max(0, out.offsetHeight - out.parentElement.clientHeight);
    out.animate(
      [{ transform: 'translateY(0)' }, { transform: `translateY(-${distance}px)` }],
      { duration: 3200, easing: 'ease-in-out', fill: 'forwards' },
    );
  });
  await sleep(4300);
  // The end card has no cursor.
  await page.evaluate(() => sessionStorage.removeItem('demo-cursor'));
  mark('end');
  await page.goto(HOST + '/card?end');
  await sleep(2500);
  mark('stop');
} finally {
  await close();
}

try {
  const source = await webm.path();
  const mp4 = path.join(outDir, 'demo.mp4');
  const gif = path.join(outDir, 'demo.gif');
  const at = (seconds) => Math.max(0, seconds).toFixed(2);
  // The recording ends when the page closes (at the stop mark) but starts late, so shift the wall-clock marks by the gap.
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]));
  const video = (name) => marks[name] - (marks.stop - duration);
  // The whole timeline from the title card; a tenth of a second early only adds paper from the warm-up page.
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-ss', at(video('title') - 0.1), '-i', source,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4,
  ]);
  // The README heading already introduces Poke UI, so the GIF is the demo only: no title or end card. It stays a quarter
  // of a second inside both cuts (the marks land within a frame or two of the cut) so no card frame leaks in.
  const encodeGif = (fps) => execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-ss', at(video('page') + 0.25), '-to', at(video('end') - 0.25), '-i', source,
    '-vf', `fps=${fps},scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];`
      + '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', gif,
  ]);
  encodeGif(10);
  if (fs.statSync(gif).size > GIF_BUDGET) {
    console.log(`demo.gif over ${GIF_BUDGET / 1e6} MB at 10 fps, re-encoding at 8 fps`);
    encodeGif(8);
  }
  for (const file of [mp4, gif]) console.log(path.relative(root, file), `${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
  if (fs.statSync(gif).size > GIF_BUDGET) throw new Error(`demo.gif is over the ${GIF_BUDGET / 1e6} MB budget`);
} finally {
  fs.rmSync(videoDir, { recursive: true, force: true });
}
