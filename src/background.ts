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

/**
 * Reading from global vars | runtime.sendMessage is faster than chrome.storage
 * However, service worker die every 30s, so using hybrid approach
 * image data is transfered using base64 string format, so maybe improvement?
 */
let localActiveOcrTabId: number | undefined;
let localCapturedImage: string | null = null;
let localCroppedImage: string | null = null;
let creatingOffscreenPromise: Promise<void> | null = null;

// tool bar icon click, chrome handle the shortcut automatically
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  await chrome.storage.session.set({ [STORAGE_KEYS.TAB_ID]: tab.id });
  localActiveOcrTabId = tab.id;

  try {
    console.debug('screenshot');
    const capturedImage = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.CAPTURE_FORMAT,
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.CAPTURED_IMAGE]: capturedImage,
    });
    localCapturedImage = capturedImage;

    const isRestricted = isRestrictedUrl(tab.url);

    if (isRestricted) {
      console.debug('Restricted site detected via URL check.');
      await createBackupTab();
      await runOcrOnTab(true);
    } else {
      try {
        await runOcrOnTab(false);
      } catch {
        console.debug('Injection failed on standard site, creating backup tab');
        await createBackupTab();
        await runOcrOnTab(true);
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
      case ExtensionAction.CAPTURE_SUCCESS: {
        console.debug(message.action);
        // Handle async work in IIFE while returning true synchronously
        (async () => {
          try {
            await handleCaptureSuccess(message.payload);
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
            const isOffscreenReady = await ensureOffscreenAlive();
            if (!isOffscreenReady) {
              throw new Error('Could not start OCR engine');
            }

            const { language } = message.payload;
            const croppedImage = await getCapturedImg(
              'cropped',
              'fail language update'
            );

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
        (async () => {
          if (message.payload?.croppedImageUrl) {
            await chrome.storage.local.set({
              [STORAGE_KEYS.CROPPED_IMAGE]: message.payload.croppedImageUrl,
            });
            localCroppedImage = message.payload.croppedImageUrl;
          }
          sendCropReadyToTab(message.payload);
        })();
        return false; // No response needed
      }
      case ExtensionAction.OPEN_SHORTCUTS_PAGE: {
        console.debug(message.action);
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        sendResponse({ status: 'ok' });
        return false; // Synchronous response
      }
      case ExtensionAction.CLEANUP_STORAGE: {
        (async () => {
          console.debug(message.action);
          await cleanupStorage();
          sendResponse({ status: 'ok' });
        })();
        return false;
      }
    }
    return false;
  }
);

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  const newUrl = new URL(url);

  // Check protocol (https, chrome://, ...)
  const restrictedProtocols = ['chrome:', 'edge:', 'brave:'];
  if (restrictedProtocols.includes(newUrl.protocol)) return true;

  // Check domain
  const restrictedHosts = ['chromewebstore.google.com'];
  if (restrictedHosts.includes(newUrl.hostname)) return true;

  return false;
}

async function runOcrOnTab(isBackupTab = false): Promise<void> {
  const tabId = await getTabId('stop run ocr on tab');

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

async function createBackupTab(): Promise<void> {
  const capturedImage = await getCapturedImg('captured', 'no new Tab');

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
  localActiveOcrTabId = tab.id;
}

async function handleCaptureSuccess(payload: SelectionRect): Promise<void> {
  const tabId = await getTabId('stop handle capture success');
  const capturedImage = await getCapturedImg(
    'captured',
    'no image found in storage'
  );

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

async function sendCropReadyToTab(payload: CropReadyPayload): Promise<void> {
  const tabId = await getTabId('stop stop sending crop to tab');

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

async function getTabId(error_message?: string): Promise<number> {
  if (localActiveOcrTabId) return localActiveOcrTabId;

  const stored = await chrome.storage.session.get(STORAGE_KEYS.TAB_ID);
  const tabId = stored[STORAGE_KEYS.TAB_ID] as number | undefined;
  if (!tabId) {
    console.error('tabId not found', error_message);
    throw new Error('tabId not found');
  }

  localActiveOcrTabId = tabId;
  return tabId;
}

async function getCapturedImg(
  type: 'captured' | 'cropped',
  error_message?: string
): Promise<string> {
  if (type === 'captured' && localCapturedImage) return localCapturedImage;
  if (type === 'cropped' && localCroppedImage) return localCroppedImage;

  // Load from local storage
  const storageKey =
    type === 'captured'
      ? STORAGE_KEYS.CAPTURED_IMAGE
      : STORAGE_KEYS.CROPPED_IMAGE;
  const stored = await chrome.storage.local.get(storageKey);
  const image = stored[storageKey] as string | undefined;
  if (!image) {
    console.error(`${type} img not found`, error_message);
    throw new Error(`${type} img not found`);
  }
  if (type === 'captured') localCapturedImage = image;
  if (type === 'cropped') localCroppedImage = image;

  return image;
}

async function cleanupStorage() {
  await chrome.storage.local.remove(STORAGE_KEYS.CAPTURED_IMAGE);
  await chrome.storage.local.remove(STORAGE_KEYS.CROPPED_IMAGE);
}
