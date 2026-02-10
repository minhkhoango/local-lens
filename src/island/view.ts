import islandStyles from '../styles/island.css?inline';
import katex from 'katex';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import { ICONS, CLASSES } from './constants';
import { renderMainTemplate } from './template';
import type {
  ToggleSettings,
  Point,
  SelectSettings,
  EngineOption,
  TesseractLang,
} from '../types';
import type { Action, State } from './types';
import { query, queryAll } from './utils';

type ActionHandler = (action: Action) => void;
type RenderMathInElement = (
  element: HTMLElement,
  options: {
    delimiters: Array<{
      left: string;
      right: string;
      display: boolean;
    }>;
    throwOnError: boolean;
  },
) => void;

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
    textarea?: HTMLDivElement; // contenteditable div
    copyBtn?: HTMLButtonElement;
    image?: HTMLImageElement;
    toggles?: NodeListOf<HTMLDivElement>;
    selects?: NodeListOf<HTMLSelectElement>;
  } = {};

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
    this.els.selects = queryAll(this.container, `.${CLASSES.settingsSelect}`);
    this.els.toggles = queryAll(this.container, `.${CLASSES.settingsToggle}`);
  }

  /**
   * Update UI to reflect state
   * @param state current state of island
   * @param width calculated dynamic width based on OCR output
   */
  public update(state: State, width: number): void {
    console.debug(`[Island.view] update, state: ${state}, width: ${width}`);
    if (!this.els.status || !this.els.copyBtn) return;

    const isLoadingModel = state.status === 'loading-model';
    const isRecognizing = state.status === 'recognizing';
    const isSuccess = state.status === 'done';

    this.els.status.className = `${CLASSES.status} ${state.status}`;
    this.els.status.textContent = isLoadingModel
      ? 'Loading model...'
      : isRecognizing
        ? 'Recognizing...'
        : isSuccess
          ? state.hasCopied
            ? 'Copied'
            : 'Extracted'
          : 'Error';

    this.els.copyBtn.className = `${CLASSES.btn} ${CLASSES.copybtn}
                                  ${isLoadingModel || isRecognizing ? CLASSES.loading : ''} 
                                  ${state.hasCopied ? CLASSES.success : ''}`;
    this.els.copyBtn.innerHTML =
      isLoadingModel || isRecognizing
        ? ICONS.spinner
        : state.hasCopied
          ? ICONS.check
          : ICONS.clipboard;
    this.els.copyBtn.disabled = isLoadingModel || isRecognizing;

    // Expand / contract textarea + width
    if (!this.els.preview || !this.els.textarea) return;
    this.container.classList.toggle(CLASSES.expanded, state.isTextExpanded);
    this.container.style.width = `${width}px`;

    if (state.isTextExpanded) {
      this.els.textarea.style.display = 'block';
      if (state.status === 'done') {
        this.els.textarea.innerHTML = state.textarea;
        this.renderMath();
      } else {
        this.els.textarea.textContent = state.textarea;
      }
    } else {
      this.els.textarea.style.display = 'none';
    }

    // Expand / contract settings
    this.container.classList.toggle(
      CLASSES.expandSettings,
      state.isSettingsExpanded,
    );

    // Preview text
    const max = state.isTextExpanded ? 100 : 25;
    this.els.preview.title = state.isTextExpanded ? 'Collapse' : 'Expand';
    this.els.preview.textContent =
      state.textarea.length > max
        ? state.textarea.slice(0, max) + '...'
        : state.textarea;

    // Auto-expand && Auto-copy
    if (!this.els.toggles) return;
    this.els.toggles.forEach((toggle) => {
      const key = toggle.getAttribute('data-key') as keyof ToggleSettings;
      if (key) {
        toggle.classList.toggle(CLASSES.active, state.settings[key]);
      }
    });

    // language && engine
    if (!this.els.selects) return;
    this.els.selects.forEach((select) => {
      const key = select.getAttribute('data-key') as keyof SelectSettings;
      if (key) {
        select.value = state.settings[key];
      }
    });
  }

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
      const toggle = target.closest(`.${CLASSES.settingsToggle}`);
      const key = toggle?.getAttribute('data-key') as
        | keyof ToggleSettings
        | undefined;
      if (key) {
        this.onAction({ type: 'toggleSettings', payload: key });
      }
    });

    // Select Lang / engine Settings
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.classList.contains(CLASSES.settingsSelect)) {
        const key = target.dataset.key as keyof SelectSettings | undefined;
        if (!key) return;

        if (key === 'language') {
          this.onAction({
            type: 'updateLang',
            payload: target.value as TesseractLang,
          });
          return;
        }

        this.onAction({
          type: 'switchEngine',
          payload: target.value as EngineOption,
        });
      }
    });

    this.els.preview?.addEventListener('click', () =>
      this.onAction({ type: 'expandText' }),
    );

    this.container.addEventListener('mousedown', (e) =>
      this.onAction({ type: 'startDrag', payload: e }),
    );
  }

  private renderMath(): void {
    if (!this.els.textarea) return;
    const target = this.els.textarea;

    target.querySelectorAll<HTMLElement>('.formula').forEach((element) => {
      const source = element.textContent;
      try {
        katex.render(source, element, { throwOnError: false });
      } catch (err) {
        console.debug('[Island.view] KaTeX render failed:', err);
      }
    });

    try {
      (renderMathInElement as RenderMathInElement)(target, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    } catch (err) {
      console.debug('[Island.view] KaTeX auto-render failed:', err);
    }
  }
}
