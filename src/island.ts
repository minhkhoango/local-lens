import {
  IDS,
  CLASSES,
  ISLAND_STYLES,
  ICONS,
  CONFIG,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  ISLAND_CSS_VARS,
} from './constants';
import type {
  Point,
  IslandSettings,
  OcrResultPayload,
  IslandState,
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

  // Element Refs
  private els: {
    status?: HTMLSpanElement;
    preview?: HTMLDivElement;
    textarea?: HTMLTextAreaElement;
    copyBtn?: HTMLButtonElement;
    image?: HTMLImageElement;
    settingsBtn?: HTMLButtonElement;
    toggle?: HTMLDivElement;
  } = {};

  // Drag state
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };

  constructor(cursorPosition: Point, imageUrl = '') {
    this.imageUrl = imageUrl;
    this.position = this.clampToViewport(cursorPosition);

    this.host = document.createElement('div');
    this.host.id = IDS.ISLAND;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.container = document.createElement('div');

    this.loadSettings().then(() => this.build());
  }

  // --- Public Methods ---
  public updateWithResult(payload: OcrResultPayload): void {
    this.state = payload.success ? 'success' : 'error';
    this.text = payload.text;
    if (payload.croppedImageUrl) this.imageUrl = payload.croppedImageUrl;

    this.updateUI();

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
      document.documentElement.appendChild(this.host);
    }
  }

  public destroy(): void {
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
    document.removeEventListener('click', this.handleClickOutside);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
  }

  // --- Private Methods ---
  private async loadSettings(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(
        STORAGE_KEYS.ISLAND_SETTINGS
      );
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
    // Inject styles
    const style = document.createElement('style');
    style.textContent = ISLAND_STYLES;
    this.shadow.appendChild(style);

    // Build container
    this.container.className = `${CLASSES.island} ${CLASSES.entering}`;
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
    this.els.settingsBtn = query(this.container, `.${CLASSES.settingsbtn}`);
    this.els.toggle = query(this.container, `.${CLASSES.toggle}`);

    this.bindEvents();
    this.updateUI();
  }

  private renderTemplate(): string {
    return `
      <div class="${CLASSES.row}">
        <img class="${CLASSES.image}" src="${this.imageUrl}" alt="Captured region"/>
        <div class="${CLASSES.content}">
          <span class="${CLASSES.status}">Processing...</span>
          <div class="${CLASSES.preview}" title="Click to expand"></div>
        </div>
        <div class="${CLASSES.actions}">
          <button class="${CLASSES.btn} ${CLASSES.copybtn} ${CLASSES.loading}">${ICONS.spinner}</button>
          <button class="${CLASSES.btn} ${CLASSES.settingsbtn}">${ICONS.settings}</button>
        </div>
      </div>
      <textarea class="${CLASSES.textarea}"></textarea>
      <div class="${CLASSES.settings}">
        <div class="setting-row">
          <span>Auto-copy</span>
          <div class="${CLASSES.toggle} ${this.settings.autoCopy ? CLASSES.active : ''}" data-key="autoCopy"></div>
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

    // Wiggle on error
    if (this.state === 'error') {
      this.container.classList.add(CLASSES.wiggle);
      setTimeout(
        () => this.container.classList.remove(CLASSES.wiggle),
        CONFIG.WIGGLE_TIME
      );
    }
  }

  // --- Logic & Events ---

  private bindEvents(): void {
    this.container.addEventListener('mousedown', this.handleDragStart);
    document.addEventListener('click', this.handleClickOutside);
    window.addEventListener('keydown', this.handleKeyDown);

    this.els.preview?.addEventListener('click', () => this.toggleExpand());
    this.els.copyBtn?.addEventListener('click', () => this.copyToClipboard());
    this.els.textarea?.addEventListener('input', (e) => {
      this.text = (e.target as HTMLTextAreaElement).value;
      this.hasCopied = false;
      this.updateUI();
    });
    this.els.settingsBtn?.addEventListener('click', () => {
      this.container.classList.toggle(CLASSES.settingsShow);
      if (!this.isExpanded) this.toggleExpand(true);

      // Reposition after settings panel changes widget size
      this.position = this.constrainToViewport(this.position);
      this.updatePosition();
    });
    this.els.toggle?.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      this.settings.autoCopy = !this.settings.autoCopy;
      el.classList.toggle(CLASSES.active, this.settings.autoCopy);
      chrome.storage.local.set({
        [STORAGE_KEYS.ISLAND_SETTINGS]: this.settings,
      });
    });
  }

  private toggleExpand(force?: boolean): void {
    if (this.state === 'loading') return;

    const wasExpanded = this.isExpanded;
    this.isExpanded = force ?? !this.isExpanded;
    if (wasExpanded === this.isExpanded) return;

    // Expand/collapse to the left
    if (ISLAND_CSS_VARS.layout.expandToLeft) {
      const widthDiff =
        ISLAND_CSS_VARS.layout.widthExpanded -
        ISLAND_CSS_VARS.layout.widthCollapsed;
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
    if (!this.text) return;

    try {
      await navigator.clipboard.writeText(this.text);
      this.hasCopied = true;
      this.updateUI();
      // Auto clean up after copy
      setTimeout(() => this.destroy(), CONFIG.WAIT_TIME_AFTER_COPY);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  }

  private updatePosition(): void {
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  // --- Dragging ---
  private handleDragStart = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        `.${CLASSES.btn}, .${CLASSES.toggle}, .${CLASSES.textarea}, .${CLASSES.preview}`
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
    if (!this.isDragging) return;
    this.position = this.constrainToViewport({
      x: e.clientX - this.dragOffset.x,
      y: e.clientY - this.dragOffset.y,
    });
    this.updatePosition();
  };

  private handleDragEnd = (): void => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  private handleClickOutside = (e: MouseEvent): void => {
    if (!this.host.contains(e.target as Node)) this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.destroy();
  };

  private clampToViewport(pos: Point): Point {
    const width = ISLAND_CSS_VARS.layout.widthCollapsed;
    const height = ISLAND_CSS_VARS.layout.heightCollapsed;
    const pad = ISLAND_CSS_VARS.layout.padding;

    const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
    const y = Math.min(Math.max(pad, pos.y), window.innerHeight - height - pad);
    return { x, y };
  }

  private constrainToViewport(pos: Point): Point {
    const padding = ISLAND_CSS_VARS.layout.padding;
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
