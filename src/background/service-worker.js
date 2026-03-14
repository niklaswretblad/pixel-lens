// Service worker: runs in the background, separate from any web page.
// It listens for messages from the popup and keyboard shortcut commands,
// then forwards them to the content script on the active tab.
//
// Communication flow:
//   popup.js / keyboard shortcut  →  service-worker.js  →  overlay.js (content script)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
      }
    });
  }

  if (message.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getState' }, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }
});

// Keyboard shortcut handler (Alt+Shift+L by default)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-pixel-lens') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
      }
    });
  }
});
