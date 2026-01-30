import { ExtensionAction, type SelectionRect } from './types';
import type {
  ExtensionMessage,
  IslandOcrPayload,
  ImagePayload,
  LanguagePayload,
  StatusResponse,
  OcrResponse,
  Settings,
  ActivateOverlayPayload,
} from './types';
import { GhostOverlay } from './overlay';
import { FloatingIsland } from './island/index';
import backupStyles from './styles/backup.css?inline';
import overlayStyles from './styles/overlay.css?inline';
import { OCR_CONFIG, STORAGE_KEY } from './constants';
import type { TesseractLang } from './language_map';

const CLASSES = {
  imageContainer: 'image-container',
  banner: 'banner',
};

let activeOverlay: GhostOverlay | null = null;
let activeIsland: FloatingIsland | null = null;
let capturedImage: string | null = null;
let croppedImage: string | null = null;
let isPdf = false;

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

function handleActivateOverlay(payload: ActivateOverlayPayload) {
  const { imageUrl, isPdf: ispdf } = payload;
  isPdf = ispdf;
  capturedImage = imageUrl;

  if (activeOverlay) activeOverlay.destroy();
  activeOverlay = new GhostOverlay(overlayStyles);
  activeOverlay.mount();
  activeOverlay.activate();
}

/** Send rect payload from bg to offscreen for OCR, then update UI */
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
    activeIsland = new FloatingIsland(cursorPosition, croppedImage, isPdf);
    activeIsland.mount();

    const language = await getUserLanguage();

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
 */
async function cropImage(
  dataUrl: string,
  rect: SelectionRect,
): Promise<string> {
  const img = new Image();

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

  const dpr = rect.devicePixelRatio || 1;
  const scaledX = rect.x * dpr;
  const scaledY = rect.y * dpr;
  const scaledWidth = rect.width * dpr;
  const scaledHeight = rect.height * dpr;

  canvas.width = scaledWidth;
  canvas.height = scaledHeight;

  ctx.drawImage(
    img,
    scaledX,
    scaledY,
    scaledWidth,
    scaledHeight,
    0,
    0,
    scaledWidth,
    scaledHeight,
  );

  return canvas.toDataURL(`image/${OCR_CONFIG.FORMAT}`);
}

/** Find translation language */
async function getUserLanguage(): Promise<TesseractLang> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const settings = stored[STORAGE_KEY] as Settings;
    return settings.language;
  } catch {}

  return 'eng';
}

/** Handle UI update when offscreen finishing OCR the image */
function handleOcrResult(payload: IslandOcrPayload): void {
  if (activeIsland) {
    activeIsland.updateOcrResult(payload);
  } else {
    activeIsland = new FloatingIsland(
      payload.cursorPosition,
      payload.croppedImageUrl,
      isPdf,
    );
    activeIsland.mount();
    activeIsland.updateOcrResult(payload);
  }
}

/** All-in-one handling of new translation language */
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

/** Open a identical new tab on restricted sites */
function setupBackupDisplay(payload: ImagePayload): void {
  try {
    const { imageUrl } = payload;
    capturedImage = imageUrl;

    const title = document.createElement('title');
    title.textContent = 'Screenshot of original tab';
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
    img.alt = 'screenshot';
    img.onerror = () => {
      console.error('Failed to load backup image');
    };
    imageContainer.appendChild(img);

    const banner = document.createElement('div');
    banner.className = CLASSES.banner;
    banner.textContent =
      'Original tab was protected. Using read-only screenshot.';
    document.body.appendChild(banner);
  } catch (err) {
    console.error('Failed to setup backup display:', err);
  }
}
