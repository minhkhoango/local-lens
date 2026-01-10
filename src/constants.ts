import type { IslandSettings } from './types';

export const IDS = {
  OVERLAY: 'xr-screenshot-reader-host',
  ISLAND: 'xr-floating-island-host',
};

export const OCR_CONFIG = {
  CAPTURE_FORMAT: 'png',
  CROP_MIME: 'image/png',
  LANG_PATH: 'https://tessdata.projectnaptha.com/4.0.0',
  OEM: 1,
  JUSTIFICATION: 'Processing screenshot image data for OCR',
  CACHE_METHOD: 'write',
  PROGRESS_STATUS: 'recognizing text',
} as const;

export const FILES_PATH = {
  BACKUP_HTML: 'backup.html',
  CONTENT_SCRIPT: 'content.js',
  OFFSCREEN_HTML: 'offscreen.html',
  OCR_WORKER: 'tesseract_engine/worker.min.js',
  OCR_CORE: 'tesseract_engine/tesseract-core-simd-lstm.wasm.js',
} as const;

export const CONFIG = {
  MIN_SELECTION_ZX: 5,
  MIN_SELECTION_ZY: 5,
  TEXT_MAX_COLLAPSED: 25,
  TEXT_MAX_EXPANDED: 100,
} as const;

export const STORAGE_KEYS = {
  TAB_ID: 'tabId',
  CAPTURED_IMAGE: 'capturedImage',
  CROPPED_IMAGE: 'croppedImage',
  ISLAND_SETTINGS: 'islandSettings',
} as const;

export const DEFAULT_SETTINGS: IslandSettings = {
  autoCopy: true,
  autoExpand: false,
  language: 'eng',
} as const;

export const CLASSES = {
  island: 'island',
  expanded: 'expanded',
  row: 'island-row',
  content: 'island-content',
  status: 'island-status',
  preview: 'island-preview',
  image: 'island-image',
  textarea: 'island-textarea',
  actions: 'island-actions',
  btn: 'island-btn',
  copybtn: 'copy-btn',
  settings: 'island-settings',
  settingRow: 'setting-row',
  expandSettings: 'expand-settings',
  openSettings: 'open-settings',
  settingsActionBtn: 'settings-action-btn',
  settingsSelect: 'settings-select',
  selectWrapper: 'select-wrapper',
  selectIcon: 'select-icon',
  toggle: 'toggle',
  loading: 'loading',
  success: 'success',
  active: 'active',
  imageContainer: 'image-container',
  banner: 'banner',
} as const;

export const OVERLAY_CSS = {
  colors: {
    bg: 'rgba(0, 0, 0, 0.4)',
    stroke: '#ffffff',
  },
  layout: {
    zIndex: 2147483647,
    radius: 28,
  },
  animation: {
    cursor: 'crosshair',
    lineWidth: 3,
  },
} as const;

export const ISLAND_CONFIG = {
  widthCollapsed: 320,
  maxWidthExpanded: 650,
  heightCollapsed: 64,
  layoutPad: 12,
  boundaryPad: 2,
  font: {
    family:
      "'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    sizeSmall: 11,
  },
} as const;

export const ICONS = {
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.09a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.09a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.09a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.09a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21.0344C8.76993 21.0344 8.56708 20.9416 8.39143 20.7559C8.21579 20.5702 8.12797 20.3557 8.12797 20.1124C8.12797 19.1226 7.91503 18.2323 7.48915 17.4416C7.06327 16.6509 6.49547 16.0232 5.78575 15.5586C5.07604 15.0939 4.25807 14.8616 3.33185 14.8616C3.10178 14.8616 2.89893 14.7688 2.72329 14.5831C2.54764 14.3975 2.45982 14.1829 2.45982 13.9397C2.45982 13.6964 2.54764 13.4819 2.72329 13.2962C2.89893 13.1105 3.10178 13.0177 3.33185 13.0177C4.25807 13.0177 5.07604 12.7853 5.78575 12.3207C6.49547 11.856 7.06327 11.2283 7.48915 10.4376C7.91503 9.64692 8.12797 8.75664 8.12797 7.76681C8.12797 7.52355 8.21579 7.30903 8.39143 7.12334C8.56708 6.93765 8.76993 6.8448 9 6.8448C9.23007 6.8448 9.43292 6.93765 9.60857 7.12334C9.78421 7.30903 9.87203 7.52355 9.87203 7.76681C9.87203 8.75664 10.085 9.64692 10.5109 10.4376C10.9367 11.2283 11.5045 11.856 12.2143 12.3207C12.924 12.7853 13.742 13.0177 14.6682 13.0177C14.8982 13.0177 15.1011 13.1105 15.2767 13.2962C15.4524 13.4819 15.5402 13.6964 15.5402 13.9397C15.5402 14.1829 15.4524 14.3975 15.2767 14.5831C15.1011 14.7688 14.8982 14.8616 14.6682 14.8616C13.742 14.8616 12.924 15.0939 12.2143 15.5586C11.5045 16.0232 10.9367 16.6509 10.5109 17.4416C10.085 18.2323 9.87203 19.1226 9.87203 20.1124C9.87203 20.3557 9.78421 20.5702 9.60857 20.7559C9.43292 20.9416 9.23007 21.0344 9 21.0344Z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  dropdown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
};
