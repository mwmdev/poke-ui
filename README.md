# anot

Chromium MV3 extension (plain JS, no build step). Annotate page elements, then copy the notes as markdown for your AI harness.

## Use

1. `chrome://extensions` → Developer mode → Load unpacked → select this folder.
2. Click the toolbar icon or press `Alt+Shift+A` to toggle annotation mode.
3. Click an element, write a note, Save. Click a numbered marker to edit, copy or delete it.
4. `Copy all` in the panel copies every note on the page; `Copy` in a note's editor copies just that one.

Notes are stored per page URL (without hash) in `chrome.storage.local` and survive reloads.

## Test

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium npx playwright test
```

The env var is needed on NixOS; elsewhere `npx playwright test` works with Playwright's own Chromium.
