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

export type EngineOption = 'tesseract' | 'structured';

/** Tesseract 3 letter language code */
export type TesseractLang =
  | 'ara'
  | 'bul'
  | 'ben'
  | 'cat'
  | 'ces'
  | 'dan'
  | 'deu'
  | 'ell'
  | 'eng'
  | 'spa'
  | 'fin'
  | 'fra'
  | 'heb'
  | 'hin'
  | 'hun'
  | 'ind'
  | 'ita'
  | 'jpn'
  | 'kor'
  | 'nor'
  | 'nld'
  | 'pol'
  | 'por'
  | 'ron'
  | 'rus'
  | 'swe'
  | 'tha'
  | 'tur'
  | 'ukr'
  | 'vie'
  | 'chi_sim'
  | 'chi_tra';

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

export const TabsMessageAction = {
  PING_CONTENT: 'PING_CONTENT',
  INITIALIZE_BACKUP: 'INITIALIZE_BACKUP',
  ACTIVATE_OVERLAY: 'ACTIVATE_OVERLAY',
  CAPTURE_VISIBLE_TAB: 'CAPTURE_VISIBLE_TAB',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  BG_PERFORM_OCR: 'BG_PERFORM_OCR',
} as const;

export type TabsMessageAction =
  (typeof TabsMessageAction)[keyof typeof TabsMessageAction];

export type TabsMessage =
  | {
      action: typeof TabsMessageAction.PING_CONTENT;
      payload: PingContentPayload;
    }
  | {
      action: typeof TabsMessageAction.INITIALIZE_BACKUP;
      payload: ImagePayload;
    }
  | {
      action: typeof TabsMessageAction.ACTIVATE_OVERLAY;
      payload: ActivateOverlayPayload;
    }
  | {
      action: typeof TabsMessageAction.CAPTURE_VISIBLE_TAB;
      payload: ImagePayload;
    }
  // overlay route to bg to content
  | {
      action: typeof TabsMessageAction.CAPTURE_SUCCESS;
      payload: SelectionRect;
    }
  | {
      action: typeof TabsMessageAction.BG_PERFORM_OCR;
      payload: PerformOcrPayload;
    };

/** Payload when initilizing content script */
export interface PingContentPayload {
  webGpuSupported: boolean;
}

/** Payload for backup tab */
export interface ImagePayload {
  imageUrl: string;
}

/** isPdf for more extreme listener on pdf */
export interface ActivateOverlayPayload {
  imageUrl: string | null;
  isPdf: boolean;
}

/** Payload when crop is ready, before OCR starts */
export interface PerformOcrPayload {
  engine: 'auto' | EngineOption;
  language: TesseractLang;
  croppedImage: string;
}

/** Cross .ts files actions messaged using chrome */
export const RuntimeMessageAction = {
  CAPTURE_VISIBLE_TAB: 'CAPTURE_VISIBLE_TAB',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  BG_PERFORM_OCR: 'BG_PERFORM_OCR',
  ENSURE_OFFSCREEN: 'ENSURE_OFFSCREEN',
  STOP_OFFSCREEN: 'STOP_OFFSCREEN',
  OPEN_SHORTCUTS_PAGE: 'OPEN_SHORTCUTS_PAGE',
  GET_SHORTCUT: 'GET_SHORTCUT',
} as const;

export type RuntimeMessageAction =
  (typeof RuntimeMessageAction)[keyof typeof RuntimeMessageAction];

/** Content of message sent using chrome.tabs or chrome.runtime, with optional payload */
export type RuntimeMessage =
  | {
      action: typeof RuntimeMessageAction.CAPTURE_VISIBLE_TAB;
    }
  | {
      action: typeof RuntimeMessageAction.CAPTURE_SUCCESS;
      payload: SelectionRect;
    }
  | {
      action: typeof RuntimeMessageAction.BG_PERFORM_OCR;
      payload: PerformOcrPayload;
    }
  | { action: typeof RuntimeMessageAction.ENSURE_OFFSCREEN }
  | { action: typeof RuntimeMessageAction.STOP_OFFSCREEN }
  | { action: typeof RuntimeMessageAction.OPEN_SHORTCUTS_PAGE }
  | { action: typeof RuntimeMessageAction.GET_SHORTCUT };

export interface SetupEnginePayload {
  engine: EngineOption;
  language: TesseractLang;
}

export const TabsConnectAction = {
  SETUP_BEGIN: 'SETUP_BEGIN',
  SETUP_DONE: 'SETUP_DONE',
  PERFORM_OCR: 'PERFORM_OCR',
  DOWNLOAD: 'DOWNLOAD',
  PROGRESS: 'PROGRESS',
  ERROR: 'ERROR',
  FINISH: 'FINISH',
} as const;

export type TabsConnectAction =
  (typeof TabsConnectAction)[keyof typeof TabsConnectAction];

/** Message sent through port connection for streaming OCR progress */
export type TabsConnect =
  | {
      action: typeof TabsConnectAction.SETUP_BEGIN;
      payload: SetupEnginePayload;
    }
  | { action: typeof TabsConnectAction.SETUP_DONE }
  | { action: typeof TabsConnectAction.PERFORM_OCR; payload: PerformOcrPayload }
  | { action: typeof TabsConnectAction.DOWNLOAD; payload: DownloadProgress }
  | {
      action: typeof TabsConnectAction.PROGRESS;
      payload: ProgressPayload;
    }
  | { action: typeof TabsConnectAction.ERROR; payload: ErrorPayload }
  | {
      action: typeof TabsConnectAction.FINISH;
      payload: ResultPayload;
    };

export type IslandStatus =
  | 'downloading'
  | 'loading-model'
  | 'recognizing'
  | 'done'
  | 'error';

export interface DownloadProgress {
  stage: 'downloading';
  progress: number;
}

export interface ProgressPayload {
  stage: 'recognizing' | 'loading-model';
  text: string;
}

export interface ErrorPayload {
  stage: 'error';
  error: string;
}

export type ClipboardOutput = {
  textPlain: string;
  textHtml: string;
};
/** Response containing extracted plain text and html*/
export interface ResultPayload {
  stage: 'done';
  output: ClipboardOutput;
}

// Responses

/** Simple response of 'ok' or 'error' */
export interface StatusResponse {
  status: 'ok' | 'error';
}

/** Response containing the extension's shortcut */
export interface ShortcutResponse {
  status: 'ok' | 'error';
  shortcut: string;
}
