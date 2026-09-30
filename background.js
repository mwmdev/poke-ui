// A toolbar click lands here.
async function toggleTab(tab) {
  if (!tab || tab.id == null) return;
  const msg = { type: 'pokeui:toggle' };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Not injected in this page yet (first use since load): inject, then toggle.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {
      console.warn('poke-ui: cannot annotate this page', err);
    }
  }
}

chrome.action.onClicked.addListener(toggleTab);

// The toolbar icon's dot shows the marker color picked in the widget (icons/toolbar/<hex>-<size>.png).
function iconFor(color = '#b4432a') {
  const hex = color.slice(1);
  return { path: { 16: `icons/toolbar/${hex}-16.png`, 32: `icons/toolbar/${hex}-32.png` } };
}
// Marker colors before the redesign map to their replacements (same order in the picker).
const LEGACY = { '#e5484d': '#b4432a', '#f76b15': '#8c6310', '#30a46c': '#4d6b2c', '#0090ff': '#22696f', '#8e4ec6': '#7a4577' };
async function migrateColor() {
  const { markerColor } = await chrome.storage.local.get('markerColor');
  const color = LEGACY[markerColor] || markerColor;
  if (color !== markerColor) await chrome.storage.local.set({ markerColor: color });
  await chrome.action.setIcon(iconFor(color));
}
migrateColor();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.markerColor) chrome.action.setIcon(iconFor(changes.markerColor.newValue));
});
