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
import backupStyles from './styles/backup.css?inline';
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
        console.debug(message.action);
        if (activeIsland) activeIsland.destroy(false);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.ACTIVATE_OVERLAY:
        console.debug(message.action);
        if (activeOverlay) activeOverlay.destroy();
        activeOverlay = new GhostOverlay();
        activeOverlay.mount();
        activeOverlay.activate();
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.INITIALIZE_BACKUP:
        console.debug(message.action);
        setupBackupDisplay(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.CROP_READY:
        console.debug(message.action);
        handleCropReady(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.OCR_RESULT:
        console.debug(message.action);
        handleOcrResult(message.payload);
        sendResponse({ status: 'ok' });
        break;
    }
    return false;
  }
);

function handleCropReady(payload: CropReadyPayload): void {
  if (activeIsland) activeIsland.destroy(false);

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
    const { imageUrl } = payload;

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
