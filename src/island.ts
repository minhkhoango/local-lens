import { ICONS, ISLAND_STYLES } from './assets';
import {
  IDS,
  CLASSES,
  CONFIG,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  ISLAND_CSS,
  SETTINGS_CONFIG,
} from './constants';
import {
  ExtensionAction,
  type ExtensionMessage,
  type Point,
  type IslandSettings,
  type OcrResultPayload,
  type IslandState,
  type MessageResponse,
} from './types';

function query<T extends HTMLElement>(
  root: ShadowRoot | Document | HTMLElement,
  selector: string
): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el as T;
}

export class FloatingIsland {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;

  private settings: IslandSettings = { ...DEFAULT_SETTINGS };
  private state: IslandState = 'loading';

  private text = '';
  private imageUrl = '';
  private position: Point;
  private isExpanded = false;
  private hasCopied = false;
  private hasAutocopied = false;
  private shortcutText = 'Set shortcut';
  private viewportSize = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // Element Refs
  private els: {
    status?: HTMLSpanElement;
    preview?: HTMLDivElement;
    textarea?: HTMLTextAreaElement;
    copyBtn?: HTMLButtonElement;
    image?: HTMLImageElement;
    settingsBtn?: HTMLButtonElement;
    settingsPanel?: HTMLDivElement;
    notification?: HTMLDivElement;
    notificationClose?: HTMLButtonElement;
  } = {};

  // Drag state
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };

  constructor(cursorPosition: Point, imageUrl = '') {
    console.debug('[Island]: Initiate floating island');
    this.imageUrl = imageUrl;
    this.position = this.clampToViewport(cursorPosition);

    this.host = document.createElement('div');
    this.host.id = IDS.ISLAND;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.container = document.createElement('div');

    this.loadSettings().then(async () => {
      await this.loadShortcut();
      this.build();
    });
  }

  // --- Public Methods ---
  public updateWithResult(payload: OcrResultPayload): void {
    console.debug('[Island]: update widget with cropped img');
    this.state = payload.success ? 'success' : 'error';
    this.text = payload.text;
    if (payload.croppedImageUrl) this.imageUrl = payload.croppedImageUrl;

    this.updateUI();

    // Auto-expand on success if enabled
    if (
      this.state === 'success' &&
      this.settings.autoExpand &&
      !this.isExpanded
    ) {
      this.toggleExpand(true);
    }

    // Trigger autocopy on first success
    if (
      this.state === 'success' &&
      this.settings.autoCopy &&
      !this.hasAutocopied
    ) {
      this.hasAutocopied = true;
      this.copyToClipboard();
    }
  }

  public mount(): void {
    if (!document.getElementById(IDS.ISLAND)) {
      console.debug('[Island] mount widget on documentElement');
      document.documentElement.appendChild(this.host);
    }
  }

  public destroy(): void {
    console.log('[Island] destroy widget & listener');
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
    document.removeEventListener('click', this.handleClickOutside);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    this.host.remove();
  }

  // --- Private Methods ---
  private async loadShortcut(): Promise<void> {
    console.debug('[Island] loading shortcut from contextMenu');
    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage>({
        action: ExtensionAction.GET_SHORTCUT,
      });
      this.shortcutText = response?.shortcut || 'Set shortcut';
    } catch {
      // Keep default 'Set shortcut' on error
    }
  }

  private async loadSettings(): Promise<void> {
    console.debug('[Island] finding settings from chrome local storage');
    try {
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.ISLAND_SETTINGS,
      ]);
      const savedSettings = stored[STORAGE_KEYS.ISLAND_SETTINGS] as
        | Partial<IslandSettings>
        | undefined;
      if (savedSettings) {
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...savedSettings,
        };
      }
    } catch {
      /* ignore */
    }
  }

  private build(): void {
    console.log('[Island] Building the full widget, caching refs');
    // Inject styles
    const style = document.createElement('style');
    style.textContent = ISLAND_STYLES;
    this.shadow.appendChild(style);

    // Build container
    this.container.className = `${CLASSES.island}`;
    this.updatePosition();
    this.container.innerHTML = this.renderTemplate();
    this.shadow.appendChild(this.container);

    // Cache refs
    this.els.status = query(this.container, `.${CLASSES.status}`);
    this.els.preview = query(this.container, `.${CLASSES.preview}`);
    this.els.textarea = query(this.container, `.${CLASSES.textarea}`);
    this.els.copyBtn = query(
      this.container,
      `.${CLASSES.btn}.${CLASSES.copybtn}`
    );
    this.els.image = query(this.container, `.${CLASSES.image}`);
    this.els.settingsBtn = query(this.container, `.${CLASSES.openSettings}`);
    this.els.settingsPanel = query(this.container, `.${CLASSES.settings}`);

    this.bindEvents();
  }

  private renderTemplate(): string {
    console.debug('[Island] Rendering img, icons, settings of widget');
    return `
      <div class="${CLASSES.row}">
        <img class="${CLASSES.image}" src="${this.imageUrl}" alt="Captured region"/>
        <div class="${CLASSES.content}">
          <span class="${CLASSES.status}">Processing...</span>
          <div class="${CLASSES.preview}" title="Click to expand"></div>
        </div>
        <div class="${CLASSES.actions}">
          <button class="${CLASSES.btn} ${CLASSES.copybtn} ${CLASSES.loading}">${ICONS.spinner}</button>
          <button class="${CLASSES.btn} ${CLASSES.openSettings}">${ICONS.settings}</button>
        </div>
      </div>
      <textarea class="${CLASSES.textarea}"></textarea>
      <div class="${CLASSES.settings}">
        ${this.renderSettingsRows()}
      </div>
    `;
  }

  private updateUI(): void {
    if (
      !this.els.status ||
      !this.els.copyBtn ||
      !this.els.preview ||
      !this.els.textarea
    )
      return;
    console.debug('[Island] updateUI()');

    const isLoading = this.state === 'loading';
    const isSuccess = this.state === 'success';

    if (this.els.image && this.imageUrl) this.els.image.src = this.imageUrl;

    this.els.status.className = `${CLASSES.status} ${this.state}`;
    this.els.status.textContent = isLoading
      ? 'Processing...'
      : isSuccess
        ? this.hasCopied
          ? 'Copied!'
          : 'Extracted'
        : 'Error';

    // Button
    this.els.copyBtn.className = `${CLASSES.btn} ${CLASSES.copybtn}
                                  ${isLoading ? CLASSES.loading : ''} 
                                  ${this.hasCopied ? CLASSES.success : ''}`;
    this.els.copyBtn.innerHTML = isLoading
      ? ICONS.spinner
      : this.hasCopied
        ? ICONS.check
        : ICONS.clipboard;
    this.els.copyBtn.disabled = isLoading;

    // Text & Preview
    this.els.textarea.value = this.text;
    const cleanText = this.text.replace(/\s+/g, ' ').trim();
    const maxLength = this.isExpanded
      ? CONFIG.TEXT_MAX_EXPANDED
      : CONFIG.TEXT_MAX_COLLAPSED;
    this.els.preview.textContent =
      cleanText.length > maxLength
        ? cleanText.slice(0, maxLength) + '...'
        : cleanText || (isLoading ? '' : 'No text');
  }

  private renderSettingsRows(): string {
    console.debug('[Island] rendering the hidden settings of widget');
    return SETTINGS_CONFIG.map((config) => {
      // Render language dropdown
      if (config.type === 'dropdown') {
        const currentValue = this.settings[config.key] as string;
        const optionsHtml = config.options
          .map(
            (opt) =>
              `<option value="${opt.value}" ${opt.value === currentValue ? 'selected' : ''}>
                ${opt.label}
              </option>`
          )
          .join('');

        return `
           <div class="${CLASSES.settingRow}">
             <span>${config.label}</span>
             <div class="${CLASSES.selectWrapper}">
                <select class="${CLASSES.settingsSelect}" data-key="${config.key}">
                  ${optionsHtml}
                </select>
                <div class="${CLASSES.selectIcon}">${ICONS.dropdown}</div>
             </div>
           </div>`;
      }

      // Render auto-copy / auto-expand toggles
      if ('key' in config) {
        const toggleClass = `${CLASSES.toggle} ${this.settings[config.key] ? CLASSES.active : ''}`;
        return `
          <div class="${CLASSES.settingRow}">
            <span>${config.label}</span>
            <div class="${toggleClass}" data-key="${config.key}"></div>
          </div>`;
      }

      // Render shortcut button
      return `
        <div class="${CLASSES.settingRow}">
          <span>${config.label}</span>
          <button class="${CLASSES.settingsActionBtn}" data-action="${config.action}">
            ${this.shortcutText}
          </button>
        </div>`;
    }).join('');
  }

  // --- Logic & Events ---

  private bindEvents(): void {
    console.debug('[Island] Binding events to icons / widget');
    this.container.addEventListener('mousedown', this.handleDragStart);
    document.addEventListener('click', this.handleClickOutside);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);

    this.els.preview?.addEventListener('click', () => this.toggleExpand());
    this.els.copyBtn?.addEventListener('click', () => this.copyToClipboard());
    this.els.textarea?.addEventListener('input', (e) => {
      this.text = (e.target as HTMLTextAreaElement).value;
      this.hasCopied = false;
      this.updateUI();
    });
    this.els.settingsBtn?.addEventListener('click', () => {
      this.container.classList.toggle(CLASSES.expandSettings);

      // Reposition after settings panel changes widget size
      this.position = this.constrainToViewport(this.position);
      this.updatePosition();
    });

    this.els.settingsPanel?.addEventListener(
      'change',
      this.handleLanguageUpdate
    );

    this.els.settingsPanel?.addEventListener(
      'click',
      this.handleToggleSettings
    );
  }

  private handleToggleSettings = (e: PointerEvent): void => {
    console.debug('[Island] Handle toggle UI in settings');
    const toggle = (e.target as HTMLElement).closest(`.${CLASSES.toggle}`);
    if (toggle) {
      const key = toggle.getAttribute('data-key') as keyof IslandSettings;
      if (!key) return;

      (this.settings[key] as boolean) = !this.settings[key];
      toggle.classList.toggle(CLASSES.active, this.settings[key] as boolean);
      chrome.storage.local.set({
        [STORAGE_KEYS.ISLAND_SETTINGS]: this.settings,
      });

      // Trigger action immediately when enabling
      if (this.settings[key]) {
        if (
          key === 'autoExpand' &&
          this.state === 'success' &&
          !this.isExpanded
        ) {
          this.toggleExpand(true);
        } else if (
          key === 'autoCopy' &&
          this.state === 'success' &&
          this.text
        ) {
          this.copyToClipboard();
        }
      }
      return;
    }

    // Handle button clicks
    const button = (e.target as HTMLElement).closest(
      `.${CLASSES.settingsActionBtn}`
    );
    if (button) {
      const action = button.getAttribute('data-action');
      if (action === 'openShortcuts') {
        chrome.runtime.sendMessage<ExtensionMessage>({
          action: ExtensionAction.OPEN_SHORTCUTS_PAGE,
        });
      }
    }
  };

  private handleLanguageUpdate = async (e: Event): Promise<void> => {
    console.debug(
      '[Island] Handle the language update, calling bg -> offscreen'
    );
    const target = e.target as HTMLSelectElement;
    if (!target.classList.contains(CLASSES.settingsSelect)) return;

    const key = target.getAttribute('data-key') as keyof IslandSettings;
    const newLanguage = target.value;

    if (key === 'language') {
      // Optimistic UI update
      this.settings[key] = newLanguage;
      chrome.storage.local.set({
        [STORAGE_KEYS.ISLAND_SETTINGS]: this.settings,
      });

      // Trigger update language / ocr logic
      if (this.imageUrl) {
        const previousText = this.text;

        this.state = 'loading';
        this.text = '';
        this.hasCopied = false;
        this.updateUI();

        try {
          // Route through background for ensureOff func
          const ocrResult = await chrome.runtime.sendMessage<
            ExtensionMessage,
            MessageResponse
          >({
            action: ExtensionAction.REQUEST_LANGUAGE_UPDATE,
            payload: { language: newLanguage },
          });

          if (!ocrResult || ocrResult.status === 'error') {
            throw new Error(ocrResult?.message || 'Unknown OCR error');
          }

          this.state = 'success';
          this.text = ocrResult.message || '';

          if (this.settings.autoCopy) {
            this.copyToClipboard();
          }
        } catch (err) {
          console.error('Language update failed:', err);

          this.state = 'error';
          this.text = previousText;

          if (this.els.status) {
            this.els.status.textContent = 'Retry Failed';
          }
        } finally {
          this.updateUI();
        }
      }
    }
  };

  private toggleExpand(force?: boolean): void {
    console.debug('[Island] link text to expansion of widget, expand to left');
    if (this.state === 'loading') return;

    const wasExpanded = this.isExpanded;
    this.isExpanded = force ?? !this.isExpanded;
    if (wasExpanded === this.isExpanded) return;

    // Expand/collapse to the left
    if (ISLAND_CSS.layout.expandToLeft) {
      const widthDiff =
        ISLAND_CSS.layout.widthExpanded - ISLAND_CSS.layout.widthCollapsed;
      this.position.x += this.isExpanded ? -widthDiff : widthDiff;
    }

    this.container.classList.toggle(CLASSES.expanded, this.isExpanded);
    if (this.els.textarea) {
      this.els.textarea.style.display = this.isExpanded ? 'block' : 'none';
      if (this.isExpanded) this.els.textarea.focus();
    }

    // Important: Only constrain to viewport when expanding
    if (this.isExpanded) {
      this.position = this.constrainToViewport(this.position);
    }
    this.updatePosition();

    this.updateUI();
  }

  private async copyToClipboard(): Promise<void> {
    console.debug('[Island] Handle copy to clipboard');
    if (!this.text) return;
    if (!navigator.clipboard) {
      console.warn('Clipboard API not available');
      this.els.status!.textContent = 'Clipboard Error';
      return;
    }

    try {
      await navigator.clipboard.writeText(this.text);
      this.hasCopied = true;
      this.updateUI();
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.message.includes('focus')) {
          console.log(
            'Auto-copy blocked (document not focused). Waiting for user click.'
          );
        }
      } else {
        // Genuine unexpected errors
        console.error('Clipboard write failed:', err);
        this.state = 'error';
        this.updateUI();
      }
    }
  }

  private updatePosition(): void {
    console.debug('[Island] Update widget position');
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  // --- Dragging ---
  private handleDragStart = (e: MouseEvent): void => {
    console.debug(
      '[Island] Enable drag feature on clicking non-icon, with boundaries'
    );
    const target = e.target as HTMLElement;
    if (
      target.closest(
        `.${CLASSES.btn}, 
        .${CLASSES.toggle}, 
        .${CLASSES.textarea}, 
        .${CLASSES.preview}, 
        .${CLASSES.settingsSelect}, 
        .${CLASSES.selectWrapper}, 
        .${CLASSES.settingsActionBtn}`
      )
    )
      return;

    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - this.position.x,
      y: e.clientY - this.position.y,
    };

    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
    e.preventDefault();
    e.stopPropagation();
  };

  private handleDragMove = (e: MouseEvent): void => {
    console.debug('[Island] Handle widget move, constrain its position');
    if (!this.isDragging) return;
    this.position = this.constrainToViewport({
      x: e.clientX - this.dragOffset.x,
      y: e.clientY - this.dragOffset.y,
    });
    this.updatePosition();
  };

  private handleDragEnd = (): void => {
    console.debug('[Island] Handle when drag ends, remove listeners');
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  private handleClickOutside = (e: MouseEvent): void => {
    console.debug('[Island] Handle click outside, destroy?');
    if (!this.host.contains(e.target as Node)) this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    console.debug('[Island] Listen to "Escape" to exit widget');
    if (e.key === 'Escape') this.destroy();
  };

  private handleResize = (): void => {
    console.debug('[Island] Reposition widget on viewport resize');
    const { innerWidth, innerHeight } = window;
    const { width: prevWidth, height: prevHeight } = this.viewportSize;

    // For very first resize
    if (prevWidth === 0 || prevHeight === 0) {
      this.viewportSize = { width: innerWidth, height: innerHeight };
      return;
    }

    const scaleX = innerWidth / prevWidth;
    const scaleY = innerHeight / prevHeight;

    // Bails out on odd browser
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
      this.viewportSize = { width: innerWidth, height: innerHeight };
      return;
    }

    this.position = this.constrainToViewport({
      x: this.position.x * scaleX,
      y: this.position.y * scaleY,
    });

    this.updatePosition();
    this.viewportSize = { width: innerWidth, height: innerHeight };
  };

  private clampToViewport(pos: Point): Point {
    console.debug(
      '[Island] clamp to viewport, ensure UI spawn inside page on initilization'
    );
    const width = ISLAND_CSS.layout.widthCollapsed;
    const height = ISLAND_CSS.layout.heightCollapsed;
    const pad = ISLAND_CSS.layout.padding;

    const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
    const y = Math.min(Math.max(pad, pos.y), window.innerHeight - height - pad);
    return { x, y };
  }

  private constrainToViewport(pos: Point): Point {
    console.debug(
      '[Island] constrains to vp, make sure UI never visually leave bounding box'
    );
    const padding = ISLAND_CSS.layout.padding;
    const containerRect = this.container.getBoundingClientRect();
    const width = containerRect.width;
    const height = containerRect.height;

    const x = Math.min(
      Math.max(padding, pos.x),
      window.innerWidth - width - padding
    );
    const y = Math.min(
      Math.max(padding, pos.y),
      window.innerHeight - height - padding
    );

    return { x, y };
  }
}
