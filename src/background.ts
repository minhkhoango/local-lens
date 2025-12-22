chrome.action.onClicked.addListener(async () => {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    console.log('Captured image: ', dataUrl);
    await chrome.tabs.create({ url: dataUrl });
  } catch (error) {
    console.error('Capture failed:', error);
  }
});
