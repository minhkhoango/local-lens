import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  Point,
  SelectionRect,
  // IslandState,
  // IslandSettings,
  // OcrResultPayload,
} from './types';
import {
  OVERLAY_ID,
  // ISLAND_ID,
  // ISLAND_STYLES,
  COLORS,
  CONFIG,
  UI,
  // ICONS,
  // ISLAND,
  // STORAGE_KEYS,
  // DEFAULT_SETTINGS,
} from './constants';

// State Management
let activeOverlay: GhostOverlay | null = null;
// let activeIsland: FloatingIsland | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.PING_CONTENT:
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.ACTIVATE_OVERLAY:
        if (activeOverlay) activeOverlay.destroy();
        // if (activeIsland) activeIsland.destroy();
        activeOverlay = new GhostOverlay();
        activeOverlay.mount();
        activeOverlay.activate();
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.OCR_RESULT:
        // handleOcrResult(message.payload);
        sendResponse({ status: 'ok' });
        break;
    }
    return false;
  }
);

// function handleOcrResult(payload: OcrResultPayload): void {
//   if (activeIsland) activeIsland.destroy();

//   activeIsland = new FloatingIsland(payload);
//   activeIsland.mount();
// }

// Screesnshot selection box
class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private isDragging = false;
  private startPos: Point = { x: 0, y: 0 };
  private currentPos: Point = { x: 0, y: 0 };

  constructor() {
    this.host = document.createElement('div');
    this.host.id = OVERLAY_ID;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.canvas = document.createElement('canvas');
    this.initStructure();
  }

  private initStructure(): void {
    Object.assign(this.host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: UI.FULL_WIDTH,
      height: UI.FULL_HEIGHT,
      zIndex: UI.Z_INDEX_MAX,
      pointerEvents: UI.POINTER_EVENTS_DISABLED,
    });

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) this.ctx.scale(dpr, dpr);
    this.shadow.appendChild(this.canvas);
  }

  public mount(): void {
    if (!document.getElementById(OVERLAY_ID)) {
      document.body.appendChild(this.host);
    }
  }

  public destroy(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
    activeOverlay = null;
  }

  public activate(): void {
    this.host.style.pointerEvents = UI.POINTER_EVENTS_ENABLED;
    this.host.style.cursor = COLORS.POINTER_CROSSHAIR;

    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('keydown', this.handleKeyDown);
    this.draw();
  }

  private handleMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startPos = { x: e.clientX, y: e.clientY };
    this.currentPos = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    this.draw();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.currentPos = { x: e.clientX, y: e.clientY };
    this.draw();
  };

  private handleMouseUp = (_e: MouseEvent): void => {
    this.isDragging = false;
    const rect = this.getSelectionRect();

    if (
      rect.width > CONFIG.MIN_SELECTION_ZX &&
      rect.height > CONFIG.MIN_SELECTION_ZY
    ) {
      console.log('Image captured:', rect);
      chrome.runtime.sendMessage<ExtensionMessage>({
        action: ExtensionAction.CAPTURE_SUCCESS,
        payload: rect,
      });
    }
    this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === UI.ESCAPE_KEY) this.destroy();
  };

  private draw(): void {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    this.ctx.fillStyle = COLORS.OVERLAY_BG;
    this.ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    if (this.isDragging || this.startPos.x !== 0) {
      const { x, y, width, height } = this.getSelectionRect();
      this.ctx.clearRect(x, y, width, height);
      this.ctx.strokeStyle = COLORS.SELECTION_BORDER;
      this.ctx.lineWidth = UI.CANVAS_LINE_WIDTH;
      this.ctx.strokeRect(x, y, width, height);
    }
  }

  private getSelectionRect(): SelectionRect {
    return {
      x: Math.min(this.startPos.x, this.currentPos.x),
      y: Math.min(this.startPos.y, this.currentPos.y),
      width: Math.abs(this.startPos.x - this.currentPos.x),
      height: Math.abs(this.startPos.y - this.currentPos.y),
    };
  }
}

// // FloatingIsland - Result Display UI
// type IslandState = 'loading' | 'success' | 'error';

// class FloatingIsland {
//   private host: HTMLDivElement;
//   private shadow: ShadowRoot;
//   private container: HTMLDivElement;
//   private settings: IslandSettings = { ...DEFAULT_SETTINGS };

//   private state: IslandState;
//   private text: string;
//   private imageUrl: string;
//   private position: Point;
//   private isExpanded = false;
//   private hasCopied = false;

//   // Element refs
//   private statusEl!: HTMLSpanElement;
//   private previewEl!: HTMLDivElement;
//   private copyBtn!: HTMLButtonElement;
//   private textareaEl!: HTMLTextAreaElement;

//   constructor(payload: OcrResultPayload) {
//     this.state = payload.success ? 'success' : 'error';
//     this.text = payload.text;
//     this.imageUrl = payload.croppedImageUrl;
//     this.position = this.calculatePosition(payload.cursorPosition);

//     this.host = document.createElement('div');
//     this.host.id = ISLAND_ID;
//     this.shadow = this.host.attachShadow({ mode: 'closed' });
//     this.container = document.createElement('div');

//     this.loadSettings().then(() => {
//       this.build();
//       if (this.state === 'success' && this.settings.autoCopy) {
//         this.copyToClipboard();
//       }
//     });
//   }

//   private async loadSettings(): Promise<void> {
//     try {
//       const stored = await chrome.storage.local.get(
//         STORAGE_KEYS.ISLAND_SETTINGS
//       );
//       const savedSettings = stored[STORAGE_KEYS.ISLAND_SETTINGS] as
//         | Partial<IslandSettings>
//         | undefined;
//       if (savedSettings) {
//         this.settings = {
//           ...DEFAULT_SETTINGS,
//           ...savedSettings,
//         };
//       }
//     } catch {
//       // Use defaults
//     }
//   }

//   private async saveSettings(): Promise<void> {
//     await chrome.storage.local.set({
//       [STORAGE_KEYS.ISLAND_SETTINGS]: this.settings,
//     });
//   }

//   private calculatePosition(cursor: Point): Point {
//     const padding = ISLAND.PADDING;
//     const width = ISLAND.WIDTH;
//     const height = ISLAND.HEIGHT_COLLAPSED;

//     let x = cursor.x + 10;
//     let y = cursor.y + 10;

//     // Boundary checks
//     if (x + width + padding > window.innerWidth) {
//       x = window.innerWidth - width - padding;
//     }
//     if (y + height + padding > window.innerHeight) {
//       y = cursor.y - height - 10;
//     }
//     if (x < padding) x = padding;
//     if (y < padding) y = padding;

//     return { x, y };
//   }

//   private build(): void {
//     // Inject styles
//     const style = document.createElement('style');
//     style.textContent = ISLAND_STYLES;
//     this.shadow.appendChild(style);

//     // Build container
//     this.container.className = 'island entering';
//     this.container.style.left = `${this.position.x}px`;
//     this.container.style.top = `${this.position.y}px`;

//     this.container.innerHTML = this.renderCollapsed();
//     this.shadow.appendChild(this.container);

//     // Cache refs
//     this.statusEl = this.container.querySelector('.island-status')!;
//     this.previewEl = this.container.querySelector('.island-preview')!;
//     this.copyBtn = this.container.querySelector('.copy-btn')!;

//     // Bind events
//     this.bindEvents();

//     // Update UI based on initial state
//     this.updateUI();
//   }

//   private renderCollapsed(): string {
//     const truncatedText = this.truncateText(this.text, 30);
//     const statusText =
//       this.state === 'success'
//         ? this.settings.autoCopy
//           ? 'Copied!'
//           : 'Extracted:'
//         : 'Error';
//     const statusClass = this.state === 'success' ? 'success' : 'error';

//     return `
//       <div class="island-row">
//         <img class="island-image" src="${this.imageUrl}" alt="Captured region"/>
//         <div class="island-content">
//           <span class="island-status ${statusClass}">${statusText}</span>
//           <div class="island-preview" title="Click to expand">${
//             truncatedText || 'No text detected'
//           }</div>
//         </div>
//         <div class="island-actions">
//           <button class="island-btn copy-btn" title="Copy to clipboard">
//             <svg class="progress-ring" viewBox="0 0 36 36">
//               <circle class="bg" cx="18" cy="18" r="15"/>
//               <circle class="fg" cx="18" cy="18" r="15"/>
//             </svg>
//             ${ICONS.clipboard}
//           </button>
//           <button class="island-btn settings-btn" title="Settings">${
//             ICONS.settings
//           }</button>
//           <button class="island-btn close-btn" title="Close">${ICONS.x}</button>
//         </div>
//       </div>
//       <textarea class="island-textarea" style="display:none">${this.escapeHtml(
//         this.text
//       )}</textarea>
//       <div class="island-settings">
//         <div class="setting-row">
//           <span>Auto-copy to clipboard</span>
//           <div class="toggle ${
//             this.settings.autoCopy ? 'active' : ''
//           }" data-setting="autoCopy"></div>
//         </div>
//         <div class="setting-row">
//           <span>Auto-dismiss after copy</span>
//           <div class="toggle ${
//             this.settings.autoDismiss ? 'active' : ''
//           }" data-setting="autoDismiss"></div>
//         </div>
//       </div>
//     `;
//   }

//   private bindEvents(): void {
//     // Preview click → expand
//     this.previewEl?.addEventListener('click', () => this.toggleExpand());

//     // Copy button
//     this.copyBtn?.addEventListener('click', () => this.copyToClipboard());

//     // Settings toggle
//     const settingsBtn = this.container.querySelector('.settings-btn');
//     settingsBtn?.addEventListener('click', () => this.toggleSettings());

//     // Close button
//     const closeBtn = this.container.querySelector('.close-btn');
//     closeBtn?.addEventListener('click', () => this.destroy());

//     // Toggle switches
//     const toggles = this.container.querySelectorAll('.toggle');
//     toggles.forEach((toggle) => {
//       toggle.addEventListener('click', (e) => this.handleToggle(e));
//     });

//     // Textarea changes
//     this.textareaEl = this.container.querySelector('.island-textarea')!;
//     this.textareaEl?.addEventListener('input', (e) => {
//       this.text = (e.target as HTMLTextAreaElement).value;
//       this.hasCopied = false; // Reset copy state on edit
//       this.updateCopyButton(false);
//     });

//     // Click outside to dismiss
//     document.addEventListener('click', this.handleClickOutside);
//     window.addEventListener('keydown', this.handleKeyDown);
//   }

//   private handleClickOutside = (e: MouseEvent): void => {
//     if (!this.host.contains(e.target as Node)) {
//       this.destroy();
//     }
//   };

//   private handleKeyDown = (e: KeyboardEvent): void => {
//     if (e.key === 'Escape') this.destroy();
//   };

//   private handleToggle(e: Event): void {
//     const toggle = e.target as HTMLElement;
//     const setting = toggle.dataset.setting as keyof IslandSettings;

//     if (setting === 'autoCopy' || setting === 'autoDismiss') {
//       this.settings[setting] = !this.settings[setting];
//       toggle.classList.toggle('active', this.settings[setting]);
//       this.saveSettings();
//     }
//   }

//   private toggleExpand(): void {
//     this.isExpanded = !this.isExpanded;
//     this.container.classList.toggle('expanded', this.isExpanded);

//     if (this.textareaEl) {
//       this.textareaEl.style.display = this.isExpanded ? 'block' : 'none';
//       if (this.isExpanded) {
//         this.textareaEl.focus();
//         this.textareaEl.select();
//       }
//     }
//   }

//   private toggleSettings(): void {
//     this.container.classList.toggle('show-settings');
//     // Expand if showing settings
//     if (
//       this.container.classList.contains('show-settings') &&
//       !this.isExpanded
//     ) {
//       this.isExpanded = true;
//       this.container.classList.add('expanded');
//     }
//   }

//   private async copyToClipboard(): Promise<void> {
//     if (!this.text) {
//       this.wiggle();
//       return;
//     }

//     try {
//       await navigator.clipboard.writeText(this.text);
//       this.hasCopied = true;
//       this.updateCopyButton(true);
//       this.updateStatus('Copied!', true);

//       if (this.settings.autoDismiss) {
//         setTimeout(() => this.destroy(), this.settings.autoDismissDelay);
//       }
//     } catch (err) {
//       console.error('Clipboard write failed:', err);
//       this.wiggle();
//     }
//   }

//   private updateCopyButton(success: boolean): void {
//     if (!this.copyBtn) return;

//     const svg = this.copyBtn.querySelector('svg:last-child');
//     if (svg) {
//       svg.outerHTML = success ? ICONS.check : ICONS.clipboard;
//     }
//     this.copyBtn.classList.toggle('success', success);
//   }

//   private updateStatus(text: string, success: boolean): void {
//     if (!this.statusEl) return;
//     this.statusEl.textContent = text;
//     this.statusEl.className = `island-status ${success ? 'success' : 'error'}`;
//   }

//   private updateUI(): void {
//     if (this.state === 'error') {
//       this.wiggle();
//     }
//     if (this.state === 'success' && this.settings.autoCopy && this.hasCopied) {
//       this.updateCopyButton(true);
//     }
//   }

//   private wiggle(): void {
//     this.container.classList.add('wiggle');
//     setTimeout(() => this.container.classList.remove('wiggle'), 150);
//   }

//   private truncateText(text: string, maxLength: number): string {
//     if (!text) return '';
//     const cleaned = text.replace(/\s+/g, ' ').trim();
//     return cleaned.length > maxLength
//       ? cleaned.slice(0, maxLength) + '...'
//       : cleaned;
//   }

//   private escapeHtml(text: string): string {
//     const div = document.createElement('div');
//     div.textContent = text;
//     return div.innerHTML;
//   }

//   public mount(): void {
//     if (!document.getElementById(ISLAND_ID)) {
//       document.body.appendChild(this.host);
//     }
//   }

//   public destroy(): void {
//     document.removeEventListener('click', this.handleClickOutside);
//     window.removeEventListener('keydown', this.handleKeyDown);
//     this.host.remove();
//     activeIsland = null;
//   }
// }
