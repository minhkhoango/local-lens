import { FILES_PATH, STORAGE_KEYS, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  SessionStorage,
  OcrResultPayload,
  SelectionRect,
  CropReadyPayload,
  ShowHintPayload,
} from './types';

// Track the tab that initiated OCR (for forwarding CROP_READY)
let activeOcrTabId: number | undefined;

// tool bar icon click, chrome handle the shortcut automatically
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (tab.url.startsWith('chrome://')) {
    console.log('Protected site, backup method needed');
    return;
  }

  try {
    // Capture a full screenshot
    const dataUrl: string = await chrome.tabs.captureVisibleTab({
      format: OCR_CONFIG.CAPTURE_FORMAT,
    });
    await chrome.storage.session.set<SessionStorage>({
      [STORAGE_KEYS.CAPTURED_IMAGE]: dataUrl,
    });

    // start the UI
    await ensureContentScriptLoaded(tab.id);
    const overlayMessage: ExtensionMessage = {
      action: ExtensionAction.ACTIVATE_OVERLAY,
    };
    const overlayResponse = await sendMessageToTab(tab.id, overlayMessage);
    if (overlayResponse.status !== 'ok') {
      console.warn('Overlay failed:', overlayResponse.message);
    }

    await checkAndShowShortcutHint(tab.id);

    // warm up the offscreen engine
    await setupOffscreenDocument(FILES_PATH.OFFSCREEN_HTML);
  } catch (err) {
    console.error('Background workflow error:', err);
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
      case ExtensionAction.GET_SHORTCUT: {
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
        // Forward CROP_READY from offscreen to content script (fire-and-forget)
        if (activeOcrTabId) {
          sendCropReadyToTab(activeOcrTabId, message.payload);
        }
        return false; // No response needed
      }
      case ExtensionAction.OPEN_SHORTCUTS_PAGE: {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        sendResponse({ status: 'ok' });
        return false; // Synchronous response
      }
    }
    return false;
  }
);

async function handleCaptureSuccess(
  payload: SelectionRect,
  tabId?: number
): Promise<void> {
  console.log('Captured selection:', payload, 'tabId:', tabId);

  // Track active tab for CROP_READY forwarding
  activeOcrTabId = tabId;

  const storage = await chrome.storage.session.get<SessionStorage>(
    STORAGE_KEYS.CAPTURED_IMAGE
  );
  const capturedImage = storage.capturedImage;

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

  try {
    const isOffscreenReady = await ensureOffscreenAlive(
      FILES_PATH.OFFSCREEN_HTML
    );
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

    const ocrResult = await chrome.runtime.sendMessage<
      ExtensionMessage,
      MessageResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        imageDataUrl: capturedImage,
        rect: payload,
      },
    });

    console.log('Background received OCR result:', ocrResult);
    if (ocrResult === undefined) {
      console.log('ocrResult is undefined, returning error to tab');
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

async function ensureOffscreenAlive(path: string): Promise<boolean> {
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

  await setupOffscreenDocument(path);
  if (await ping()) return true;

  await setupOffscreenDocument(path);
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

async function sendMessageToTab(
  tabId: number,
  message: ExtensionMessage
): Promise<MessageResponse> {
  try {
    return await chrome.tabs.sendMessage<ExtensionMessage, MessageResponse>(
      tabId,
      message
    );
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
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

  // Creating the document if doesn't exist
  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: OCR_CONFIG.JUSTIFICATION,
  });

  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
}

async function checkAndShowShortcutHint(tabId: number) {
  const result = await chrome.storage.local.get(
    STORAGE_KEYS.SHORTCUT_HINT_SHOWN
  );
  if (!result[STORAGE_KEYS.SHORTCUT_HINT_SHOWN]) {
    const shortcutCommand = await getShortcutCommand();
    const message = shortcutCommand
      ? `Press ${shortcutCommand} to capture instantly`
      : 'Click the extension icon to capture';
    const hintPayload: ShowHintPayload = {
      message: message,
    };

    chrome.tabs
      .sendMessage(tabId, {
        action: ExtensionAction.SHOW_HINT,
        payload: hintPayload,
      })
      .catch(() => {
        /* ignore if tab closed */
      });

    // Don't force user to 'X' notification
    setTimeout(
      async () =>
        await chrome.storage.local.set({
          [STORAGE_KEYS.SHORTCUT_HINT_SHOWN]: true,
        }),
      4000
    );
  }
}

async function getShortcutCommand(): Promise<string> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === '_execute_action');

  if (!cmd || !cmd.shortcut) return '';
  return cmd.shortcut;
}
