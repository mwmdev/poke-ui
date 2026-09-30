# Chrome Web Store listing

Copy each block into the matching field of the developer dashboard.

## Name

```
Poke UI
```

## Summary

```
Annotate page elements and copy the notes as markdown for your AI harness.
```

## Category

Developer Tools

## Language

English

## Detailed description

```
Poke UI helps you tell an AI coding assistant exactly which part of a page to change.

Click the toolbar icon or press Alt+Shift+A, click any element, type what should change and press Enter. The element gets a numbered pin, and a small panel lists your notes. Click a pin or a note to edit it.

Copy one note, or all of them, as markdown. Each note carries what an assistant needs to find the element: your note, the page URL, a CSS selector, the element's box, its key styles and an HTML snippet. Paste it into any AI coding tool.

Make it yours: five pin colors, plus a light, dark or automatic theme that follows your browser.

Poke UI runs only on the page where you activate it. Notes are saved on your device, per page, and nothing is ever sent anywhere: no account, no servers, no analytics.

After a full page reload, pins stay hidden until you click the icon again. Your notes are still saved.
```

## Single purpose

```
Annotate elements on the current web page and copy those notes, with element context, as markdown for an AI coding assistant.
```

## Permission justifications

activeTab:

```
Gives temporary access to the current tab only when the user clicks the toolbar icon or presses the shortcut, so the annotation tool can run on that page.
```

scripting:

```
Injects the extension's own annotation script into the active tab at that moment; nothing runs on pages the user hasn't activated it on.
```

storage:

```
Saves notes, per page URL, and the marker color and theme preference locally on the device.
```

## Remote code

No, I am not using remote code.

## Data usage

- Check "Website content" and "Web history" (page URLs are used as storage keys).
- Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness.

## Privacy policy URL

```
https://github.com/mwmdev/poke-ui/blob/main/PRIVACY.md
```

## Assets

- `icons/icon128.png`: store icon (96 px artwork, 16 px transparent padding)
- `store/assets/screenshot-1-annotate.png`: 1280×800
- `store/assets/screenshot-2-panel.png`: 1280×800
- `store/assets/screenshot-3-handoff.png`: 1280×800
- `store/assets/promo-440x280.png`: small promo tile

Regenerate the four images in `store/assets/` with `npm run store-assets`.

## Manual upload checklist

1. Register the developer account.
2. `npm run package`
3. Upload `dist/poke-ui-0.1.0.zip`.
4. Paste the fields above.
5. Upload the images.
6. Set visibility to Public.
7. Submit.
