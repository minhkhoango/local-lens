import type { SettingsRowConfig, IslandSettings } from './types';

export const IDS = {
  OVERLAY: 'xr-screenshot-reader-host',
  ISLAND: 'xr-floating-island-host',
};

export const OCR_CONFIG = {
  CAPTURE_FORMAT: 'png',
  CROP_MIME: 'image/png',
  LANG: 'eng',
  OEM: 1,
  JUSTIFICATION: 'Processing screenshot image data for OCR',
  CACHE_METHOD: 'none',
  PROGRESS_STATUS: 'recognizing text',
} as const;

export const FILES_PATH = {
  CONTENT_SCRIPT: 'content.js',
  OFFSCREEN_HTML: 'offscreen.html',
  OCR_WORKER: 'tesseract_engine/worker.min.js',
  OCR_CORE: 'tesseract_engine/tesseract-core-simd-lstm.wasm.js',
} as const;

export const CONFIG = {
  WIGGLE_TIME: 200,
  MIN_SELECTION_ZX: 5,
  MIN_SELECTION_ZY: 5,
  DRAG_THRESHOLD: 3,
  TEXT_MAX_COLLAPSED: 25,
  TEXT_MAX_EXPANDED: 100,
} as const;

export const STORAGE_KEYS = {
  CAPTURED_IMAGE: 'capturedImage',
  ISLAND_SETTINGS: 'islandSettings',
  SHORTCUT_HINT_SHOWN: 'shortcutHintShown',
} as const;

export const DEFAULT_SETTINGS: IslandSettings = {
  autoCopy: true,
  autoExpand: false,
} as const;

export const SETTINGS_CONFIG: SettingsRowConfig[] = [
  { key: 'autoCopy', label: 'Auto-copy', type: 'toggle' },
  { key: 'autoExpand', label: 'Auto-expand', type: 'toggle' },
  { action: 'openShortcuts', label: 'Keyboard shortcut', type: 'button' },
];

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
  settingsbtn: 'settings-btn',
  settings: 'island-settings',
  settingsShow: 'show-settings',
  settingsActionBtn: 'settings-action-btn',
  toggle: 'toggle',
  loading: 'loading',
  success: 'success',
  error: 'error',
  active: 'active',
  wiggle: 'wiggle',
  entering: 'entering',
  notification: 'island-notification',
  notificationText: 'notification-text',
  notificationClose: 'notification-close',
  notificationShow: 'show-notification',
} as const;

// ============================================================================
// OVERLAY STYLES
// ============================================================================

export const OVERLAY_CSS = {
  colors: {
    bg: 'rgba(0, 0, 0, 0.4)',
    stroke: '#ffffff',
  },
  layout: {
    zIndex: 2147483647,
  },
  animation: {
    cursor: 'crosshair',
    lineWidth: 2,
  },
} as const;

// ============================================================================
// ISLAND DESIGN SYSTEM
// ============================================================================

export const ISLAND_CSS = {
  colors: {
    // Material 3 Surface Tokens
    bg: '#FFFFFF',
    surfaceContainer: '#F0F4F9',
    surfaceContainerHigh: '#E9EEF6',
    textMain: '#1F1F1F', // On Surface
    textMuted: '#444746', // On Surface Variant
    textSubtle: '#747775', // Outline variant
    hoverBg: '#F0F4F9',
    hoverBgDark: '#DEE3EB',
    activeBg: '#E3E3E3',
    activeBgDark: '#D5DBE5',
    primary: '#0B57D0',
    accentSuccess: '#146C2E', // Google Green 700
    accentSuccessBg: 'rgba(24, 128, 56, 0.1)',
    accentError: '#B3261E', // Google Red 600
    toggleInactive: '#D0D0D0',
    toggleActive: '#1DB954',
    // Gemini Gradient
    gradient: 'linear-gradient(135deg, #4285F4, #9B72CB, #D96570)',
    gradientBorder:
      'linear-gradient(135deg, rgba(66, 133, 244, 0.5), rgba(155, 114, 203, 0.5), rgba(217, 101, 112, 0.5))',
    // Scrollbar
    scrollbarThumb: '#DADCE0',
    scrollbarThumbHover: '#BDC1C6',
    // Borders & Overlays
    borderSubtle: 'rgba(0, 0, 0, 0.06)',
    overlayDark: 'rgba(0, 0, 0, 0.08)',
  },
  layout: {
    padding: 12,
    radius: 28,
    radiusMedium: 12,
    radiusSmall: 8,
    radiusFull: '50%',
    radiusPill: 100,
    radiusNotification: 22,
    widthCollapsed: 320,
    widthExpanded: 540,
    heightCollapsed: 64,
    heightExpanded: 420,
    heightMax: 500,
    imageSize: 40,
    buttonSize: 40,
    buttonSizeSmall: 24,
    buttonHeightCompact: 32,
    iconSize: 20,
    iconSizeSmall: 14,
    toggleWidth: 44,
    toggleHeight: 24,
    toggleKnobSize: 16,
    toggleKnobSizeActive: 20,
    zIndex: 2147483647,
    expandToLeft: true,
    notificationHeight: 44,
    notificationGap: 8,
  },
  spacing: {
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 10,
    xxl: 12,
    xxxl: 16,
  },
  font: {
    family:
      "'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Roboto Mono', 'SF Mono', 'Menlo', monospace",
    sizeSmall: 13,
    weightMedium: 500,
    lineHeightNormal: 1.4,
    lineHeightRelaxed: 1.6,
  },
  animation: {
    // Material 3 "Standard Emphasized" easing
    base: '0.4s cubic-bezier(0.2, 0.0, 0, 1.0)',
    fast: '0.2s cubic-bezier(0.2, 0.0, 0, 1.0)',
    quick: '0.12s ease',
    smooth: '0.25s ease',
    gradient: '0.3s ease',
    spin: '1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
    wiggle: '300ms cubic-bezier(0.25, 1, 0.5, 1)',
    slideUp: '0.3s cubic-bezier(0.2, 0.0, 0, 1.0)',
  },
  shadows: {
    // Elevation 3 + slight glow
    base: '0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)',
    expanded:
      '0 8px 12px 6px rgba(0, 0, 0, 0.15), 0 4px 4px rgba(0, 0, 0, 0.3)',
    notification: '0 2px 6px rgba(0, 0, 0, 0.1)',
    toggleKnob: '0 1px 2px rgba(0,0,0,0.2)',
  },
  borders: {
    subtle: '1px solid rgba(0,0,0,0.06)',
    toggle: '2px solid transparent',
    gradient: '2px',
  },
} as const;
