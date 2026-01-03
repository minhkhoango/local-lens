import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  CropReadyPayload,
  OcrResultPayload,
  BackupImagePayload,
} from './types';
import { GhostOverlay } from './overlay';
import { FloatingIsland } from './island';
import { BACKUP_STYLES } from './assets';
import { CLASSES } from './constants';

// State Management
let activeOverlay: GhostOverlay | null = null;
let activeIsland: FloatingIsland | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.PING_CONTENT:
        console.debug('[Content]', message.action);
        if (activeIsland) activeIsland.destroy();
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.ACTIVATE_OVERLAY:
        console.debug('[Content]', message.action);
        if (activeOverlay) activeOverlay.destroy();
        if (activeIsland) activeIsland.destroy();
        activeOverlay = new GhostOverlay();
        activeOverlay.mount();
        activeOverlay.activate();
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.INITIALIZE_BACKUP:
        console.debug('[Content]', message.action);
        setupBackupDisplay(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.CROP_READY:
        console.debug('[Content]', message.action);
        handleCropReady(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.OCR_RESULT:
        console.debug('[Content]', message.action);
        handleOcrResult(message.payload);
        sendResponse({ status: 'ok' });
        break;
    }
    return false;
  }
);

function handleCropReady(payload: CropReadyPayload): void {
  if (activeIsland) activeIsland.destroy();

  activeIsland = new FloatingIsland(
    payload.cursorPosition,
    payload.croppedImageUrl
  );
  activeIsland.mount();
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

function setupBackupDisplay(payload: BackupImagePayload): void {
  try {
    const styleElement = document.createElement('style');
    styleElement.textContent = BACKUP_STYLES;
    document.head.appendChild(styleElement);

    const imageContainer = document.querySelector(`.${CLASSES.imageContainer}`);
    if (!imageContainer) {
      console.error(
        `[Content] .${CLASSES.imageContainer} not found in backup.html`
      );
      return;
    }

    const img = document.createElement('img');
    img.src = payload.imageUrl;
    img.alt = 'Captured screenshot';
    img.onerror = () => {
      console.error('[Content] Failed to load backup image');
    };
    imageContainer.appendChild(img);

    const banner = document.createElement('div');
    banner.className = CLASSES.banner;
    banner.textContent = 'Original tab was protected. Using read-only preview.';
    document.body.appendChild(banner);
  } catch (err) {
    console.error('[Content] Failed to setup backup display:', err);
  }
}
