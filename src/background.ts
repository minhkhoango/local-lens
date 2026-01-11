import { FILES_PATH, STORAGE_KEYS, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type { ExtensionMessage, MessageResponse } from './types';

// tool bar icon click, chrome handle the shortcut automatically
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  await chrome.storage.session.set({ [STORAGE_KEYS.TAB_ID]: tab.id });

  try {
    console.debug('screenshot');
    const capturedImage = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.CAPTURE_FORMAT,
    });

    const isRestricted = isRestrictedUrl(tab.url);

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      await createBackupTab(capturedImage);
      await activateOverlay(capturedImage);
    } else {
      try {
        await activateOverlay(capturedImage);
      } catch {
        console.debug('Injection failed on standard site, creating backup tab');
        await createBackupTab(capturedImage);
        await activateOverlay(capturedImage);
      }
    }
  } catch (err) {
    console.error('On click activation error:', err);
  }
});

// Routing messages across scripts
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.ENSURE_OFFSCREEN: {
        console.debug(message.action);
        (async () => {
          await ensureOffscreen();
          sendResponse({ status: 'ok' });
        })();
        return false;
      }
      case ExtensionAction.GET_SHORTCUT: {
        console.debug(message.action);
        // Handle async work in IIFE while returning true synchronously
        (async () => {
          try {
            const shortcutCommand = await getShortcutCommand();
            sendResponse({
              status: 'ok',
              shortcut: shortcutCommand,
            });
          } catch (err) {
            sendResponse({
              status: 'error',
              message: (err as Error).message,
            });
          }
        })();
        return true; // Keep channel open for async response
      }
      case ExtensionAction.OPEN_SHORTCUTS_PAGE: {
        console.debug(message.action);
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        sendResponse({ status: 'ok' });
        return false; // Synchronous response
      }
    }
    return false;
  }
);

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  const newUrl = new URL(url);

  // Check protocol (https, chrome://, ...)
  const restrictedProtocols = ['chrome:', 'edge:', 'brave:', 'file:'];
  if (restrictedProtocols.includes(newUrl.protocol)) return true;

  // Check domain
  const restrictedHosts = ['chromewebstore.google.com'];
  if (restrictedHosts.includes(newUrl.hostname)) return true;

  return false;
}

async function activateOverlay(capturedImage: string): Promise<void> {
  const tabId = await getTabId('stop run ocr on tab');

  try {
    await ensureContentScriptLoaded(tabId);

    console.debug('send ACTIVATE_OVERLAY to content');
    const overlayResponse = await chrome.tabs.sendMessage<ExtensionMessage>(
      tabId,
      {
        action: ExtensionAction.ACTIVATE_OVERLAY,
        payload: { imageUrl: capturedImage },
      }
    );
    if (overlayResponse.status !== 'ok') {
      console.error('Overlay failed:', overlayResponse.message);
      return;
    }

    console.debug('warming up offscreen engine...');
    // warm up the offscreen engine
    await ensureOffscreen();
  } catch (err) {
    throw err;
  }
}

async function createBackupTab(capturedImage: string): Promise<void> {
  const tab = await chrome.tabs.create({
    url: FILES_PATH.BACKUP_HTML,
    active: true,
  });

  if (tab.id === undefined) {
    throw new Error('Tab created but ID is undefined.');
  }

  // Wait for tab to fully load before returning
  await new Promise<void>((resolve) => {
    const listener = (tabId: number, changeInfo: { status?: string }) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Send the captured image to the backup tab
  await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
    action: ExtensionAction.INITIALIZE_BACKUP,
    payload: {
      imageUrl: capturedImage,
    },
  });

  await chrome.storage.session.set({ [STORAGE_KEYS.TAB_ID]: tab.id });
}

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(FILES_PATH.OFFSCREEN_HTML)],
  });

  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: FILES_PATH.OFFSCREEN_HTML,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: OCR_CONFIG.JUSTIFICATION,
  });
}

async function ensureContentScriptLoaded(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: ExtensionAction.PING_CONTENT,
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [FILES_PATH.CONTENT_SCRIPT],
    });
  }
}

async function getShortcutCommand(): Promise<string> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === '_execute_action');

  if (!cmd || !cmd.shortcut) return '';
  return cmd.shortcut;
}

async function getTabId(error_message?: string): Promise<number> {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.TAB_ID);
  const tabId = stored[STORAGE_KEYS.TAB_ID] as number | undefined;
  if (!tabId) {
    console.error('tabId not found', error_message);
    throw new Error('tabId not found');
  }

  return tabId;
}
