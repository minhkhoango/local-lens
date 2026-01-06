import { ICONS, ISLAND_STYLES } from './assets';
import {
  IDS,
  CLASSES,
  CONFIG,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  ISLAND_CSS,
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
import {
  type LanguageSchema,
  type TesseractLang,
  LANGUAGES,
  LANGUAGES_OPTIONS,
} from './language_map';

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

  private uiLang: LanguageSchema = LANGUAGES['eng'];
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
    settingsLabelLang?: HTMLSpanElement;
    settingsLabelAutoCopy?: HTMLSpanElement;
    settingsLabelAutoExpand?: HTMLSpanElement;
    settingsLabelShortcut?: HTMLSpanElement;
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
      this.shortcutText = response?.shortcut || this.uiLang.island.setShortcut;
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
        if (savedSettings.language)
          this.uiLang = LANGUAGES[savedSettings.language];
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

    // Cache settings label spans
    this.els.settingsLabelLang = query(
      this.container,
      `.${CLASSES.settingRow}:nth-child(1) > span`
    );
    this.els.settingsLabelAutoCopy = query(
      this.container,
      `.${CLASSES.settingRow}:nth-child(2) > span`
    );
    this.els.settingsLabelAutoExpand = query(
      this.container,
      `.${CLASSES.settingRow}:nth-child(3) > span`
    );
    this.els.settingsLabelShortcut = query(
      this.container,
      `.${CLASSES.settingRow}:nth-child(4) > span`
    );

    this.bindEvents();
  }

  private renderTemplate(): string {
    console.debug('[Island] Rendering img, icons, settings of widget');
    return `
      <div class="${CLASSES.row}">
        <img class="${CLASSES.image}" src="${this.imageUrl}" alt="${this.uiLang.island.croppedScreenshot}"/>
        <div class="${CLASSES.content}">
          <span class="${CLASSES.status}">${this.uiLang.island.processing}</span>
          <div class="${CLASSES.preview}" title="${this.uiLang.island.expand}"></div>
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
    console.debug('[Island] updateUI(), core logic');

    const isLoading = this.state === 'loading';
    const isSuccess = this.state === 'success';

    if (this.els.image && this.imageUrl) this.els.image.src = this.imageUrl;

    this.els.status.className = `${CLASSES.status} ${this.state}`;
    this.els.status.textContent = isLoading
      ? this.uiLang.island.processing
      : isSuccess
        ? this.hasCopied
          ? this.uiLang.island.copied
          : this.uiLang.island.extracted
        : this.uiLang.island.error;

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
        : cleanText || (isLoading ? '' : this.uiLang.island.noText);

    if (
      !this.els.settingsLabelLang ||
      !this.els.settingsLabelAutoCopy ||
      !this.els.settingsLabelAutoExpand ||
      !this.els.settingsLabelShortcut
    )
      return;
    console.debug('[Island] updateUI(), settings label language');

    this.els.settingsLabelLang.textContent = this.uiLang.island.lang;
    this.els.settingsLabelAutoCopy.textContent = this.uiLang.island.autoCopy;
    this.els.settingsLabelAutoExpand.textContent =
      this.uiLang.island.autoExpand;
    this.els.settingsLabelShortcut.textContent = this.uiLang.island.shortcut;

    if (!this.els.image || !this.els.preview) return;
    this.els.image.alt = this.uiLang.island.croppedScreenshot;
    this.els.preview.title = this.uiLang.island.expand;
  }

  private renderSettingsRows(): string {
    console.debug('[Island] rendering the hidden settings of widget');

    // Language dropdown
    const currentLanguage = this.settings.language as string;
    const languageOptions =
      LANGUAGES_OPTIONS?.map(
        (opt: { value: string; label: string }) =>
          `<option value="${opt.value}" ${opt.value === currentLanguage ? 'selected' : ''}>
            ${opt.label}
          </option>`
      ).join('') || '';
    const languageRow = `
      <div class="${CLASSES.settingRow}">
        <span>${this.uiLang.island.lang}</span>
        <div class="${CLASSES.selectWrapper}">
          <select class="${CLASSES.settingsSelect}" data-key="language">
            ${languageOptions}
          </select>
          <div class="${CLASSES.selectIcon}">${ICONS.dropdown}</div>
        </div>
      </div>`;

    // Auto-copy toggle
    const autoCopyClass = `${CLASSES.toggle} ${this.settings.autoCopy ? CLASSES.active : ''}`;
    const autoCopyRow = `
      <div class="${CLASSES.settingRow}">
        <span>${this.uiLang.island.autoCopy}</span>
        <div class="${autoCopyClass}" data-key="autoCopy"></div>
      </div>`;

    // Auto-expand toggle
    const autoExpandClass = `${CLASSES.toggle} ${this.settings.autoExpand ? CLASSES.active : ''}`;
    const autoExpandRow = `
      <div class="${CLASSES.settingRow}">
        <span>${this.uiLang.island.autoExpand}</span>
        <div class="${autoExpandClass}" data-key="autoExpand"></div>
      </div>`;

    // Keyboard shortcut button
    const shortcutRow = `
      <div class="${CLASSES.settingRow}">
        <span>${this.uiLang.island.shortcut}</span>
        <button class="${CLASSES.settingsActionBtn}" data-action="openShortcuts">
          ${this.shortcutText}
        </button>
      </div>`;

    return languageRow + autoCopyRow + autoExpandRow + shortcutRow;
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
    const newLanguage = target.value as TesseractLang;

    if (key === 'language') {
      // Optimistic UI update
      this.settings[key] = newLanguage;
      chrome.storage.local.set({
        [STORAGE_KEYS.ISLAND_SETTINGS]: this.settings,
      });
      this.uiLang = LANGUAGES[newLanguage];
      this.updateUI();

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
      this.els.status!.textContent = this.uiLang.island.clipboardError;
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
    const pad = ISLAND_CSS.layout.boundaryPad;
    const width = ISLAND_CSS.layout.widthCollapsed;
    const height = ISLAND_CSS.layout.heightCollapsed;

    const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
    const y = Math.min(Math.max(pad, pos.y), window.innerHeight - height - pad);
    return { x, y };
  }

  private constrainToViewport(pos: Point): Point {
    console.debug(
      '[Island] constrains to vp, make sure UI never visually leave bounding box'
    );
    const pad = ISLAND_CSS.layout.boundaryPad;
    const containerRect = this.container.getBoundingClientRect();
    const width = containerRect.width;
    const height = containerRect.height;

    const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
    const y = Math.min(Math.max(pad, pos.y), window.innerHeight - height - pad);

    return { x, y };
  }
}
