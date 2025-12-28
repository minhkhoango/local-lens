/**
 * Global Constants
 * Single source of truth for magic strings, colors, and configuration.
 */

export const OVERLAY_ID = 'xr-screenshot-reader-host';
export const ISLAND_ID = 'xr-floating-island-host';

export const COLORS = {
  OVERLAY_BG: 'rgba(0, 0, 0, 0.3)',
  SELECTION_BORDER: '#ffffff',
  POINTER_CROSSHAIR: 'crosshair',
} as const;

// Minimum pixels to trigger a captur
export const CONFIG = {
  MIN_SELECTION_ZX: 5,
  MIN_SELECTION_ZY: 5,
} as const;

// Shared file and storage identifiers
export const FILES = {
  CONTENT_SCRIPT: 'content.js',
  OFFSCREEN_HTML: 'offscreen.html',
  OCR_WORKER: 'tesseract_engine/worker.min.js',
  OCR_CORE: 'tesseract_engine/tesseract-core-simd-lstm.wasm.js',
} as const;

export const STORAGE_KEYS = {
  CAPTURED_IMAGE: 'capturedImage',
  ISLAND_SETTINGS: 'islandSettings',
} as const;

// OCR-related defaults
export const OCR = {
  CAPTURE_FORMAT: 'png',
  CROP_MIME: 'image/png',
  LANG: 'eng',
  OEM: 1,
  JUSTIFICATION: 'Processing screenshot image data for OCR',
  CACHE_METHOD: 'none',
  PROGRESS_STATUS: 'recognizing text',
} as const;

// UI control flags
export const UI = {
  CANVAS_LINE_WIDTH: 2,
  ESCAPE_KEY: 'Escape',
  POINTER_EVENTS_DISABLED: 'none',
  POINTER_EVENTS_ENABLED: 'auto',
  FULL_WIDTH: '100vw',
  FULL_HEIGHT: '100vh',
  Z_INDEX_MAX: '2147483647',
} as const;

// SVG Icons
export const ICONS = {
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
};

// Floating Island defaults
export const ISLAND = {
  WIDTH: 280,
  HEIGHT_COLLAPSED: 56,
  HEIGHT_EXPANDED: 300,
  PADDING: 16,
  IMAGE_SIZE: 40,
  AUTO_DISMISS_DELAY: 3000,
} as const;

// Floating Island CSS (semi-minified for readability)
export const ISLAND_STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
.island{position:fixed;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:8px 12px;min-width:280px;max-width:400px;height:56px;background:rgba(9,9,11,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.05);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fafafa;transition:height 0.25s cubic-bezier(0.4,0,0.2,1),max-height 0.25s cubic-bezier(0.4,0,0.2,1),opacity 0.2s ease;overflow:hidden}
.island.expanded{height:auto;max-height:300px;flex-direction:column;align-items:stretch;padding:12px}
.island.expanded .island-row{display:flex;align-items:center;gap:12px;width:100%}
@keyframes wiggle{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.island.wiggle{animation:wiggle 150ms ease-in-out}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.island.entering{animation:fadeIn 0.2s cubic-bezier(0.4,0,0.2,1) forwards}
.island-image{width:40px;height:40px;min-width:40px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.1)}
.island-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.island-status{font-size:13px;font-weight:500;color:#fafafa;display:flex;align-items:center;gap:6px}
.island-status.success{color:#4ade80}
.island-status.error{color:#f87171}
.island-preview{font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;cursor:pointer}
.island-preview:hover{color:#d4d4d8}
.island-textarea{width:100%;min-height:120px;max-height:200px;margin-top:8px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fafafa;font-size:13px;font-family:'SF Mono',Monaco,'Cascadia Code',monospace;line-height:1.5;resize:vertical;outline:none;transition:border-color 0.15s ease}
.island-textarea:focus{border-color:rgba(255,255,255,0.25)}
.island-actions{display:flex;align-items:center;gap:4px}
.island-btn{position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:transparent;border:none;border-radius:10px;cursor:pointer;color:#a1a1aa;transition:background 0.15s ease,color 0.15s ease}
.island-btn:hover{background:rgba(255,255,255,0.1);color:#fafafa}
.island-btn.success{color:#4ade80}
.island-btn svg{width:18px;height:18px}
.progress-ring{position:absolute;inset:0;transform:rotate(-90deg)}
.progress-ring circle{fill:none;stroke-width:2;stroke-linecap:round}
.progress-ring .bg{stroke:rgba(255,255,255,0.1)}
.progress-ring .fg{stroke:#4ade80;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset 0.2s ease}
@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}}
.loading-dots span{animation:pulse 1s ease-in-out infinite}
.loading-dots span:nth-child(2){animation-delay:0.2s}
.loading-dots span:nth-child(3){animation-delay:0.4s}
.island-settings{display:none;flex-direction:column;gap:8px;padding-top:8px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.1)}
.island.show-settings .island-settings{display:flex}
.setting-row{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#a1a1aa}
.toggle{position:relative;width:36px;height:20px;background:rgba(255,255,255,0.1);border-radius:10px;cursor:pointer;transition:background 0.2s ease}
.toggle.active{background:#4ade80}
.toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fafafa;border-radius:50%;transition:transform 0.2s ease}
.toggle.active::after{transform:translateX(16px)}
`;

// Default settings
export const DEFAULT_SETTINGS = {
  autoCopy: true,
  autoDismiss: false,
  autoDismissDelay: 3000,
} as const;
