chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (tab.url.startsWith('chrome://')) {
    console.warn('Protected site, retreat');
    return;
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    await chrome.storage.session.set({ lastCapture: dataUrl });

    const lastCapture = await chrome.storage.session.get('lastCapture');
    console.log('Success:', lastCapture);
  } catch (error) {
    console.error('Capture failed:', error);
  }
});
