import { ExtensionAction, type SelectionRect } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  OcrResultPayload,
  ImagePayload,
  UserLanguage,
  IslandSettings,
  RequestLanguagePayload,
} from './types';
import { GhostOverlay } from './overlay';
import { FloatingIsland } from './island';
import backupStyles from './styles/backup.css?inline';
import { CLASSES, STORAGE_KEYS, OCR_CONFIG } from './constants';
import {
  CHROME_TO_TESSERACT,
  type ChromeLang,
  type TesseractLang,
} from './language_map';

// State Management
let activeOverlay: GhostOverlay | null = null;
let activeIsland: FloatingIsland | null = null;
let capturedImage: string | null = null;
let croppedImage: string | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.INITIALIZE_BACKUP:
        console.debug(message.action);
        setupBackupDisplay(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.PING_CONTENT:
        console.debug(message.action);
        if (activeIsland) activeIsland.destroy();
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.ACTIVATE_OVERLAY:
        console.debug(message.action);
        handleActivateOverlay(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.CAPTURE_SUCCESS:
        console.debug(message.action);
        handleCaptureSuccess(message.payload);
        break;

      case ExtensionAction.REQUEST_LANGUAGE_UPDATE:
        console.debug(message.action);
        handleLanguageRequest(message.payload, sendResponse);
    }
    return false;
  }
);

function handleActivateOverlay(payload: ImagePayload) {
  const { imageUrl } = payload;
  capturedImage = imageUrl;

  if (activeOverlay) activeOverlay.destroy();
  activeOverlay = new GhostOverlay();
  activeOverlay.mount();
  activeOverlay.activate();
}

async function handleCaptureSuccess(rect: SelectionRect): Promise<void> {
  console.debug('handle capture success');
  if (!capturedImage) {
    console.error('capturedImage not found, cannot hand capture');
    return;
  }

  try {
    console.debug(`cropping capturedImage to rect: ${rect}`);
    croppedImage = await cropImage(capturedImage, rect);
    const cursorPosition = {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    };

    console.debug('Update floating island with new image');
    activeIsland = new FloatingIsland(cursorPosition, croppedImage);
    activeIsland.mount();

    const { language, source } = await getUserLanguage();
    console.debug(`User language: ${language}, source: ${source}`);

    const ocrResult = await chrome.runtime.sendMessage<
      ExtensionMessage,
      MessageResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        croppedImage: croppedImage,
        language: language,
      },
    });

    console.debug('OCR result:', ocrResult);
    if (ocrResult === undefined) throw new Error('OcrResult is undefined');

    // Forward result to content script for UI display
    const resultPayload: OcrResultPayload = {
      success: ocrResult.status === 'ok',
      text: ocrResult.message || '',
      confidence: ocrResult.confidence || 0,
      croppedImageUrl: ocrResult.croppedImageUrl || '',
      cursorPosition: cursorPosition,
    };

    handleOcrResult(resultPayload);
  } catch (err) {
    throw err;
  }
}

async function cropImage(
  dataUrl: string,
  rect: SelectionRect
): Promise<string> {
  const img = new Image();

  // wait for image to load from dataUrl
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context failed');
  }

  // Scale coordinates from CSS pxl to native
  const dpr = rect.devicePixelRatio || 1;
  const scaledX = rect.x * dpr;
  const scaledY = rect.y * dpr;
  const scaledWidth = rect.width * dpr;
  const scaledHeight = rect.height * dpr;

  canvas.width = scaledWidth;
  canvas.height = scaledHeight;

  ctx.drawImage(
    img, // source image
    // 1-4: what to copy (in native/scaled pixels)
    scaledX,
    scaledY,
    scaledWidth,
    scaledHeight,
    // where & how to draw it (also in scaled pixels)
    0,
    0,
    scaledWidth,
    scaledHeight
  );

  return canvas.toDataURL(OCR_CONFIG.CROP_MIME);
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

function getLanguageFromMap(key: string): TesseractLang | undefined {
  return CHROME_TO_TESSERACT[key as ChromeLang];
}

function handleOcrResult(payload: OcrResultPayload): void {
  if (activeIsland) {
    // Update existing island with result (preserves position/drag state)
    activeIsland.updateWithResult(payload);
  } else {
    // Fallback: create island if somehow missing
    activeIsland = new FloatingIsland(
      payload.cursorPosition,
      payload.croppedImageUrl
    );
    activeIsland.mount();
    activeIsland.updateWithResult(payload);
  }
}

async function handleLanguageRequest(
  payload: RequestLanguagePayload,
  sendResponse: (response: MessageResponse) => void
) {
  try {
    const ensureOffscreen = await chrome.runtime.sendMessage<
      ExtensionMessage,
      MessageResponse
    >({
      action: ExtensionAction.ENSURE_OFFSCREEN,
    });

    if (ensureOffscreen === undefined || !croppedImage)
      throw new Error('offscreen is not started, cannot update lang');

    const { language } = payload;

    const updateReponse = await chrome.runtime.sendMessage<
      ExtensionMessage,
      MessageResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        language: language,
        croppedImage: croppedImage,
      },
    });

    sendResponse(updateReponse);
  } catch (err) {
    throw err;
  }
}

function setupBackupDisplay(payload: ImagePayload): void {
  try {
    const { imageUrl } = payload;
    capturedImage = imageUrl;

    const title = document.createElement('title');
    title.textContent = chrome.i18n.getMessage('backup_tab_name');
    document.head.append(title);

    const styleElement = document.createElement('style');
    styleElement.textContent = backupStyles;
    document.head.appendChild(styleElement);

    const imageContainer = document.querySelector(`.${CLASSES.imageContainer}`);
    if (!imageContainer) {
      console.error(`.${CLASSES.imageContainer} not found in backup.html`);
      return;
    }

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = chrome.i18n.getMessage('backup_screenshot');
    img.onerror = () => {
      console.error('Failed to load backup image');
    };
    imageContainer.appendChild(img);

    const banner = document.createElement('div');
    banner.className = CLASSES.banner;
    banner.textContent = chrome.i18n.getMessage('backup_banner');
    document.body.appendChild(banner);
  } catch (err) {
    console.error('Failed to setup backup display:', err);
  }
}
