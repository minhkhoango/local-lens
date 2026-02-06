import type { TesseractLang } from './language_map';

/** Coordinate variable */
export interface Point {
  x: number;
  y: number;
}

/** Hold runtime values for island toggles */
export interface ToggleSettings {
  autoCopy: boolean;
  autoExpand: boolean;
}

export type EngineOption = 'tesseract' | 'granite';

/** Hold runtime values for island select elements */
export interface SelectSettings {
  engine: EngineOption;
  language: TesseractLang;
}

/** Hold runtime values of auto-copy, auto-expand, engine, and tesseract language */
export interface Settings extends ToggleSettings, SelectSettings {}

/** User's cropped rectangle dimension and dpr */
export interface SelectionRect extends Point {
  width: number;
  height: number;
  devicePixelRatio: number;
}

/** Cross .ts files actions messaged using chrome */
export const ExtensionAction = {
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  PING_CONTENT: 'PING_CONTENT',
  SETUP_ENGINE: 'SETUP_ENGINE',
  BG_PERFORM_OCR: 'BG_PERFORM_OCR',
  PERFORM_OCR: 'PERFORM_OCR',
  ENSURE_OFFSCREEN: 'ENSURE_OFFSCREEN',
  OPEN_SHORTCUTS_PAGE: 'OPEN_SHORTCUTS_PAGE',
  GET_SHORTCUT: 'GET_SHORTCUT',
  INITIALIZE_BACKUP: 'INITIALIZE_BACKUP',
} as const;

export type ExtensionAction =
  (typeof ExtensionAction)[keyof typeof ExtensionAction];

export interface SetupEnginePayload {
  engine: EngineOption;
  language: TesseractLang;
}

/** Payload when crop is ready, before OCR starts */
export interface PerformOcrPayload {
  engine: 'auto' | EngineOption;
  language: TesseractLang;
  croppedImage: string;
}

/** Payload for backup tab */
export interface ImagePayload {
  imageUrl: string;
}

/** isPdf for more extreme listener on pdf */
export interface ActivateOverlayPayload {
  imageUrl: string;
  isPdf: boolean;
}

/** Content of message sent using chrome.tabs or chrome.runtime, with optional payload */
export type ExtensionMessage =
  | {
      action: typeof ExtensionAction.ACTIVATE_OVERLAY;
      payload: ActivateOverlayPayload;
    }
  | { action: typeof ExtensionAction.CAPTURE_SUCCESS; payload: SelectionRect }
  | { action: typeof ExtensionAction.PING_CONTENT }
  | { action: typeof ExtensionAction.SETUP_ENGINE; payload: SetupEnginePayload }
  | {
      action: typeof ExtensionAction.BG_PERFORM_OCR;
      payload: PerformOcrPayload;
    }
  | { action: typeof ExtensionAction.PERFORM_OCR; payload: PerformOcrPayload }
  | { action: typeof ExtensionAction.ENSURE_OFFSCREEN }
  | { action: typeof ExtensionAction.OPEN_SHORTCUTS_PAGE }
  | { action: typeof ExtensionAction.GET_SHORTCUT }
  | {
      action: typeof ExtensionAction.INITIALIZE_BACKUP;
      payload: ImagePayload;
    };

/** Simple response of 'ok' or 'error' */
export interface StatusResponse {
  status: 'ok' | 'error';
}

/** Response containing the extension's shortcut */
export interface ShortcutResponse {
  status: 'ok' | 'error';
  shortcut: string;
}

/** Response containing extracted text and confidence */
export interface OcrResponse {
  status: 'ok' | 'error';
  text: string;
}

/** Processed response from OcrResponse, sent to index */
export interface IslandOcrPayload {
  success: boolean;
  text: string;
  croppedImageUrl: string;
  cursorPosition: Point;
}
