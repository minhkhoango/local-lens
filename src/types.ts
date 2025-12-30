/**
 * Shared Type Definitions
 */

export interface Point {
  x: number;
  y: number;
}

export interface Dimension {
  width: number;
  height: number;
}

export interface SelectionRect extends Point, Dimension {
  devicePixelRatio: number;
}

export const ExtensionAction = {
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  PING_CONTENT: 'PING_CONTENT',
  PING_OFFSCREEN: 'PING_OFFSCREEN',
  PERFORM_OCR: 'PERFORM_OCR',
  OCR_RESULT: 'OCR_RESULT',
  OCR_PROGRESS: 'OCR_PROGRESS',
  CROP_READY: 'CROP_READY',
  SHOW_HINT: 'SHOW_HINT',
  OPEN_SHORTCUTS_PAGE: 'OPEN_SHORTCUTS_PAGE',
  GET_SHORTCUT: 'GET_SHORTCUT',
} as const;

export type ExtensionAction =
  (typeof ExtensionAction)[keyof typeof ExtensionAction];

/** OCR result payload sent back to content script */
export interface OcrResultPayload {
  success: boolean;
  text: string;
  confidence: number;
  croppedImageUrl: string;
  cursorPosition: Point;
}

/** OCR progress payload for live updates */
export interface OcrProgressPayload {
  progress: number;
  status: string;
}

/** Payload sent when crop is ready, before OCR starts */
export interface CropReadyPayload {
  croppedImageUrl: string;
  cursorPosition: Point;
}

export interface ShowHintPayload {
  message: string;
}

export type ExtensionMessage =
  | { action: typeof ExtensionAction.ACTIVATE_OVERLAY }
  | { action: typeof ExtensionAction.CAPTURE_SUCCESS; payload: SelectionRect }
  | { action: typeof ExtensionAction.PING_CONTENT }
  | { action: typeof ExtensionAction.PING_OFFSCREEN }
  | {
      action: typeof ExtensionAction.PERFORM_OCR;
      payload: { imageDataUrl: string; rect: SelectionRect };
    }
  | { action: typeof ExtensionAction.OCR_RESULT; payload: OcrResultPayload }
  | {
      action: typeof ExtensionAction.OCR_PROGRESS;
      payload: OcrProgressPayload;
    }
  | { action: typeof ExtensionAction.CROP_READY; payload: CropReadyPayload }
  | { action: typeof ExtensionAction.SHOW_HINT; payload: ShowHintPayload }
  | { action: typeof ExtensionAction.OPEN_SHORTCUTS_PAGE }
  | { action: typeof ExtensionAction.GET_SHORTCUT };

export interface MessageResponse {
  status: 'ok' | 'error';
  message?: string;
  confidence?: number;
  croppedImageUrl?: string;
  data?: SelectionRect;
  shortcut?: string;
}

export interface SessionStorage {
  capturedImage: string;
  shortcutHintShown: boolean;
}

/** Stored in chrome.storage.local */
export interface IslandSettings {
  autoCopy: boolean;
  autoExpand: boolean;
}

/** Settings configuration item for rendering settings UI (for 2 toggles)*/
export interface SettingsConfigItem {
  key: keyof IslandSettings;
  label: string;
  type?: 'toggle' | 'button';
}

/** Button-only settings config, no stored state (for shortcut btn) */
export interface ButtonConfigItem {
  action: string;
  label: string;
  type: 'button';
}

export type SettingsRowConfig = SettingsConfigItem | ButtonConfigItem;

export type IslandState = 'loading' | 'success' | 'error';
