import { FILES_PATH, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  LanguagePayload,
  SelectionRect,
  ShortcutResponse,
  StatusResponse,
} from './types';

// tool bar icon click, chrome handle the shortcut automatically
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    console.debug('screenshot');
    const capturedImage = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.CAPTURE_FORMAT,
    });

    const isRestricted = isRestrictedUrl(tab.url);

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      const backupTabId = await createBackupTab(capturedImage);
      await activateOverlay(backupTabId, capturedImage);
    } else {
      try {
        await activateOverlay(tab.id, capturedImage);
      } catch {
        console.debug('Injection failed on standard site, creating backup tab');
        const backupTabId = await createBackupTab(capturedImage);
        await activateOverlay(backupTabId, capturedImage);
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
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse | ShortcutResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.ENSURE_OFFSCREEN: {
        console.debug(message.action);
        (async () => {
          await ensureOffscreen();
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case ExtensionAction.NOTIFY_CAPTURE_SUCCESS: {
        console.debug(message.action);
        const targetTabId = getTabId(sender);
        (async () => {
          await transferCapture(targetTabId, message.payload);
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case ExtensionAction.REQUEST_LANGUAGE_UPDATE: {
        console.debug(message.action);
        const targetTabId = getTabId(sender);
        (async () => {
          const ocrResult = await transferLanguage(
            targetTabId,
            message.payload
          );
          sendResponse(ocrResult);
        })();
        return true;
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
              shortcut: null,
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

function getTabId(sender: chrome.runtime.MessageSender): number {
  try {
    const targetTabId = sender.tab?.id;
    if (!targetTabId) {
      throw new Error('Missing tab Id');
    }

    return targetTabId;
  } catch (err) {
    throw err;
  }
}

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

async function activateOverlay(
  tabId: number,
  capturedImage: string
): Promise<void> {
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

async function createBackupTab(capturedImage: string): Promise<number> {
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
  return tab.id;
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

async function transferCapture(
  tabId: number,
  payload: SelectionRect
): Promise<void> {
  console.debug('Transfering capture success bg -> content');
  await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
    action: ExtensionAction.CAPTURE_SUCCESS,
    payload: payload as SelectionRect,
  });
}

async function transferLanguage(tabId: number, payload: LanguagePayload) {
  console.debug('Transfering language payload bg -> content');
  const ocrResult = await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
    action: ExtensionAction.UPDATE_LANGUAGE,
    payload: payload,
  });
  return ocrResult;
}

async function getShortcutCommand(): Promise<string> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === '_execute_action');

  if (!cmd || !cmd.shortcut) return '';
  return cmd.shortcut;
}
