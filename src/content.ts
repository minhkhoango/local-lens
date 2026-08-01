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

      case TabsMessageAction.CAPTURE_RESULT:
        console.debug(message.action);
        capturedImage = message.payload.imageUrl;
        sendResponse({ status: 'ok' });
        break;
    }
    return false;
  },
);

/**
 * Chrome renders a PDF as an `<embed type="application/pdf">` inside a
 * synthetic host document, and that plugin lives in its own frame: mouse and
 * key events inside it never reach this document. Both the overlay and the
 * island need to know, so they can fall back to signals that do arrive.
 *
 * The worker's URL sniff (`pathname.endsWith('.pdf')`) misses every PDF served
 * without the extension — `arxiv.org/pdf/2401.12345`, anything delivered by
 * Content-Disposition — so confirm it here, where the DOM can just be read.
 */
function isPdfViewerDocument(): boolean {
  if (document.contentType === 'application/pdf') return true;
  return !!document.querySelector('embed[type="application/pdf"]');
}

/**
 * Mounting of overlay. On normal tab, imageUrl is empty. On restricted tab, imageUrl is present
 */
async function handleActivateOverlay(payload: ActivateOverlayPayload) {
  const { imageUrl, isPdf: ispdf } = payload;
  isPdf = ispdf || isPdfViewerDocument();
  if (imageUrl) capturedImage = imageUrl;
  if (activeOverlay) activeOverlay.destroy();

  let engine: EngineOption = 'fast';
  try {
    const stored = await chrome.storage.local.get([ISLAND_STORAGE]);
    const saved = stored[ISLAND_STORAGE] as Partial<Settings> | undefined;
    engine = toEngineOption(saved?.engine);
  } catch {}

  const overlay = new GhostOverlay(
    overlayStyles,
    !imageUrl,
    engine,
    (rect, captureReady) => {
      void handleCaptureSuccess(rect, captureReady);
    },
  );
  activeOverlay = overlay;
  overlay.mount();

  const port = chrome.runtime.connect({ name: OCR_PORT });

  // Setup has exactly one job: hand control back to the user. It must do that
  // on EVERY outcome, not just SETUP_DONE — an engine that failed to
  // initialize, or an offscreen document that went away, used to leave the
  // overlay mounted-but-inert forever (dimmed screen, "Loading model...", no
  // way to select and, before Escape moved into mount(), no way to cancel).
  let settled = false;
  const releaseOverlay = (failure?: string): void => {
    if (settled) return;
    settled = true;
    if (activeOverlay !== overlay) return;
    overlay.activate(failure);
  };

  port.onMessage.addListener((msg: TabsConnect) => {
    if (activeOverlay !== overlay) return;
    switch (msg.action) {
      case 'DOWNLOAD':
        overlay.loadingProgress(msg.payload.progress);
        return;
      case 'SETUP_DONE':
        releaseOverlay();
        port.disconnect();
        return;
      case 'ERROR':
        console.error('Engine setup failed:', msg.payload.error);
        releaseOverlay('Model failed to load. Press Esc to close.');
        port.disconnect();
        return;
    }
  });
  port.onDisconnect.addListener(() => {
    releaseOverlay('Model failed to load. Press Esc to close.');
  });

  const initiateMessage: TabsConnect = {
    action: 'SETUP_BEGIN',
    payload: {
      engine: engine,
    },
  };
  port.postMessage(initiateMessage);
}

/**
 * Send rect payload from bg to offscreen for OCR, then update UI.
 *
 * `captureReady` is the screenshot request the overlay fired at mouse-down. It
 * is awaited HERE rather than in the overlay so that a slow round trip delays
 * only the crop, never the drag itself.
 */
async function handleCaptureSuccess(
  rect: SelectionRect,
  captureReady: Promise<void>,
): Promise<void> {
  console.debug('handle capture success');
  cursorPosition = {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  };

  // A failure anywhere below used to reject into `void handleCaptureSuccess()`
  // and vanish: the user finished a drag and got nothing at all, with no island
  // and no error. Mount the island either way so every drag has a visible
  // outcome.
  let captureError: string | null = null;
  try {
    await captureReady;
    console.debug(`cropping capturedImage to rect: ${rect}`);
    croppedImage = await cropImage(capturedImage, rect);
  } catch (err) {
    console.error('Failed to capture the selected region:', err);
    croppedImage = '';
    captureError = 'Could not capture that area. Try again.';
  }

  console.debug('Update floating island with new image');
  activeIsland = new FloatingIsland(
    cursorPosition,
    croppedImage,
    isPdf,
    webGpuSupported,
    (engine) => handlePerformOcr(engine, true),
  );
  activeIsland.mount();

  if (captureError) {
    activeIsland.updateError({ stage: 'error', error: captureError });
    return;
  }

  try {
    await handlePerformOcr('auto');
  } catch (err) {
    console.error('Could not start OCR:', err);
    activeIsland.updateError({
      stage: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
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
  const port = chrome.runtime.connect({ name: OCR_PORT });

  // The island shows a spinner and disables its copy button until a terminal
  // message arrives, so a port that dies mid-run (offscreen document torn down,
  // engine crash) left it spinning forever with no way to tell the run had
  // ended. Treat the disconnect itself as terminal.
  let settled = false;
  port.onMessage.addListener((msg: TabsConnect) => {
    if (!activeIsland) return;
    switch (msg.action) {
      case 'DOWNLOAD':
        activeIsland.updateDownload(msg.payload);
        return;
      case 'PROGRESS':
        activeIsland.updateProgress(msg.payload);
        return;
      case 'ERROR':
        settled = true;
        activeIsland.updateError(msg.payload);
        port.disconnect();
        return;
      case 'FINISH':
        settled = true;
        activeIsland.updateFinish(msg.payload);
        port.disconnect();
        return;
    }
  });
  port.onDisconnect.addListener(() => {
    if (settled) return;
    settled = true;
    activeIsland?.updateError({
      stage: 'error',
      error: 'The OCR engine stopped unexpectedly. Try again.',
    });
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

  // Cap the longest side of the output canvas. A large selection on a 2x/3x
  // display would otherwise produce a huge canvas — slow PNG encode plus
  // downstream fetch/decode cost — for no OCR benefit: PaddleOCR detection
  // internally resizes to a ~960px max side anyway, so no accuracy is lost.
  // We only ever downscale (scale <= 1, never upscale) and use high-quality
  // smoothing so the shrunken text stays legible.
  const MAX_CROP_SIDE = 3000;
  const longestSide = Math.max(scaledWidth, scaledHeight);
  const scale = longestSide > MAX_CROP_SIDE ? MAX_CROP_SIDE / longestSide : 1;
  const destWidth = Math.max(1, Math.round(scaledWidth * scale));
  const destHeight = Math.max(1, Math.round(scaledHeight * scale));

  canvas.width = destWidth;
  canvas.height = destHeight;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    img,
    scaledX,
    scaledY,
    scaledWidth,
    scaledHeight,
    0,
    0,
    destWidth,
    destHeight,
  );

  return canvas.toDataURL(`image/png`);
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
