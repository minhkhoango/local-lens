import { ExtensionAction, type SelectionRect } from './types';
import type {
  ExtensionMessage,
  IslandOcrPayload,
  ImagePayload,
  LanguagePayload,
  StatusResponse,
  OcrResponse,
  Settings,
} from './types';
import { GhostOverlay } from './overlay';
import { FloatingIsland } from './island/index';
import backupStyles from './styles/backup.css?inline';
import { OCR_CONFIG, STORAGE_KEY } from './constants';
import {
  CHROME_TO_TESSERACT,
  type ChromeLang,
  type TesseractLang,
} from './language_map';

interface UserLanguage {
  language: TesseractLang;
  source: 'local_storage' | 'browser' | 'browser_base' | 'default';
}

const CLASSES = {
  imageContainer: 'image-container',
  banner: 'banner',
};

// State Management
let activeOverlay: GhostOverlay | null = null;
let activeIsland: FloatingIsland | null = null;
let capturedImage: string | null = null;
let croppedImage: string | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse | OcrResponse) => void,
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
        (async () => {
          await handleCaptureSuccess(message.payload);
          sendResponse({ status: 'ok' });
        })();
        return true;

      case ExtensionAction.UPDATE_LANGUAGE:
        console.debug(message.action);
        (async () => {
          const ocrResult = await handleLanguageUpdate(message.payload);
          sendResponse(ocrResult);
        })();
        return true;
    }
    return false;
  },
);

function handleActivateOverlay(payload: ImagePayload) {
  const { imageUrl } = payload;
  capturedImage = imageUrl;

  if (activeOverlay) activeOverlay.destroy();
  activeOverlay = new GhostOverlay();
  activeOverlay.mount();
  activeOverlay.activate();
}

/**
 * Handle payload from rect payload from bg, do the following:
 * - Crop user's selected rectangle from screenshot
 * - Get user's language
 * - Send payload to offscreen to perform OCR
 * @param rect payload from bg from overlay
 */
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
      OcrResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        croppedImage: croppedImage,
        language: language,
      },
    });

    console.debug('OCR result:', ocrResult);
    if (!ocrResult) throw new Error('OcrResult is undefined');

    // Forward result to content script for UI display
    const resultPayload: IslandOcrPayload = {
      success: ocrResult.status === 'ok',
      text: ocrResult.text,
      croppedImageUrl: croppedImage,
      cursorPosition: cursorPosition,
    };

    handleOcrResult(resultPayload);
  } catch (err) {
    throw err;
  }
}

/**
 * Takes in base64 string from chrome.captureVisbleTab, take in
 * account monitor's dpr then return a cropped PNG
 * @param dataUrl base 64 string from background
 * @param rect selectionRect from overlay
 * @returns cropped PNG
 */
async function cropImage(
  dataUrl: string,
  rect: SelectionRect,
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
    scaledHeight,
  );

  return canvas.toDataURL(`image/${OCR_CONFIG.FORMAT}`);
}

/**
 * Attempt to find island's UI language in following order:
 * saved settings -> i18n -> i18n base lang -> 'eng'
 * @returns language and lang source for debugging
 */
async function getUserLanguage(): Promise<UserLanguage> {
  try {
    // Check user storage
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const settings = stored[STORAGE_KEY] as Settings;
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

/**
 * Handle UI update when offscreen finishing OCR the image
 * @param payload payload from offscreen
 */
function handleOcrResult(payload: IslandOcrPayload): void {
  if (activeIsland) {
    // Update existing island with result (preserves position/drag state)
    activeIsland.updateOcrResult(payload);
  } else {
    // Fallback: create island if somehow missing
    activeIsland = new FloatingIsland(
      payload.cursorPosition,
      payload.croppedImageUrl,
    );
    activeIsland.mount();
    activeIsland.updateOcrResult(payload);
  }
}

/**
 * All-in-one handling of new language:
 * - Ping background to ensure offscreen
 * - Send payload to offscreen for OCR
 * @param payload new language
 */
async function handleLanguageUpdate(payload: LanguagePayload) {
  console.debug('handle language_update, content actually receives it');
  try {
    const ensureOffscreen = await chrome.runtime.sendMessage<
      ExtensionMessage,
      StatusResponse
    >({
      action: ExtensionAction.ENSURE_OFFSCREEN,
    });

    if (ensureOffscreen.status === 'error' || !croppedImage)
      throw new Error('offscreen is not started, cannot update lang');

    const { language } = payload;

    const ocrResult = await chrome.runtime.sendMessage<
      ExtensionMessage,
      OcrResponse
    >({
      action: ExtensionAction.PERFORM_OCR,
      payload: {
        language: language,
        croppedImage: croppedImage,
      },
    });

    return ocrResult;
  } catch (err) {
    throw err;
  }
}

/**
 * Open a new tab nearly identical to original on restricted sites (chrome://,...)
 * @param payload base64 string image from captureVisibleTab
 */
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
