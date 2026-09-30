// Toolbar click and the _execute_action shortcut both land here.
async function toggleTab(tab) {
  if (!tab || tab.id == null) return;
  const msg = { type: 'pokeui:toggle' };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Tab was open before the extension was installed/reloaded: inject once, then retry.
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
function iconFor(color = '#e5484d') {
  const hex = color.slice(1);
  return { path: { 16: `icons/toolbar/${hex}-16.png`, 32: `icons/toolbar/${hex}-32.png` } };
}
chrome.storage.local.get('markerColor').then(({ markerColor }) => chrome.action.setIcon(iconFor(markerColor)));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.markerColor) chrome.action.setIcon(iconFor(changes.markerColor.newValue));
});
