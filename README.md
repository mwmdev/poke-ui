# Poke UI

Chromium MV3 extension (plain JS, no build step). Annotate page elements, then copy the notes as markdown for your AI harness.

## Use

1. `chrome://extensions` → Developer mode → Load unpacked → select this folder.
2. Click the toolbar icon or press `Alt+Shift+A` to toggle annotation mode.
3. Click an element, type a note, press Enter to save (Esc cancels). Click a numbered marker or a note in the panel to edit it.
4. Hover a note in the panel to copy or delete just that note; `Copy all` and `Clear all` in the panel act on every note on the page.

Notes are stored per page URL (without hash) in `chrome.storage.local` and survive reloads. Poke UI has no always-on content script: it injects itself when you click the icon or press the shortcut, so after a full page reload the pins stay hidden until you activate it again.

The colored dot in the panel picks the marker color (five choices). It applies to every page and to the toolbar icon. The button at the end of that row cycles the panel and editor theme: Auto (follows the browser's light/dark setting), Light, Dark.

## Icons

`icons/build.sh` regenerates the logo, the store icon and the toolbar icons (one set per marker color). It needs `node`, `inkscape` and ImageMagick (`magick`).

## Web Store

- `npm run package` builds `dist/poke-ui-<version>.zip` with only the runtime files.
- `npm run store-assets` regenerates the screenshots and promo tile in `store/assets/` (drives the extension in headless Chromium; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` on NixOS).
- `store/listing.md` has the dashboard text and the upload checklist; `PRIVACY.md` is the privacy policy.

## Test

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium npx playwright test
```

The env var is needed on NixOS; elsewhere `npx playwright test` works with Playwright's own Chromium.
