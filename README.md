<p align="center">
  <img src="icons/icon128.png" width="96" alt="Poke UI logo">
</p>

<h1 align="center">Poke UI</h1>

<p align="center">
  Point at a UI element, say what should change, and hand your AI coding assistant exactly what it needs to find it.
</p>

<p align="center">
  <img src="store/assets/demo.gif" width="800" alt="Poke UI demo: press Alt+Shift+A, click elements and type notes, copy everything as markdown, paste it into an AI assistant">
</p>

"Make the button bigger" is hard to act on without the page in front of you. Poke UI turns each remark into a small, precise bug report: your note plus the element's CSS selector, box, key styles and HTML. Copy one note or all of them as markdown and paste them into Claude Code, Codex, Cursor, or any other assistant.

- **Click, type, Enter.** Annotate any element on any page, live or local.
- **Markdown out.** One paste carries every note with the context an assistant needs.
- **Runs only when you ask.** No always-on script and no site access at install; it activates on the tab you click it on.
- **Local only.** Notes live in your browser. Nothing is sent anywhere.

## Install

Poke UI is a plain-JS Manifest V3 extension with no build step, for Chromium-based browsers such as Chrome and Brave.

1. Clone this repo.
2. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the repo folder.

## Use

1. Click the toolbar icon or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> (change it at `chrome://extensions/shortcuts`). A small panel appears.
2. Click any element. Type what should change and press <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to cancel.
3. Click a numbered pin, or a note in the panel, to edit it.
4. Hover a note in the panel to copy or delete just that one. **Copy all** copies every note on the page as markdown. **Clear all** and each delete ask for a second click first.
5. Paste into your assistant.

The panel's **Done** button leaves annotation mode; the pins stay, and clicking a pin brings the panel back.

### Make it yours

<p align="center">
  <img src="store/assets/screenshot-2-panel.png" width="720" alt="The panel in dark theme with the marker color row open">
</p>

The colored dot in the panel picks the pin color (five choices) and also tints the toolbar icon. The button at the end of that row cycles the theme: Auto (follows the browser), Light, Dark. The panel is draggable by its grip.

## What you paste

````markdown
# Annotations

### Annotation 1

Make this the primary button: 48px tall, bolder label

- URL: https://northwind.example/pricing
- Selector: `button.cta.fill`
- Box (document px): x=506 y=588 width=267 height=44
- Styles: `background-color: rgb(37, 99, 235); border-radius: 10px; font-size: 15px; font-weight: 600; …`

```html
<button class="cta fill" data-demo="cta-pro">Start free trial</button>
```
````

| Field | What it is |
| --- | --- |
| Note | Your text |
| URL | The full page URL |
| Selector | A CSS selector that matches only that element, anchored at a unique `id` when there is one |
| Box | Position and size in document pixels |
| Styles | 14 computed properties: color, background, font, spacing, border, display, size |
| HTML | The element's markup, cut at 400 characters |

Notes are stored per page URL (the `#hash` is ignored) and follow in-page navigation in single-page apps. A note whose element no longer exists is shown struck through in the panel.

## Privacy

Everything stays in `chrome.storage.local` on your device. There are no servers, analytics, ads or remote code. Notes reach the clipboard only when you click a copy button. See [PRIVACY.md](PRIVACY.md).

| Permission | Why |
| --- | --- |
| `activeTab` | Temporary access to the current tab, granted only when you click the icon or press the shortcut |
| `scripting` | Injects the annotation script into that tab at that moment |
| `storage` | Saves notes, marker color and theme on your device |

There are no host permissions and no content script, so the browser shows no "read and change all your data on all websites" warning at install. The flip side: after a full page reload the pins stay hidden until you activate Poke UI on that page again. The notes are still saved. Browsers do not allow extensions on internal pages such as `chrome://` or the Chrome Web Store.

## Development

```sh
npm install
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium npm test
```

The tests load the extension in headless Chromium. The env var is only needed on NixOS; elsewhere `npm test` uses Playwright's own Chromium.

| Command | Does |
| --- | --- |
| `npm test` | Playwright end-to-end tests (`tests/`) |
| `npm run package` | Builds `dist/poke-ui-<version>.zip` with only the runtime files |
| `npm run store-assets` | Regenerates the screenshots and promo tile in `store/assets/` |
| `npm run demo-video` | Records `store/assets/demo.mp4` and `demo.gif` (needs `ffmpeg`) |
| `icons/build.sh` | Regenerates the logo, store icon and toolbar icons (needs `node`, `inkscape`, ImageMagick) |

The asset scripts drive the real extension against a fictional pricing page (`store/demo.html`), so they need the same browser setup as the tests.

```text
manifest.json    MV3 manifest
background.js    toolbar click and shortcut: inject content.js into the active tab, toggle it
content.js       the whole UI (pins, panel, editor) in a shadow root, plus storage and markdown
icons/           logo, generator (pinch.mjs, build.sh) and the toolbar icons, one set per pin color
tests/           Playwright tests and the fixture page
store/           Web Store listing text, asset and video scripts
scripts/         packaging
```
