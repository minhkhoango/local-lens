import islandStyles from '../styles/island.css?inline';
import { ICONS, CLASSES } from './constants';
import { renderMainTemplate } from './template';
import type { ToggleSettings, Point } from '../types';
import type { Action, State } from './types';
import type { TesseractLang } from '../language_map';
import { query, queryAll } from './utils';

/**
 * Callback to index to handle each action type
 */
type ActionHandler = (action: Action) => void;

/**
 * Class for handling the majority of visual elements of UI.
 * On 'click', 'input', 'change' events, push to index for logic handling
 */
export class View {
  private shadow: ShadowRoot;
  public container: HTMLDivElement;
  private onAction: ActionHandler;

  private els: {
    status?: HTMLSpanElement;
    preview?: HTMLDivElement;
    textarea?: HTMLTextAreaElement;
    copyBtn?: HTMLButtonElement;
    image?: HTMLImageElement;
    toggles?: NodeListOf<HTMLDivElement>;
    langSelect?: HTMLSelectElement;
  } = {};

  /**
   * Creating styled container and attach it to shadow mode 'closed'
   * @param host this.container in index
   * @param onAction Listen to user input and point to handleAction
   */
  constructor(host: HTMLDivElement, onAction: ActionHandler) {
    this.onAction = onAction;
    this.shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = islandStyles;
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = CLASSES.island;
    this.shadow.appendChild(this.container);
  }

  /**
   * Render HTML of island && bind listeners
   * @param state INITIAL_STATE && saved settings
   */
  public init(state: State): void {
    this.container.innerHTML = renderMainTemplate(state);
    this.cacheRefs();
    this.bindInternalEvents();
  }

  private cacheRefs(): void {
    this.els.status = query(this.container, `.${CLASSES.status}`);
    this.els.preview = query(this.container, `.${CLASSES.preview}`);
    this.els.textarea = query(this.container, `.${CLASSES.textarea}`);
    this.els.copyBtn = query(this.container, `.${CLASSES.copybtn}`);
    this.els.image = query(this.container, `.${CLASSES.image}`);
    this.els.langSelect = query(this.container, `.${CLASSES.settingsSelect}`);
    this.els.toggles = queryAll(this.container, `.${CLASSES.toggle}`);
  }

  /**
   * Update UI to reflect state, including:
   * - status, text, copyBtn, toggle / lang settings options,
   * - expand / contract textarea and setting panels
   * @param state current state of island
   * @param width calculated dynamic width based on OCR output
   */
  public update(state: State, width: number): void {
    console.debug(`[Island.view] update, state: ${state}, width: ${width}`);
    if (!this.els.status || !this.els.copyBtn) return;

    const isLoading = state.status === 'loading';
    const isSuccess = state.status === 'success';

    this.els.status.className = `${CLASSES.status} ${state.status}`;
    this.els.status.textContent = isLoading
      ? chrome.i18n.getMessage('ui_processing')
      : isSuccess
        ? state.hasCopied
          ? chrome.i18n.getMessage('ui_copied')
          : chrome.i18n.getMessage('ui_extracted')
        : chrome.i18n.getMessage('ui_error');

    // Copy button logic
    this.els.copyBtn.className = `${CLASSES.btn} ${CLASSES.copybtn}
                                  ${isLoading ? CLASSES.loading : ''} 
                                  ${state.hasCopied ? CLASSES.success : ''}`;
    this.els.copyBtn.innerHTML = isLoading
      ? ICONS.spinner
      : state.hasCopied
        ? ICONS.check
        : ICONS.clipboard;
    this.els.copyBtn.disabled = isLoading;

    // Expand / contract textarea + width
    if (!this.els.preview || !this.els.textarea) return;
    this.container.classList.toggle(CLASSES.expanded, state.isTextExpanded);
    this.container.style.width = `${width}px`;

    this.els.textarea.value = state.text;
    this.els.textarea.style.display = state.isTextExpanded ? 'block' : 'none';
    if (state.isTextExpanded) this.els.textarea.focus();

    // Expand / contract settings
    this.container.classList.toggle(
      CLASSES.expandSettings,
      state.isSettingsExpanded,
    );

    // Preview text
    const max = state.isTextExpanded ? 100 : 25;
    this.els.preview.title = state.isTextExpanded
      ? chrome.i18n.getMessage('hint_collapse')
      : chrome.i18n.getMessage('hint_expand');
    this.els.preview.textContent =
      state.text.length > max ? state.text.slice(0, max) + '...' : state.text;

    // Auto-expand && Auto-copy
    if (!this.els.toggles) return;
    this.els.toggles.forEach((toggle) => {
      const key = toggle.getAttribute('data-key') as keyof ToggleSettings;
      if (key) {
        toggle.classList.toggle(CLASSES.active, state.settings[key]);
      }
    });

    // Lang select
    if (!this.els.langSelect) return;
    if (this.els.langSelect.value != state.settings.language) {
      this.els.langSelect.value = state.settings.language;
    }
  }

  /**
   * Update floating island to new specified Point
   * @param pos New position
   */
  public updatePosition(pos: Point): void {
    this.container.style.left = `${pos.x}px`;
    this.container.style.top = `${pos.y}px`;
  }

  /**
   * Listen to 'click', 'change', 'input', 'mousedown', then call
   * this.onAction with type & payload?, which callback to island/index
   */
  private bindInternalEvents(): void {
    console.debug('[Island.view] bindInternalEvents');
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // copy, settings, Shift+Alt+S btns
      const btn = target.closest('button');
      if (btn?.dataset.action) {
        const actionType = btn.dataset.action as
          | 'copy'
          | 'expandSettings'
          | 'openShortcutSettings';
        this.onAction({ type: actionType });
        return;
      }

      // Auto-copy/expand toggles Settings
      const toggle = target.closest(`.${CLASSES.toggle}`);
      const key = toggle?.getAttribute('data-key') as keyof ToggleSettings;
      if (key) {
        this.onAction({ type: 'toggleSettings', payload: key });
      }
    });

    // Select Lang Settings
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.classList.contains(CLASSES.settingsSelect)) {
        this.onAction({
          type: 'updateLang',
          payload: target.value as TesseractLang,
        });
      }
    });

    // User edit textarea, remove "Copied!"
    this.els.textarea?.addEventListener('input', (e) =>
      this.onAction({
        type: 'updateText',
        payload: (e.target as HTMLTextAreaElement).value,
      }),
    );

    // Preview Click -> expand / contract
    this.els.preview?.addEventListener('click', () =>
      this.onAction({ type: 'expandText' }),
    );

    this.container.addEventListener('mousedown', (e) =>
      this.onAction({ type: 'startDrag', payload: e }),
    );
  }
}
