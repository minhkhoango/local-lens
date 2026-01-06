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
  error: 'error',
  active: 'active',
  imageContainer: 'image-container',
  banner: 'banner',
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
    radius: 28,
  },
  animation: {
    cursor: 'crosshair',
    lineWidth: 3,
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
    // Gemini Gradient`
    gradient: 'linear-gradient(135deg, #4285F4, #9B72CB, #D96570)',
    gradientBorder:
      'linear-gradient(135deg, rgba(66, 133, 244, 0.5), rgba(155, 114, 203, 0.5), rgba(217, 101, 112, 0.5))',
    // Scrollbar
    scrollbarThumb: '#DADCE0',
    scrollbarThumbHover: '#BDC1C6',
    // Borders & Overlays
    borderSubtle: 'rgba(0, 0, 0, 0.06)',
    overlayDark: 'rgba(0, 0, 0, 0.08)',
    inputBorder: 'rgba(0, 0, 0, 0.12)',
  },
  layout: {
    layoutPad: 12,
    boundaryPad: 2,
    radius: 28,
    radiusMedium: 12,
    radiusSmall: 8,
    radiusFull: '50%',
    radiusPill: 100,
    widthCollapsed: 320,
    // 650 & sizeSmall 11 to fit text of websites
    // without spilling to the line below
    widthExpanded: 650,
    heightCollapsed: 64,
    heightExpanded: 350,
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
    selectHeight: 32,
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
    sizeSmall: 11,
    sizeNormal: 13,
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

// ============================================================================
// BACKUP TAB STYLES
// ============================================================================

export const BACKUP_CSS = {
  colors: {
    bg: '#1e1e1e',
    surface: ISLAND_CSS.colors.surfaceContainerHigh,
    text: ISLAND_CSS.colors.textMain,
    border: 'rgba(255,255,255,0.1)',
  },
  layout: {
    bannerRadius: 28,
    bannerBottom: 24,
    bannerPadding: '12px 24px',
    zIndex: 1,
  },
  font: {
    family: ISLAND_CSS.font.family,
    size: 14,
    weight: 500,
  },
  shadows: {
    base: ISLAND_CSS.shadows.base,
    image: '0 0 20px rgba(0,0,0,0.5)',
  },
} as const;
