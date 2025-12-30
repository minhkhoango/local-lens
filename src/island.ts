import {
  IDS,
  CLASSES,
  ISLAND_STYLES,
  ICONS,
  CONFIG,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  ISLAND_CSS_VARS,
  SETTINGS_CONFIG,
} from './constants';
import {
  ExtensionAction,
  type Point,
  type IslandSettings,
  type OcrResultPayload,
  type IslandState,
  type SettingsConfigItem,
  type ButtonConfigItem,
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
  private showNotification = false;
  private notificationMessage = '';

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

  constructor(cursorPosition: Point, imageUrl = '', notificationMessage = '') {
    this.imageUrl = imageUrl;
    this.notificationMessage = notificationMessage;
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
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.ISLAND_SETTINGS,
        STORAGE_KEYS.SHORTCUT_HINT_SHOWN,
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

      // Show notification if not already shown and message provided
      const hintShown = stored[STORAGE_KEYS.SHORTCUT_HINT_SHOWN] as
        | boolean
        | undefined;
      if (!hintShown && this.notificationMessage) {
        this.showNotification = true;
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
    this.container.className = `${CLASSES.island} ${CLASSES.entering} ${this.showNotification ? CLASSES.notificationShow : ''}`;
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
    this.els.settingsPanel = query(this.container, `.${CLASSES.settings}`);
    this.els.notification = query(this.container, `.${CLASSES.notification}`);
    this.els.notificationClose = query(
      this.container,
      `.${CLASSES.notificationClose}`
    );

    this.bindEvents();
    this.updateUI();
  }

  private renderTemplate(): string {
    return `
      <div class="${CLASSES.notification}">
        <span class="${CLASSES.notificationText}">${this.notificationMessage}</span>
        <button class="${CLASSES.notificationClose}" aria-label="Close">${ICONS.close}</button>
      </div>
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

  private getToggleClass(key: keyof IslandSettings): string {
    return `${CLASSES.toggle} ${this.settings[key] ? CLASSES.active : ''}`;
  }

  private isToggleConfig(
    config: SettingsConfigItem | ButtonConfigItem
  ): config is SettingsConfigItem {
    return 'key' in config;
  }

  private renderSettingsRows(): string {
    return SETTINGS_CONFIG.map((config) => {
      if (this.isToggleConfig(config)) {
        // Render toggle setting
        return `
          <div class="setting-row">
            <span>${config.label}</span>
            <div class="${this.getToggleClass(config.key)}" data-key="${config.key}"></div>
          </div>`;
      } else {
        // Render button setting
        return `
          <div class="setting-row">
            <span>${config.label}</span>
            <button class="${CLASSES.settingsActionBtn}" data-action="${config.action}">
              Alt + Shift + S
            </button>
          </div>`;
      }
    }).join('');
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

      // Reposition after settings panel changes widget size
      this.position = this.constrainToViewport(this.position);
      this.updatePosition();
    });

    // Notification close button
    this.els.notificationClose?.addEventListener('click', () => {
      this.dismissNotification();
    });

    this.els.settingsPanel?.addEventListener('click', (e) => {
      // Handle toggle clicks
      const toggle = (e.target as HTMLElement).closest(`.${CLASSES.toggle}`);
      if (toggle) {
        const key = toggle.getAttribute('data-key') as keyof IslandSettings;
        if (!key) return;

        this.settings[key] = !this.settings[key];
        toggle.classList.toggle(CLASSES.active, this.settings[key]);
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
          chrome.runtime.sendMessage({
            action: ExtensionAction.OPEN_SHORTCUTS_PAGE,
          });
        }
      }
    });
  }

  private dismissNotification(): void {
    this.showNotification = false;
    this.container.classList.remove(CLASSES.notificationShow);
    // Mark as shown so it won't appear again [OFF FOR TESTING]
    // chrome.storage.local.set({
    //   [STORAGE_KEYS.SHORTCUT_HINT_SHOWN]: true,
    // });
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

    // Account for notification height if it will be shown
    const notificationOffset = this.showNotification
      ? ISLAND_CSS_VARS.layout.notificationHeight +
        ISLAND_CSS_VARS.layout.notificationGap
      : 0;

    const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
    const y = Math.min(
      Math.max(pad + notificationOffset, pos.y),
      window.innerHeight - height - pad
    );
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
