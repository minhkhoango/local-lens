import type { TesseractLang } from './language_map';

/**
 * Coordinate variable
 * Use Point.x, Point.y
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Hold runtime values for island toggles
 */
export interface ToggleSettings {
  autoCopy: boolean;
  autoExpand: boolean;
}

/**
 * Hold runtime values for island select elements
 */
export interface SelectSettings {
  language: TesseractLang;
}

/**
 * Hold runtime values of auto-copy, auto-expand, and language
 */
export interface Settings extends ToggleSettings, SelectSettings {}

/**
 * User's cropped rectangle dimension and dpr
 */
export interface SelectionRect extends Point {
  width: number;
  height: number;
  devicePixelRatio: number;
}

/**
 * Cross .ts files actions messaged using chrome
 */
export const ExtensionAction = {
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  NOTIFY_CAPTURE_SUCCESS: 'NOTIFY_CAPTURE_SUCCESS',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  PING_CONTENT: 'PING_CONTENT',
  PERFORM_OCR: 'PERFORM_OCR',
  REQUEST_LANGUAGE_UPDATE: 'REQUEST_LANGUAGE_UPDATE',
  ENSURE_OFFSCREEN: 'ENSURE_OFFSCREEN',
  UPDATE_LANGUAGE: 'UPDATE_LANGUAGE',
  OPEN_SHORTCUTS_PAGE: 'OPEN_SHORTCUTS_PAGE',
  GET_SHORTCUT: 'GET_SHORTCUT',
  INITIALIZE_BACKUP: 'INITIALIZE_BACKUP',
} as const;

export type ExtensionAction =
  (typeof ExtensionAction)[keyof typeof ExtensionAction];

/**
 * Payload when crop is ready, before OCR starts
 */
export interface PerformOcrPayload {
  language: TesseractLang;
  croppedImage: string;
}

/**
 * Payload when user select a new language for OCR
 */
export interface LanguagePayload {
  language: TesseractLang;
}

/**
 * Payload for backup tab
 */
export interface ImagePayload {
  imageUrl: string;
}

/**
 * Content of message sent using chrome.tabs or chrome.runtime, with optional payload
 */
export type ExtensionMessage =
  | { action: typeof ExtensionAction.ACTIVATE_OVERLAY; payload: ImagePayload }
  | {
      action: typeof ExtensionAction.NOTIFY_CAPTURE_SUCCESS;
      payload: SelectionRect;
    }
  | { action: typeof ExtensionAction.CAPTURE_SUCCESS; payload: SelectionRect }
  | { action: typeof ExtensionAction.PING_CONTENT }
  | { action: typeof ExtensionAction.PERFORM_OCR; payload: PerformOcrPayload }
  | {
      action: typeof ExtensionAction.REQUEST_LANGUAGE_UPDATE;
      payload: LanguagePayload;
    }
  | { action: typeof ExtensionAction.ENSURE_OFFSCREEN }
  | {
      action: typeof ExtensionAction.UPDATE_LANGUAGE;
      payload: LanguagePayload;
    }
  | { action: typeof ExtensionAction.OPEN_SHORTCUTS_PAGE }
  | { action: typeof ExtensionAction.GET_SHORTCUT }
  | {
      action: typeof ExtensionAction.INITIALIZE_BACKUP;
      payload: ImagePayload;
    };

/**
 * Simple response of 'ok' or 'error'
 */
export interface StatusResponse {
  status: 'ok' | 'error';
}

/**
 * Response containing the extension's shortcut
 */
export interface ShortcutResponse {
  status: 'ok' | 'error';
  shortcut: string | null;
}

/**
 * Response containing extracted text and confidence
 */
export interface OcrResponse {
  status: 'ok' | 'error';
  text: string;
  confidence: number;
}

/**
 * Processed response from OcrResponse, sent to index
 */
export interface IslandOcrPayload {
  success: boolean;
  text: string;
  croppedImageUrl: string;
  cursorPosition: Point;
}
