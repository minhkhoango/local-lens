import {
  CHROME_TO_TESSERACT,
  type ChromeLang,
  type TesseractLang,
} from './language_map';
import { FILES_PATH, STORAGE_KEYS, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  OcrResultPayload,
  SelectionRect,
  CropReadyPayload,
  IslandSettings,
  UserLanguage,
} from './types';

// Track the tab that initiated OCR (for forwarding CROP_READY)
let activeOcrTabId: number | undefined;
let capturedImage: string | null = null;
let croppedImage: string | null = null;

// tool bar icon click, chrome handle the shortcut automatically
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    console.debug('screenshot');
    capturedImage = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.CAPTURE_FORMAT,
    });

    let targetTabId = tab.id;
    const isRestricted = isRestrictedUrl(tab.url);

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      targetTabId = await createBackupTab();
      await runOcrOnTab(targetTabId, true);
    } else {
      try {
        await runOcrOnTab(targetTabId, false);
      } catch {
        console.debug('Injection failed on standard site, creating backup tab');
        targetTabId = await createBackupTab();

        await runOcrOnTab(targetTabId, true);
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
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.CAPTURE_SUCCESS: {
        console.debug(message.action);
        // Handle async work in IIFE while returning true synchronously
        (async () => {
          try {
            await handleCaptureSuccess(message.payload, sender.tab?.id);
            sendResponse({ status: 'ok' });
          } catch (err) {
            sendResponse({
              status: 'error',
              message: (err as Error).message,
            });
          }
        })();
        return true; // Keep channel open for async response
      }
      case ExtensionAction.REQUEST_LANGUAGE_UPDATE: {
        console.debug(message.action);
        (async () => {
          try {
            const isOffscreenReady = ensureOffscreenAlive();
            if (!isOffscreenReady) {
              throw new Error('Could not start OCR engine');
            }

            const { language } = message.payload;

            // Forward command to offscreen doc
            const response = await chrome.runtime.sendMessage<
              ExtensionMessage,
              MessageResponse
            >({
              action: ExtensionAction.UPDATE_LANGUAGE,
              payload: {
                language: language,
                croppedImage: croppedImage,
              },
            });

            // return to island handleLanguageUpdate
            sendResponse(response);
          } catch (err) {
            console.error('Language update failed:', err);
            sendResponse({
              status: 'error',
              message: (err as Error).message,
            });
          }
        })();
        return true; // keep chanenl open
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
      case ExtensionAction.CROP_READY: {
        console.debug(message.action);
        if (message.payload?.croppedImageUrl) {
          croppedImage = message.payload.croppedImageUrl;
        }
        if (activeOcrTabId) {
          sendCropReadyToTab(activeOcrTabId, message.payload);
        }
        return false; // No response needed
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
  const restrictedProtocols = [
    'chrome:',
    'edge:',
    'brave:',
    'about:',
    'view-source:',
    'chrome-extension:',
    'file:',
  ];
  if (restrictedProtocols.includes(newUrl.protocol)) return true;

  // Check domain
  const restrictedHosts = ['chrome.google.com', 'chromewebstore.google.com'];
  if (restrictedHosts.includes(newUrl.hostname)) return true;

  return false;
}

async function runOcrOnTab(tabId: number, isBackupTab = false) {
  try {
    if (!isBackupTab) {
      console.debug('load content.ts on tab:', tabId);
      await ensureContentScriptLoaded(tabId);
    } else {
      console.debug('backup tab - content script already loaded');
    }

    console.debug('send ACTIVATE_OVERLAY to content');
    const overlayResponse = await chrome.tabs.sendMessage<ExtensionMessage>(
      tabId,
      {
        action: ExtensionAction.ACTIVATE_OVERLAY,
      }
    );
    if (overlayResponse.status !== 'ok') {
      console.error('Overlay failed:', overlayResponse.message);
      return;
    }

    console.debug('warming up offscreen engine...');
    // warm up the offscreen engine
    await setupOffscreenDocument(FILES_PATH.OFFSCREEN_HTML);
  } catch (err) {
    throw err;
  }
}

async function createBackupTab(): Promise<number> {
  if (!capturedImage) {
    throw new Error('capturedImage not found!, no new Tab');
  }

  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL('backup.html'),
  });

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

  const { language, source } = await getUserLanguage();
  console.debug(`Get user language for backup: ${language}, source: ${source}`);

  // Send the captured image to the backup tab
  await chrome.tabs.sendMessage<ExtensionMessage>(tab.id!, {
    action: ExtensionAction.INITIALIZE_BACKUP,
    payload: {
      imageUrl: capturedImage,
      language: language,
    },
  });

  return tab.id!;
}

async function handleCaptureSuccess(
  payload: SelectionRect,
  tabId?: number
): Promise<void> {
  // Track active tab for CROP_READY forwarding
  activeOcrTabId = tabId;

  if (!capturedImage) {
    console.error('No image found in storage');
    sendOcrResultToTab(tabId, {
      success: false,
      text: 'No screenshot found',
      confidence: 0,
      croppedImageUrl: '',
      cursorPosition: {
        x: payload.x + payload.width,
        y: payload.y + payload.height,
      },
    });
    return;
  }
  console.debug('image found in storage, warming offscreen');

  try {
    const isOffscreenReady = await ensureOffscreenAlive();
    if (!isOffscreenReady) {
      console.error('Offscreen not reachable, aborting OCR');
      sendOcrResultToTab(tabId, {
        success: false,
        text: 'OCR engine not ready',
        confidence: 0,
        croppedImageUrl: '',
        cursorPosition: {
          x: payload.x + payload.width,
          y: payload.y + payload.height,
        },
      });
      return;
    }

    const { language, source } = await getUserLanguage();
    console.debug(`User language: ${language}, source: ${source}`);

    console.debug(`sending rect ${payload}, lang: ${language} to PERFORM_OCR`);
    const ocrResult = await chrome.runtime.sendMessage<
      ExtensionMessage,
      MessageResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        imageDataUrl: capturedImage,
        rect: payload,
        language: language,
      },
    });

    console.debug('OCR result:', ocrResult);
    if (ocrResult === undefined) {
      sendOcrResultToTab(tabId, {
        success: false,
        text: 'No OCR response from offscreen',
        confidence: 0,
        croppedImageUrl: '',
        cursorPosition: {
          x: payload.x + payload.width,
          y: payload.y + payload.height,
        },
      });
      return;
    }

    // Forward result to content script for UI display
    const resultPayload: OcrResultPayload = {
      success: ocrResult.status === 'ok',
      text: ocrResult.message || '',
      confidence: ocrResult.confidence || 0,
      croppedImageUrl: ocrResult.croppedImageUrl || '',
      cursorPosition: {
        x: payload.x + payload.width,
        y: payload.y + payload.height,
      },
    };

    console.debug(`sending ${resultPayload} OCR_RESULT to update UI`);
    sendOcrResultToTab(tabId, resultPayload);
  } catch (err) {
    console.error('Offscreen communication failed:', err);
    sendOcrResultToTab(tabId, {
      success: false,
      text: (err as Error).message,
      confidence: 0,
      croppedImageUrl: '',
      cursorPosition: {
        x: payload.x + payload.width,
        y: payload.y + payload.height,
      },
    });
  }
}

async function ensureOffscreenAlive(): Promise<boolean> {
  // Ensure the document exists, then ping it; recreate once on failure.
  const ping = async () => {
    try {
      const response = await chrome.runtime.sendMessage<
        ExtensionMessage,
        MessageResponse
      >({
        action: ExtensionAction.PING_OFFSCREEN,
      });
      return response?.status === 'ok';
    } catch {
      return false;
    }
  };

  await setupOffscreenDocument(FILES_PATH.OFFSCREEN_HTML);
  if (await ping()) return true;

  await setupOffscreenDocument(FILES_PATH.OFFSCREEN_HTML);
  return await ping();
}

async function sendOcrResultToTab(
  tabId: number | undefined,
  payload: OcrResultPayload
): Promise<void> {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
      action: ExtensionAction.OCR_RESULT,
      payload,
    });
  } catch (err) {
    console.error('Failed to send OCR result to tab:', err);
  }
}

async function sendCropReadyToTab(
  tabId: number | undefined,
  payload: CropReadyPayload
): Promise<void> {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage<ExtensionMessage>(tabId, {
      action: ExtensionAction.CROP_READY,
      payload,
    });
  } catch (err) {
    console.error('Failed to send CROP_READY to tab:', err);
  }
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

let creatingOffscreenPromise: Promise<void> | null = null;

async function setupOffscreenDocument(path: string): Promise<void> {
  // Check if offscreen document exists
  const offscreenDocConext = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(path)],
  });

  if (offscreenDocConext.length > 0) return;

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  console.debug('offscreen doc not found, creating...');
  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: OCR_CONFIG.JUSTIFICATION,
  });

  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
}

async function getShortcutCommand(): Promise<string> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === '_execute_action');

  if (!cmd || !cmd.shortcut) return '';
  return cmd.shortcut;
}

function getLanguageFromMap(key: string): TesseractLang | undefined {
  return CHROME_TO_TESSERACT[key as ChromeLang];
}

async function getUserLanguage(): Promise<UserLanguage> {
  try {
    // Check user storage
    const stored = await chrome.storage.local.get(STORAGE_KEYS.ISLAND_SETTINGS);
    const settings = stored[
      STORAGE_KEYS.ISLAND_SETTINGS
    ] as Partial<IslandSettings>;
    if (settings?.language)
      return {
        language: settings.language,
        source: 'local_storage',
      };
  } catch {
    /* ignore */
  }

  // Check browser language
  const uiLang = await chrome.i18n.getUILanguage();
  const lang = getLanguageFromMap(uiLang);
  if (lang)
    return {
      language: lang,
      source: 'browser',
    };

  // Try mapping base language (e.g. 'fr' from 'fr-CA')
  const baseLang = getLanguageFromMap(uiLang.split('-')[0]);
  if (baseLang)
    return {
      language: baseLang,
      source: 'browser_base',
    };

  return {
    language: 'eng',
    source: 'default',
  };
}
