import {
  RuntimeMessageAction,
  TabsMessageAction,
  toEngineOption,
  type SelectionRect,
} from './types';
import type {
  RuntimeMessage,
  ImagePayload,
  StatusResponse,
  ActivateOverlayPayload,
  Settings,
  Point,
  EngineOption,
  TabsConnect,
  TabsMessage,
} from './types';
import { GhostOverlay } from './overlay';
import { FloatingIsland } from './island/mount';
import backupStyles from './styles/backup.css?inline';
import overlayStyles from './styles/overlay.css?inline';
import { ISLAND_STORAGE, OCR_PORT } from './constants';

const CLASSES = {
  imageContainer: 'image-container',
  banner: 'banner',
};

let webGpuSupported = false;
let activeOverlay: GhostOverlay | null = null;
let activeIsland: FloatingIsland | null = null;
let capturedImage: string = '';
let croppedImage: string = '';
let isPdf = false;
let cursorPosition: Point = { x: 0, y: 0 };

chrome.runtime.onMessage.addListener(
  (
    message: TabsMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse) => void,
  ) => {
    switch (message.action) {
      case TabsMessageAction.INITIALIZE_BACKUP:
        console.debug(message.action);
        setupBackupDisplay(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case TabsMessageAction.PING_CONTENT:
        console.debug(message.action);
        webGpuSupported = message.payload.webGpuSupported;
        if (activeIsland) activeIsland.destroy(true);
        sendResponse({ status: 'ok' });
        break;

      case TabsMessageAction.ACTIVATE_OVERLAY:
        console.debug(message.action);
        (async () => {
          await handleActivateOverlay(message.payload);
          sendResponse({ status: 'ok' });
        })();
        return true;

      case TabsMessageAction.CAPTURE_VISIBLE_TAB:
        console.debug(message.action);
        capturedImage = message.payload.imageUrl;
        sendResponse({ status: 'ok' });
        break;

      case TabsMessageAction.CAPTURE_SUCCESS:
        console.debug(message.action);
        (async () => {
          await handleCaptureSuccess(message.payload);
          sendResponse({ status: 'ok' });
        })();
        return true;

      case TabsMessageAction.BG_PERFORM_OCR:
        console.debug(message.action);
        (async () => {
          await handlePerformOcr(message.payload.engine, true);
          sendResponse({ status: 'ok' });
        })();
        return true;
    }
    return false;
  },
);

/**
 * Mounting of overlay. On normal tab, imageUrl is empty. On restricted tab, imageUrl is present
 */
async function handleActivateOverlay(payload: ActivateOverlayPayload) {
  const { imageUrl, isPdf: ispdf } = payload;
  isPdf = ispdf;
  if (imageUrl) capturedImage = imageUrl;
  if (activeOverlay) activeOverlay.destroy();

  let engine: EngineOption = 'fast';
  try {
    const stored = await chrome.storage.local.get([ISLAND_STORAGE]);
    const saved = stored[ISLAND_STORAGE] as Partial<Settings> | undefined;
    engine = toEngineOption(saved?.engine);
  } catch {}

  activeOverlay = new GhostOverlay(overlayStyles, !imageUrl, engine);
  activeOverlay.mount();

  const port = await chrome.runtime.connect({ name: OCR_PORT });
  port.onMessage.addListener((msg: TabsConnect) => {
    if (!activeOverlay) return;
    switch (msg.action) {
      case 'DOWNLOAD':
        activeOverlay.loadingProgress(msg.payload.progress);
        return true;
      case 'SETUP_DONE':
        activeOverlay.activate();
        return false;
    }
  });
  const initiateMessage: TabsConnect = {
    action: 'SETUP_BEGIN',
    payload: {
      engine: engine,
    },
  };
  port.postMessage(initiateMessage);
}

/** Send rect payload from bg to offscreen for OCR, then update UI */
async function handleCaptureSuccess(rect: SelectionRect): Promise<void> {
  console.debug('handle capture success');

  try {
    // Analyze image quality for OCR and log recommendation
    // const analysis = await analyzeImageForOcr(capturedImage, rect);
    // console.log('analyzeImageForOcr result:', analysis);

    console.debug(`cropping capturedImage to rect: ${rect}`);
    croppedImage = await cropImage(capturedImage, rect);
    cursorPosition = {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    };

    console.debug('Update floating island with new image');
    activeIsland = new FloatingIsland(
      cursorPosition,
      croppedImage,
      isPdf,
      webGpuSupported,
    );
    activeIsland.mount();

    await handlePerformOcr('auto');
  } catch (err) {
    throw err;
  }
}

/** Handle UI update when offscreen finishing OCR the image */
async function handlePerformOcr(
  engine: 'auto' | EngineOption,
  ensureOffscreen = false,
): Promise<void> {
  if (ensureOffscreen) {
    const ensureOffscreen = await chrome.runtime.sendMessage<
      RuntimeMessage,
      StatusResponse
    >({
      action: RuntimeMessageAction.ENSURE_OFFSCREEN,
    });

    if (ensureOffscreen.status === 'error' || !croppedImage)
      throw new Error('offscreen is not started, cannot perform OCR');
  }

  // switch to chrome.runtime.connect for streaming of OCR progress
  const port = await chrome.runtime.connect({ name: OCR_PORT });

  port.onMessage.addListener((msg: TabsConnect) => {
    if (!activeIsland) return;
    switch (msg.action) {
      case 'DOWNLOAD':
        activeIsland.updateDownload(msg.payload);
        return true;
      case 'PROGRESS':
        activeIsland.updateProgress(msg.payload);
        return true;
      case 'ERROR':
        activeIsland.updateError(msg.payload);
        return false;
      case 'FINISH':
        activeIsland.updateFinish(msg.payload);
        return false;
    }
  });

  const initiateMessage: TabsConnect = {
    action: 'PERFORM_OCR',
    payload: {
      engine: engine,
      croppedImage: croppedImage,
    },
  };
  port.postMessage(initiateMessage);
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

  return canvas.toDataURL(`image/png`);
}

// async function analyzeImageForOcr(
//   dataUrl: string,
//   rect: SelectionRect,
// ): Promise<{
//   pixelWidth: number;
//   pixelHeight: number;
//   effectiveDpi: number;
//   recommendation: string;
// }> {
//   const img = new Image();
//   await new Promise((resolve, reject) => {
//     img.onload = resolve;
//     img.onerror = reject;
//     img.src = dataUrl;
//   });

//   const dpr = rect.devicePixelRatio || 1;
//   const pixelWidth = rect.width * dpr;
//   const pixelHeight = rect.height * dpr;

//   // Extension runs on ChromeOS and Windows, so assume 96
//   const effectiveDpi = dpr * 96;

//   let recommendation = '';
//   if (effectiveDpi < 150) {
//     recommendation = 'Low quality - consider upscaling for better OCR';
//   } else if (effectiveDpi < 300) {
//     recommendation = 'Acceptable - may benefit from upscaling';
//   } else {
//     recommendation = 'Good quality for OCR';
//   }

//   return { pixelWidth, pixelHeight, effectiveDpi, recommendation };
// }

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
