import { OCR_CONFIG, ISLAND_STORAGE } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  SelectionRect,
  ShortcutResponse,
  StatusResponse,
  Settings,
  EngineOption,
  OcrResponse,
  PerformOcrPayload,
} from './types';
import type { TesseractLang } from './language_map';

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

/**
 * Trigger upon icon click / shortcut:
 * - Capture screenshot of the whole tab
 * - Create backup tab if current is restricted / overlay fail
 * - Create an overlay (gray scale on page + drag crop box)
 * */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    const { isRestricted, isPdf, isFileRestricted } = await classifyUrl(
      tab.url,
    );
    if (isFileRestricted) {
      notifyFilePermission();
      return;
    }

    const capturedImage = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.FORMAT,
    });

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      const backupTabId = await createBackupTab(capturedImage);
      await activateOverlay(backupTabId, capturedImage);
    } else {
      try {
        await activateOverlay(tab.id, capturedImage, isPdf);
      } catch (err) {
        console.debug('Injection failed, creating backup tab...', err);
        const backupTabId = await createBackupTab(capturedImage);
        await activateOverlay(backupTabId, capturedImage);
      }
    }
  } catch (err) {
    console.error('On click activation error:', err);
  }
});

/**
 * Ultimate routing system of local-lens since service worker
 * has higher priviledge (access to commands) compared to offscreen or content
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (
      response: StatusResponse | ShortcutResponse | OcrResponse,
    ) => void,
  ) => {
    switch (message.action) {
      case ExtensionAction.ENSURE_OFFSCREEN: {
        console.debug(message.action);
        (async () => {
          await ensureOffscreenLoaded();
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case ExtensionAction.CAPTURE_SUCCESS: {
        const targetTabId = getTabId(sender);
        console.debug(message.action);
        (async () => {
          await transferCapture(targetTabId, message.payload);
          sendResponse({ status: 'ok' });
        })();
        return true;
      }
      case ExtensionAction.BG_PERFORM_OCR: {
        console.debug(message.action);
        (async () => {
          const targetTabId = getTabId(sender);
          const ocrResult = await transferPerformOcr(
            targetTabId,
            message.payload,
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
              shortcut: 'Set shortcut',
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
  },
);

/**
 * Get id of the tab that send the message
 */
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
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/48.png',
    title: chrome.runtime.getManifest().name,
    message:
      'Allow access to file URLs is disabled, enable in \"Manage extensions\"',
  });
}

/**
 * Gray out user's screen, listen to click & drag
 * While waiting for user's selectionRect, warming offscreen
 */
async function activateOverlay(
  tabId: number,
  capturedImage: string,
  isPdf = false,
): Promise<void> {
  try {
    await ensureContentLoaded(tabId);

    console.debug('send ACTIVATE_OVERLAY to content');
    const overlayResponse = await chrome.tabs.sendMessage<ExtensionMessage>(
      tabId,
      {
        action: ExtensionAction.ACTIVATE_OVERLAY,
        payload: { imageUrl: capturedImage, isPdf: isPdf },
      },
    );
    if (overlayResponse.status !== 'ok') {
      console.error('Overlay failed:', overlayResponse.message);
      return;
    }

    console.debug('warming up offscreen engine...');
    // warm up the offscreen engine
    await ensureOffscreenLoaded();
  } catch (err) {
    throw err;
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

  await chrome.tabs.sendMessage<ExtensionMessage>(tab.id, {
    action: ExtensionAction.INITIALIZE_BACKUP,
    payload: {
      imageUrl: capturedImage,
    },
  });
  return tab.id;
}

/**
 * Create / ensure offscreen OCR script is ready
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

  // Initialize engine with saved settings
  let language: TesseractLang = 'eng';
  let engine: EngineOption = 'tesseract';
  try {
    const stored = await chrome.storage.local.get([ISLAND_STORAGE]);
    const saved = stored[ISLAND_STORAGE] as Partial<Settings>;
    language = saved.language || 'eng';
    engine = saved.engine || 'tesseract';
  } catch {}
  console.log('Offscreen init with lang:', language, 'engine:', engine);

  await chrome.runtime.sendMessage<ExtensionMessage>({
    action: ExtensionAction.SETUP_ENGINE,
    payload: {
      engine: engine,
      language: language,
    },
  });
}

/**
 * Create / ensure floatingIsland UI is ready to be initiated
 */
async function ensureContentLoaded(tabId: number): Promise<void> {
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

/**
 * A inefficient bridge that transfer selectionRect from overlay -> bg -> content
 * @param tabId Id of the tab of the island that sent PERFORM_OCR request
 * @param payload dimension of user's cropped rectangle
 */
async function transferCapture(
  tabId: number,
  payload: SelectionRect,
): Promise<void> {
  console.debug('Transfering capture success bg -> content');
  await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
    action: ExtensionAction.CAPTURE_SUCCESS,
    payload: payload as SelectionRect,
  });
}

/**
 * A inefficient bridge that transfer updated language from island.index -> bg -> content
 * @param tabId Id of the tab of the island that sent PERFORM_OCR request
 * @param payload new language
 */
async function transferPerformOcr(
  tabId: number,
  payload: PerformOcrPayload,
): Promise<OcrResponse> {
  console.debug('Transfering language payload bg -> content');
  const ocrResult = await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
    action: ExtensionAction.BG_PERFORM_OCR,
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
