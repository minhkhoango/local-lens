chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.url?.startsWith('chrome://')) return;

  try {
    const dataUrl: string = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });
    await chrome.storage.session.set({ capturedImage: dataUrl });
    console.log('Snapshot saved in storage');

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'Qm_ACTIVATE_OVERLAY' });
      console.log('content.ts loaded');
    } catch {
      // if content.ts not loaded, we load it now.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      console.log('Injected content.ts');

      await chrome.tabs.sendMessage(tab.id, { action: 'Qm_ACTIVATE_OVERLAY' });
    }
  } catch (err) {
    console.error('Capture failed:', err);
  }
});
