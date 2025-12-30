/**
 * Design System: Google Material 3 / Gemini
 * Theme: Light, High Brightness, Paper, Gradient Accents
 * Single source of truth for magic strings, colors, and configuration.
 */

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
  // Notification
  notification: 'island-notification',
  notificationText: 'notification-text',
  notificationClose: 'notification-close',
  notificationShow: 'show-notification',
  // State modifiers
  loading: 'loading',
  success: 'success',
  error: 'error',
  active: 'active',
  wiggle: 'wiggle',
  entering: 'entering',
} as const;

export const OVERLAY_CSS_VARS = {
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

export const ISLAND_CSS_VARS = {
  colors: {
    // Material 3 Surface Tokens
    bg: '#FFFFFF',
    surfaceContainer: '#F0F4F9',
    surfaceContainerHigh: '#E9EEF6',
    textMain: '#1F1F1F', // On Surface
    textMuted: '#444746', // On Surface Variant
    textSubtle: '#747775', // Outline variant
    hoverBg: '#F0F4F9',
    activeBg: '#E3E3E3',
    primary: '#0B57D0',
    accentSuccess: '#146C2E', // Google Green 700
    accentError: '#B3261E', // Google Red 600
    // Gemini Gradient
    gradient: 'linear-gradient(135deg, #4285F4, #9B72CB, #D96570)',
    gradientBorder:
      'linear-gradient(135deg, rgba(66, 133, 244, 0.5), rgba(155, 114, 203, 0.5), rgba(217, 101, 112, 0.5))',
  },
  layout: {
    padding: 12,
    radius: 28,
    widthCollapsed: 320,
    widthExpanded: 540,
    heightCollapsed: 64,
    heightExpanded: 420,
    imageSize: 40,
    zIndex: 2147483647,
    expandToLeft: true,
    notificationHeight: 44,
    notificationGap: 8,
  },
  font: {
    family:
      "'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Roboto Mono', 'SF Mono', 'Menlo', monospace",
  },
  animation: {
    // Material 3 "Standard Emphasized" easing
    base: '0.4s cubic-bezier(0.2, 0.0, 0, 1.0)',
    fast: '0.2s cubic-bezier(0.2, 0.0, 0, 1.0)',
  },
  shadows: {
    // Elevation 3 + slight glow
    base: '0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)',
    expanded:
      '0 8px 12px 6px rgba(0, 0, 0, 0.15), 0 4px 4px rgba(0, 0, 0, 0.3)',
  },
} as const;

// Functional Configuration
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

export const ICONS = {
  // Material Symbols (Rounded)
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.09a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.09a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.09a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.09a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>`,
  // Sparkle icon for Gemini/AI feel (used in loading/processing if desired, or simpler spinner)
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21.0344C8.76993 21.0344 8.56708 20.9416 8.39143 20.7559C8.21579 20.5702 8.12797 20.3557 8.12797 20.1124C8.12797 19.1226 7.91503 18.2323 7.48915 17.4416C7.06327 16.6509 6.49547 16.0232 5.78575 15.5586C5.07604 15.0939 4.25807 14.8616 3.33185 14.8616C3.10178 14.8616 2.89893 14.7688 2.72329 14.5831C2.54764 14.3975 2.45982 14.1829 2.45982 13.9397C2.45982 13.6964 2.54764 13.4819 2.72329 13.2962C2.89893 13.1105 3.10178 13.0177 3.33185 13.0177C4.25807 13.0177 5.07604 12.7853 5.78575 12.3207C6.49547 11.856 7.06327 11.2283 7.48915 10.4376C7.91503 9.64692 8.12797 8.75664 8.12797 7.76681C8.12797 7.52355 8.21579 7.30903 8.39143 7.12334C8.56708 6.93765 8.76993 6.8448 9 6.8448C9.23007 6.8448 9.43292 6.93765 9.60857 7.12334C9.78421 7.30903 9.87203 7.52355 9.87203 7.76681C9.87203 8.75664 10.085 9.64692 10.5109 10.4376C10.9367 11.2283 11.5045 11.856 12.2143 12.3207C12.924 12.7853 13.742 13.0177 14.6682 13.0177C14.8982 13.0177 15.1011 13.1105 15.2767 13.2962C15.4524 13.4819 15.5402 13.6964 15.5402 13.9397C15.5402 14.1829 15.4524 14.3975 15.2767 14.5831C15.1011 14.7688 14.8982 14.8616 14.6682 14.8616C13.742 14.8616 12.924 15.0939 12.2143 15.5586C11.5045 16.0232 10.9367 16.6509 10.5109 17.4416C10.085 18.2323 9.87203 19.1226 9.87203 20.1124C9.87203 20.3557 9.78421 20.5702 9.60857 20.7559C9.43292 20.9416 9.23007 21.0344 9 21.0344Z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
};

export const DEFAULT_SETTINGS: IslandSettings = {
  autoCopy: true,
  autoExpand: false,
} as const;

export const SETTINGS_CONFIG: SettingsRowConfig[] = [
  { key: 'autoCopy', label: 'Auto-copy', type: 'toggle' },
  { key: 'autoExpand', label: 'Auto-expand', type: 'toggle' },
  { action: 'openShortcuts', label: 'Keyboard shortcut', type: 'button' },
];

export const ISLAND_STYLES = `
:host {
  --bg: ${ISLAND_CSS_VARS.colors.bg};
  --surface: ${ISLAND_CSS_VARS.colors.surfaceContainer};
  --text: ${ISLAND_CSS_VARS.colors.textMain};
  --text-muted: ${ISLAND_CSS_VARS.colors.textMuted};
  --success: ${ISLAND_CSS_VARS.colors.accentSuccess};
  --error: ${ISLAND_CSS_VARS.colors.accentError};
  --hover: ${ISLAND_CSS_VARS.colors.hoverBg};
  --active: ${ISLAND_CSS_VARS.colors.activeBg};
  --gradient: ${ISLAND_CSS_VARS.colors.gradient};
  --primary: ${ISLAND_CSS_VARS.colors.primary};
  
  --p: ${ISLAND_CSS_VARS.layout.padding}px;
  --radius: ${ISLAND_CSS_VARS.layout.radius}px;
  --w-min: ${ISLAND_CSS_VARS.layout.widthCollapsed}px;
  --w-max: ${ISLAND_CSS_VARS.layout.widthExpanded}px;
  --h-min: ${ISLAND_CSS_VARS.layout.heightCollapsed}px;
  --img-size: ${ISLAND_CSS_VARS.layout.imageSize}px;
  
  --font-main: ${ISLAND_CSS_VARS.font.family};
  --font-mono: ${ISLAND_CSS_VARS.font.mono};
  --ease: ${ISLAND_CSS_VARS.animation.base};
  --shadow: ${ISLAND_CSS_VARS.shadows.base};
  --shadow-expanded: ${ISLAND_CSS_VARS.shadows.expanded};
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.${CLASSES.island} {
  position: fixed;
  z-index: ${ISLAND_CSS_VARS.layout.zIndex};
  display: block;
  padding: var(--p);
  min-width: var(--w-min);
  max-width: var(--w-max);
  min-height: var(--h-min);
  height: auto;
  
  background: var(--bg);
  box-shadow: var(--shadow);
  border-radius: var(--radius);

  font-family: var(--font-main);
  color: var(--text);
  
  transition: height var(--ease), max-height var(--ease), opacity 0.2s ease, width var(--ease), box-shadow var(--ease);
  overflow: hidden;
  /* Hinting for better rendering */
  -webkit-font-smoothing: antialiased;
}

.${CLASSES.island}.${CLASSES.notificationShow} {
  /* Allow the banner to sit above the island instead of being clipped */
  overflow: visible;
}

.${CLASSES.island}.${CLASSES.expanded} {
  width: var(--w-max);
  box-shadow: var(--shadow-expanded);
}

/* Gemini/Loading Gradient Border Effect */
.${CLASSES.island}::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  padding: 2px;
  background: var(--gradient);
  -webkit-mask: 
     linear-gradient(#fff 0 0) content-box, 
     linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 1;
}

/* Show gradient when loading status exists inside */
.${CLASSES.island}:has(.${CLASSES.status}:not(.${CLASSES.success}):not(.${CLASSES.error}):contains("Processing"))::before,
.${CLASSES.island}.loading::before {
  opacity: 1;
}

/* Row Layout */
.${CLASSES.row} {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* Image */
.${CLASSES.image} {
  width: var(--img-size);
  height: var(--img-size);
  border-radius: 8px;
  object-fit: cover;
  background: var(--surface);
  /* Subtle border just for image definition */
  border: 1px solid rgba(0,0,0,0.06);
  cursor: grab;
}
.${CLASSES.image}:active { cursor: grabbing; }

/* Content Area */
.${CLASSES.content} {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.${CLASSES.status} {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  line-height: 1.4;
}
.${CLASSES.status}.${CLASSES.success} { color: var(--success); }
.${CLASSES.status}.${CLASSES.error} { color: var(--error); }

.${CLASSES.preview} {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.2s ease;
}
.${CLASSES.preview}:hover { color: var(--primary); }

/* Textarea */
.${CLASSES.textarea} {
  display: none;
  width: 100%;
  min-height: ${ISLAND_CSS_VARS.layout.heightExpanded}px;
  max-height: 500px;
  margin-top: var(--p);
  padding: 12px 16px;

  /* Material Surface Container */
  background: var(--surface);
  border: none;
  border-radius: 12px;

  color: var(--text);
  font-size: 14px;
  font-family: var(--font-mono);
  line-height: 1.6;
  resize: none;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: #DADCE0 transparent;
}
.${CLASSES.textarea}::-webkit-scrollbar { width: 8px; }
.${CLASSES.textarea}::-webkit-scrollbar-track { background: transparent; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb { background: #DADCE0; border-radius: 4px; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb:hover { background: #BDC1C6; }
.${CLASSES.textarea}:focus { box-shadow: inset 0 0 0 1px var(--primary); }

/* Actions */
.${CLASSES.actions} { display: flex; align-items: center; gap: 4px; }

.${CLASSES.btn} {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.12s ease, color 0.12s ease, transform 0.1s ease;
}
.${CLASSES.btn}:hover { background: var(--hover); color: var(--text); }
.${CLASSES.btn}:active { background: var(--active); transform: scale(0.96); }
.${CLASSES.btn}.${CLASSES.success} { color: var(--success); background: rgba(24, 128, 56, 0.1); }
.${CLASSES.btn}.${CLASSES.loading} { color: var(--primary); }
.${CLASSES.btn}.${CLASSES.loading} svg { animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;  }
.${CLASSES.btn} svg { width: 20px; height: 20px; }

/* Settings */
.${CLASSES.settings} {
  display: none;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--border);
}
.${CLASSES.island}.show-settings .${CLASSES.settings} { display: flex; }

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 0 2px;
}

.${CLASSES.toggle} {
  position: relative;
  width: 44px; /* Standard Material switch size */
  height: 24px;
  background: #D0D0D0; /* Surface Variant */
  border-radius: 100px;
  cursor: pointer;
  transition: background 0.2s ease, border 0.2s ease;
  border: 2px solid transparent;
}
.${CLASSES.toggle}.${CLASSES.active} { 
  background: #1DB954;
  border-color: #1DB954;
}
.${CLASSES.toggle}::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--bg);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), width 0.2s ease, height 0.2s ease;
}
.${CLASSES.toggle}:active::after {
  width: 20px; /* Touch feedback */
}
.${CLASSES.toggle}.${CLASSES.active}::after { 
  transform: translateX(20px);
  background: var(--bg);
}

/* Settings Action Button */
.${CLASSES.settingsActionBtn} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 16px;
  min-width: unset;

  background: ${ISLAND_CSS_VARS.colors.surfaceContainerHigh};
  color: ${ISLAND_CSS_VARS.colors.textMain};
  border: 1px solid transparent; 
  border-radius: 100px;

  font-family: var(--font-main);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s cubic-bezier(0.2, 0, 0, 1), color 0.2s ease, transform 0.1s ease;
}
.${CLASSES.settingsActionBtn}:hover {
  background: #DEE3EB;
  color: ${ISLAND_CSS_VARS.colors.primary};
}
.${CLASSES.settingsActionBtn}:active {
  background: #D5DBE5;
  transform: scale(0.96);
}

/* Notification Banner */
.${CLASSES.notification} {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: ${ISLAND_CSS_VARS.layout.notificationGap}px;
  
  display: none;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  
  background: ${ISLAND_CSS_VARS.colors.surfaceContainerHigh};
  border-radius: 22px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  
  font-size: 13px;
  font-weight: 500;
  color: ${ISLAND_CSS_VARS.colors.textMain};
  
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.${CLASSES.island}.${CLASSES.notificationShow} .${CLASSES.notification} {
  display: flex;
  opacity: 1;
  transform: translateY(0);
}

.${CLASSES.notificationText} {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${CLASSES.notificationClose} {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: 0;
  
  background: transparent;
  border: none;
  border-radius: 50%;
  
  color: ${ISLAND_CSS_VARS.colors.textMuted};
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.${CLASSES.notificationClose}:hover {
  background: rgba(0, 0, 0, 0.08);
  color: ${ISLAND_CSS_VARS.colors.textMain};
}
.${CLASSES.notificationClose} svg {
  width: 14px;
  height: 14px;
}

/* Animations */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes wiggle { 
  0%, 100% { transform: translateX(0); } 
  25% { transform: translateX(-4px); } 
  75% { transform: translateX(4px); } 
}
.${CLASSES.wiggle} { animation: wiggle 300ms cubic-bezier(0.25, 1, 0.5, 1); }

@keyframes slideUpFade { 
  from { opacity: 0; transform: translateY(12px) scale(0.98); } 
  to { opacity: 1; transform: translateY(0) scale(1); } 
}
.${CLASSES.entering} { animation: slideUpFade 0.3s cubic-bezier(0.2, 0.0, 0, 1.0) forwards; }
`;
