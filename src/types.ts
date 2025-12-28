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

export interface SelectionRect extends Point, Dimension {}

export const ExtensionAction = {
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  PING_CONTENT: 'PING_CONTENT',
  PING_OFFSCREEN: 'PING_OFFSCREEN',
  PERFORM_OCR: 'PERFORM_OCR',
  OCR_RESULT: 'OCR_RESULT',
  OCR_PROGRESS: 'OCR_PROGRESS',
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
    };

export interface MessageResponse {
  status: 'ok' | 'error';
  message?: string;
  confidence?: number;
  croppedImageUrl?: string;
  data?: SelectionRect;
}

export interface SessionStorage {
  capturedImage: string;
}

/** Settings stored in chrome.storage.local */
export interface IslandSettings {
  autoCopy: boolean;
  autoDismiss: boolean;
  autoDismissDelay: number;
}

export type IslandState = 'loading' | 'success' | 'error';
