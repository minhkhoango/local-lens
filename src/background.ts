import { FILES, STORAGE_KEYS, OCR } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  SessionStorage,
  OcrResultPayload,
} from './types';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (tab.url.startsWith('chrome://')) {
    console.log('Protected site, backup method needed');
    return;
  }

  try {
    // Capture a full screenshot
    const dataUrl: string = await chrome.tabs.captureVisibleTab({
      format: OCR.CAPTURE_FORMAT,
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

    // warm up the offscreen engine
    await setupOffscreenDocument(FILES.OFFSCREEN_HTML);
  } catch (err) {
    console.error('Background workflow error:', err);
  }
});

// Routing messages across scripts
chrome.runtime.onMessage.addListener(
  async (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.CAPTURE_SUCCESS: {
        await handleCaptureSuccess(message.payload, sender.tab?.id);
        break;
      }
    }
    return true; // keep channel open
  }
);

async function handleCaptureSuccess(
  payload: { x: number; y: number; width: number; height: number },
  tabId?: number
): Promise<void> {
  console.log('Captured selection:', payload, 'tabId:', tabId);

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
      cursorPosition: { x: payload.x + payload.width, y: payload.y },
    });
    return;
  }

  try {
    const isOffscreenReady = await ensureOffscreenAlive(FILES.OFFSCREEN_HTML);
    if (!isOffscreenReady) {
      console.error('Offscreen not reachable, aborting OCR');
      sendOcrResultToTab(tabId, {
        success: false,
        text: 'OCR engine not ready',
        confidence: 0,
        croppedImageUrl: '',
        cursorPosition: { x: payload.x + payload.width, y: payload.y },
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
        cursorPosition: { x: payload.x + payload.width, y: payload.y },
      });
      return;
    }

    // Forward result to content script for UI display
    const resultPayload: OcrResultPayload = {
      success: ocrResult.status === 'ok',
      text: ocrResult.message || '',
      confidence: ocrResult.confidence || 0,
      croppedImageUrl: ocrResult.croppedImageUrl || '',
      cursorPosition: { x: payload.x + payload.width, y: payload.y },
    };

    sendOcrResultToTab(tabId, resultPayload);
  } catch (err) {
    console.error('Offscreen communication failed:', err);
    sendOcrResultToTab(tabId, {
      success: false,
      text: (err as Error).message,
      confidence: 0,
      croppedImageUrl: '',
      cursorPosition: { x: payload.x + payload.width, y: payload.y },
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

async function ensureContentScriptLoaded(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: ExtensionAction.PING_CONTENT,
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [FILES.CONTENT_SCRIPT],
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
    justification: OCR.JUSTIFICATION,
  });

  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
}
