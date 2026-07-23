import { RuntimeMessageAction, TabsMessageAction } from './types';
import type {
  RuntimeMessage,
  ShortcutResponse,
  StatusResponse,
  TabsMessage,
} from './types';

interface UrlClass {
  isRestricted: boolean;
  isPdf: boolean;
  isFileRestricted?: boolean;
}

const FILES_PATH = {
  BACKUP_HTML: 'backup.html',
  CONTENT_SCRIPT: 'content.js',
  OFFSCREEN_HTML: 'offscreen.html',
};

const NOTIFICATION_IDS = {
  FILE_PERMISSION: 'file_permission',
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== chrome.runtime.OnInstalledReason.INSTALL) return;
  chrome.tabs.create({
    url: 'https://getlocallens.com/success.html',
  });
  chrome.runtime.setUninstallURL('https://getlocallens.com/uninstall.html');
});

chrome.notifications.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (
      notificationId === NOTIFICATION_IDS.FILE_PERMISSION &&
      buttonIndex === 0
    ) {
      chrome.tabs.create({
        url: `chrome://extensions/?id=${chrome.runtime.id}`,
      });
    }
  },
);

/**
 * Trigger upon icon click / shortcut:
 * - Capture screenshot of the whole tab
 * - Create backup tab if current is restricted / overlay fail
 * - Create an overlay (gray scale on page + drag crop box)
 * */
chrome.action.onClicked.addListener(async (tab) => {
  initialize(tab.id || null, tab.url || null);
});

async function initialize(
  id: number | null,
  url: string | null,
): Promise<void> {
  if (!id || !url) return;

  try {
    const { isRestricted, isPdf, isFileRestricted } = await classifyUrl(url);
    if (isFileRestricted) {
      notifyFilePermission();
      return;
    }

    const capturedImage = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      const backupTabId = await createBackupTab(capturedImage);
      await activateOverlay(backupTabId, capturedImage);
    } else {
      try {
        // Account for user scroll
        await activateOverlay(id, null, isPdf);
      } catch (err) {
        console.error('Injection failed, creating backup tab...', err);
        const backupTabId = await createBackupTab(capturedImage);
        await activateOverlay(backupTabId, capturedImage);
      }
    }
  } catch (err) {
    console.error('On click activation error:', err);
  }
}

/**
 * Ultimate routing system of local-lens since service worker
 * has higher priviledge (access to commands) compared to offscreen or content
 */
chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse | ShortcutResponse) => void,
  ) => {
    switch (message.action) {
      case RuntimeMessageAction.ENSURE_OFFSCREEN: {
        console.debug(message.action);
        (async () => {
          await ensureOffscreenLoaded();
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case RuntimeMessageAction.CAPTURE_VISIBLE_TAB: {
        console.debug(message.action);
        const targetTabId = getTabId(sender);
        (async () => {
          await captureTabImage(targetTabId);
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case RuntimeMessageAction.GET_SHORTCUT: {
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
              shortcut: 'Set shortcut',
            });
          }
        })();
        return true; // Keep channel open for async response
      }
      case RuntimeMessageAction.OPEN_SHORTCUTS_PAGE: {
        console.debug(message.action);
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        sendResponse({ status: 'ok' });
        break;
      }
    }
    return false;
  },
);

/** Capture visible tab image */
async function captureTabImage(tabId: number): Promise<void> {
  const capturedImage = await chrome.tabs.captureVisibleTab({
    format: 'png',
  });

  await chrome.tabs.sendMessage<TabsMessage>(tabId, {
    action: TabsMessageAction.CAPTURE_RESULT,
    payload: {
      imageUrl: capturedImage,
    },
  });
}

/**
 * Get id of the tab that send the message
 */
function getTabId(sender: chrome.runtime.MessageSender): number {
  const targetTabId = sender.tab?.id;
  if (!targetTabId) {
    throw new Error('Missing tab Id');
  }

  return targetTabId;
}

/**
 * Fast check if tab is restricted & if it is pdf
 */
async function classifyUrl(url: string | undefined): Promise<UrlClass> {
  if (!url) return { isRestricted: true, isPdf: false };
  const newUrl = new URL(url);
  const isPdf = newUrl.pathname.toLowerCase().endsWith('.pdf');

  if (newUrl.protocol === 'file:') {
    const isFileAllowed = await chrome.extension.isAllowedFileSchemeAccess();
    if (!isFileAllowed)
      return {
        isRestricted: true,
        isPdf: isPdf,
        isFileRestricted: true,
      };
  }

  const restrictedProtocols = ['chrome:', 'edge:', 'brave:'];
  if (restrictedProtocols.includes(newUrl.protocol))
    return {
      isRestricted: true,
      isPdf: isPdf,
    };

  const restrictedHosts = ['chromewebstore.google.com'];
  if (restrictedHosts.includes(newUrl.hostname))
    return {
      isRestricted: true,
      isPdf: isPdf,
    };

  return { isRestricted: false, isPdf: isPdf };
}

async function notifyFilePermission() {
  chrome.notifications.create(NOTIFICATION_IDS.FILE_PERMISSION, {
    type: 'basic',
    iconUrl: '/icons/128.png',
    title: 'Local Lens',
    message: 'Toggle "Allow access to file URLs" in extension settings',
    buttons: [
      {
        title: 'Go to Settings',
      },
    ],
  });
}

/**
 * Gray out user's screen, listen to click & drag
 * While waiting for user's selectionRect, warming offscreen
 */
async function activateOverlay(
  tabId: number,
  capturedImage: string | null,
  isPdf = false,
): Promise<void> {
  console.debug('warming up offscreen engine...');
  await ensureOffscreenLoaded();

  console.debug('send ACTIVATE_OVERLAY to content');
  await ensureContentLoaded(tabId);

  const overlayResponse = await chrome.tabs.sendMessage<TabsMessage>(tabId, {
    action: TabsMessageAction.ACTIVATE_OVERLAY,
    payload: { imageUrl: capturedImage, isPdf: isPdf },
  });
  if (overlayResponse.status !== 'ok') {
    console.error('Overlay failed:', overlayResponse.message);
    return;
  }
}

/**
 * When hitting restricted sites, ping content to create a similar backup tab
 * @param capturedImage base64 string from captureVisibleTab
 * @returns id of the new tab
 */
async function createBackupTab(capturedImage: string): Promise<number> {
  const tab = await chrome.tabs.create({
    url: FILES_PATH.BACKUP_HTML,
    active: true,
  });

  if (tab.id === undefined) {
    throw new Error('Tab created but ID is undefined.');
  }

  await new Promise<void>((resolve) => {
    const listener = (tabId: number, changeInfo: { status?: string }) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  await chrome.tabs.sendMessage<TabsMessage>(tab.id, {
    action: TabsMessageAction.INITIALIZE_BACKUP,
    payload: {
      imageUrl: capturedImage,
    },
  });
  return tab.id;
}

/**
 * Ensure offscreen engine is ready
 */
async function ensureOffscreenLoaded(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(FILES_PATH.OFFSCREEN_HTML)],
  });

  if (existing.length == 0) {
    await chrome.offscreen.createDocument({
      url: FILES_PATH.OFFSCREEN_HTML,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Processing screenshot image data for OCR',
    });
  }
}

/**
 * Create / ensure floatingIsland UI is ready to be initiated
 */
async function ensureContentLoaded(tabId: number): Promise<void> {
  const supported = await webGpuSupported();
  try {
    await chrome.tabs.sendMessage<TabsMessage>(tabId, {
      action: TabsMessageAction.PING_CONTENT,
      payload: {
        webGpuSupported: supported,
      },
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [FILES_PATH.CONTENT_SCRIPT],
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    await chrome.tabs.sendMessage<TabsMessage>(tabId, {
      action: TabsMessageAction.PING_CONTENT,
      payload: {
        webGpuSupported: supported,
      },
    });
  }
}

async function getShortcutCommand(): Promise<string> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === '_execute_action');

  if (!cmd || !cmd.shortcut) return '';
  return cmd.shortcut;
}

async function webGpuSupported(): Promise<boolean> {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    console.log('GPU Adapter:', adapter);
    return adapter !== null;
  } catch (err) {
    console.error('Error checking WebGPU support:', err);
    return false;
  }
}
