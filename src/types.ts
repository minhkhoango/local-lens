import type { TesseractLang } from './language_map';

export interface Point {
  x: number;
  y: number;
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const ISLAND_STATES = ['loading', 'success', 'error'] as const;
export type IslandState = (typeof ISLAND_STATES)[number];

export interface SelectionRect extends Point {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface UserLanguage {
  language: TesseractLang;
  source: 'local_storage' | 'browser' | 'browser_base' | 'default';
}

export const ExtensionAction = {
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  PING_CONTENT: 'PING_CONTENT',
  PERFORM_OCR: 'PERFORM_OCR',
  REQUEST_LANGUAGE_UPDATE: 'REQUEST_LANGUAGE_UPDATE',
  UPDATE_LANGUAGE: 'UPDATE_LANGUAGE',
  OCR_RESULT: 'OCR_RESULT',
  CROP_READY: 'CROP_READY',
  OPEN_SHORTCUTS_PAGE: 'OPEN_SHORTCUTS_PAGE',
  GET_SHORTCUT: 'GET_SHORTCUT',
  INITIALIZE_BACKUP: 'INITIALIZE_BACKUP',
  CLEANUP_STORAGE: 'CLEANUP_STORAGE',
} as const;

export type ExtensionAction =
  (typeof ExtensionAction)[keyof typeof ExtensionAction];

export interface OcrResultPayload {
  success: boolean;
  text: string;
  confidence: number;
  croppedImageUrl: string;
  cursorPosition: Point;
}

/** Payload sent when crop is ready, before OCR starts */
export interface CropReadyPayload {
  croppedImageUrl: string;
  cursorPosition: Point;
}

export interface OcrPerformPayload {
  imageDataUrl: string;
  rect: SelectionRect;
  language: TesseractLang;
}

export interface RequestLanguagePayload {
  language: TesseractLang;
}

export interface UpdateLanguagePayload {
  language: TesseractLang;
  croppedImage: string | null;
}

export interface BackupImagePayload {
  imageUrl: string;
}

export type ExtensionMessage =
  | { action: typeof ExtensionAction.ACTIVATE_OVERLAY }
  | { action: typeof ExtensionAction.CAPTURE_SUCCESS; payload: SelectionRect }
  | { action: typeof ExtensionAction.PING_CONTENT }
  | { action: typeof ExtensionAction.PERFORM_OCR; payload: OcrPerformPayload }
  | {
      action: typeof ExtensionAction.REQUEST_LANGUAGE_UPDATE;
      payload: RequestLanguagePayload;
    }
  | {
      action: typeof ExtensionAction.UPDATE_LANGUAGE;
      payload: UpdateLanguagePayload;
    }
  | { action: typeof ExtensionAction.OCR_RESULT; payload: OcrResultPayload }
  | { action: typeof ExtensionAction.CROP_READY; payload: CropReadyPayload }
  | { action: typeof ExtensionAction.OPEN_SHORTCUTS_PAGE }
  | { action: typeof ExtensionAction.GET_SHORTCUT }
  | {
      action: typeof ExtensionAction.INITIALIZE_BACKUP;
      payload: BackupImagePayload;
    }
  | { action: typeof ExtensionAction.CLEANUP_STORAGE };

export interface MessageResponse {
  status: 'ok' | 'error';
  message?: string;
  confidence?: number;
  croppedImageUrl?: string;
  data?: SelectionRect;
  shortcut?: string;
}

export interface IslandSettings {
  autoCopy: boolean;
  autoExpand: boolean;
  language: TesseractLang;
}
