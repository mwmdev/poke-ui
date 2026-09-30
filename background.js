// Toolbar click and the _execute_action shortcut both land here.
async function toggleTab(tab) {
  if (!tab || tab.id == null) return;
  const msg = { type: 'anot:toggle' };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Tab was open before the extension was installed/reloaded: inject once, then retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {
      console.warn('anot: cannot annotate this page', err);
    }
  }
}

chrome.action.onClicked.addListener(toggleTab);
