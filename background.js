/* BreakFree background worker.
   Chrome does not run content scripts in tabs that were already open when the
   extension is installed, updated or reloaded. This puts them there, so open
   YouTube tabs follow the popup straight away without a page reload. */
const PAGES = ['*://www.youtube.com/*', '*://www.youtube-nocookie.com/*'];
const FILES = ['features.js', 'core.js', 'content.js'];

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: PAGES });
  for (const tab of tabs) {
    if (tab.discarded) continue;
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: FILES }).catch(() => {});
  }
});

/* Remember where BreakFree opens. After you open it in the side panel once, the toolbar
   icon opens the side panel; choosing "Use the popup instead" switches it back.
   Chrome resets these on restart, so apply the saved choice at startup too. */
async function applyOpenMode() {
  const { 'bf.ui': ui } = await chrome.storage.local.get('bf.ui');
  const panel = !!(ui && ui.panel);
  await chrome.action.setPopup({ popup: panel ? '' : 'popup.html' });
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: panel }).catch(() => {});
  }
}
chrome.runtime.onStartup.addListener(applyOpenMode);
chrome.runtime.onInstalled.addListener(applyOpenMode);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes['bf.ui']) applyOpenMode(); });
