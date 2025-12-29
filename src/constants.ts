/**
 * Global Constants
 * Single source of truth for magic strings, colors, and configuration.
 */

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
  toggle: 'toggle',
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
    bg: 'rgba(0, 0, 0, 0.3)',
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
    bg: 'rgba(9, 9, 11, 0.92)',
    border: 'rgba(255, 255, 255, 0.1)',
    textMain: '#fafafa',
    textMuted: '#a1a1aa',
    accentSuccess: '#4ade80',
    accentError: '#f87171',
    hoverBg: 'rgba(255, 255, 255, 0.1)',
    overlayStroke: '#ffffff',
  },
  layout: {
    padding: 8,
    radius: 16,
    widthCollapsed: 280,
    widthExpanded: 500,
    heightCollapsed: 56,
    heightExpanded: 400,
    imageSize: 40,
    zIndex: 2147483647,
    expandToLeft: true,
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'SF Mono', Monaco, 'Cascadia Code', monospace",
  },
  animation: {
    base: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// Functional Configuration
export const CONFIG = {
  WAIT_TIME_AFTER_COPY: 3000,
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
} as const;

export const ICONS = {
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
};

export const DEFAULT_SETTINGS = {
  autoCopy: true,
} as const;

export const ISLAND_STYLES = `
:host {
  --bg: ${ISLAND_CSS_VARS.colors.bg};
  --border: ${ISLAND_CSS_VARS.colors.border};
  --text: ${ISLAND_CSS_VARS.colors.textMain};
  --text-muted: ${ISLAND_CSS_VARS.colors.textMuted};
  --success: ${ISLAND_CSS_VARS.colors.accentSuccess};
  --error: ${ISLAND_CSS_VARS.colors.accentError};
  --hover: ${ISLAND_CSS_VARS.colors.hoverBg};
  
  --p: ${ISLAND_CSS_VARS.layout.padding}px;
  --radius: ${ISLAND_CSS_VARS.layout.radius}px;
  --w-min: ${ISLAND_CSS_VARS.layout.widthCollapsed}px;
  --w-max: ${ISLAND_CSS_VARS.layout.widthExpanded}px;
  --h-min: ${ISLAND_CSS_VARS.layout.heightCollapsed}px;
  --img-size: ${ISLAND_CSS_VARS.layout.imageSize}px;
  
  --font-main: ${ISLAND_CSS_VARS.font.family};
  --font-mono: ${ISLAND_CSS_VARS.font.mono};
  --ease: ${ISLAND_CSS_VARS.animation.base};
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
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
  
  font-family: var(--font-main);
  color: var(--text);
  
  transition: height var(--ease), max-height var(--ease), opacity 0.2s ease;
  overflow: hidden;
}

.${CLASSES.island}.${CLASSES.expanded} {
  width: var(--w-max);
}

/* Row Layout */
.${CLASSES.row} {
  display: flex;
  align-items: center;
  gap: var(--p);
  width: 100%;
}

/* Image */
.${CLASSES.image} {
  width: var(--img-size);
  height: var(--img-size);
  border-radius: 8px;
  object-fit: cover;
  background: var(--hover);
  border: 1px solid var(--border);
  cursor: grab;
}
.${CLASSES.image}:active { cursor: grabbing; }

/* Content Area */
.${CLASSES.content} {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.${CLASSES.status} {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.${CLASSES.status}.${CLASSES.success} { color: var(--success); }
.${CLASSES.status}.${CLASSES.error} { color: var(--error); }

.${CLASSES.preview} {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.${CLASSES.preview}:hover { color: var(--text); }

/* Textarea */
.${CLASSES.textarea} {
  display: none;
  width: 100%;
  min-height: ${ISLAND_CSS_VARS.layout.heightExpanded};
  max-height: 500px;
  margin-top: var(--p);
  padding: 10px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  font-family: var(--font-mono);
  line-height: 1.5;
  resize: none;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.3) transparent;
}
.${CLASSES.textarea}::-webkit-scrollbar { width: 8px; }
.${CLASSES.textarea}::-webkit-scrollbar-track { background: transparent; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
.${CLASSES.textarea}:focus { border-color: rgba(255,255,255,0.25); }

/* Actions */
.${CLASSES.actions} { display: flex; align-items: center; gap: 4px; }

.${CLASSES.btn} {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s ease, color 0.15s ease;
}
.${CLASSES.btn}:hover { background: var(--hover); color: var(--text); }
.${CLASSES.btn}.${CLASSES.success} { color: var(--success); }
.${CLASSES.btn}.${CLASSES.loading} svg { animation: spin 1s linear infinite; }
.${CLASSES.btn} svg { width: 18px; height: 18px; }

/* Settings */
.${CLASSES.settings} {
  display: none;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border);
}
.${CLASSES.island}.show-settings .${CLASSES.settings} { display: flex; }

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

.${CLASSES.toggle} {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--hover);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.${CLASSES.toggle}.${CLASSES.active} { background: var(--success); }
.${CLASSES.toggle}::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--text);
  border-radius: 50%;
  transition: transform 0.2s ease;
}
.${CLASSES.toggle}.${CLASSES.active}::after { transform: translateX(16px); }

/* Animations */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes wiggle { 
  0%, 100% { transform: translateX(0); } 
  25% { transform: translateX(-4px); } 
  75% { transform: translateX(4px); } 
}
.${CLASSES.wiggle} { animation: wiggle 150ms ease-in-out; }

@keyframes fadeIn { 
  from { opacity: 0; transform: translateY(8px) scale(0.96); } 
  to { opacity: 1; transform: translateY(0) scale(1); } 
}
.${CLASSES.entering} { animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
`;
