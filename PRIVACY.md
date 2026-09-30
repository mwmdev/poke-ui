# Poke UI privacy policy

## What it handles

Poke UI only runs on a page after you activate it there with its toolbar icon, and it only records the elements you annotate. For each note it stores:

- the page URL (notes are filed under the URL without its `#hash`; each note also keeps the full URL),
- your note text,
- a CSS selector for the element,
- an HTML snippet of the element, up to 400 characters,
- the element's size and position on the page,
- a few computed styles (colors, fonts, spacing, size).

It also stores two preferences: the marker color and the theme.

## Where it is stored

Only in the browser's extension storage (`chrome.storage.local`) on your device.

## Sharing

Nothing is sent anywhere. Poke UI has no servers, analytics, ads, remote code or third parties.

## Clipboard

Notes reach the clipboard only when you click a copy button. What you do with the pasted text is up to you and your tools.

## Deletion

Delete a single note or use Clear all in the panel. Uninstalling the extension removes all stored data.

## Limited Use

The use of information received from this extension complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

https://github.com/mwmdev/poke-ui/issues

Last updated: 2026-09-30
