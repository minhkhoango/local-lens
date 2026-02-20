import islandStyles from '../styles/island.css?inline';
import katex from 'katex';
import { ICONS, CLASS } from './constants';
import { renderMainTemplate } from './template';
import type {
  ToggleSettings,
  Point,
  SelectSettings,
  EngineOption,
  TesseractLang,
  IslandStatus,
} from '../types';
import type { Action, State } from './types';
import { query, queryAll } from './utils';

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
    textarea?: HTMLDivElement;
    copyBtn?: HTMLButtonElement;
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
    this.container.className = 'island';
    this.shadow.appendChild(this.container);
  }

  /**
   * Render HTML of island && bind listeners
   */
  public init(state: State, webgpuSupported: boolean): void {
    this.container.innerHTML = renderMainTemplate(state, webgpuSupported);
    this.cacheRefs();
    this.bindInternalEvents();
    this.updateTextareaExpand(state.textarea, state.isTextExpanded, 330);
  }

  private cacheRefs(): void {
    this.els.status = query(this.container, `.${CLASS.MAIN.status}`);
    this.els.preview = query(this.container, `.${CLASS.MAIN.preview}`);
    this.els.textarea = query(this.container, `.${CLASS.MAIN.textarea}`);
    this.els.copyBtn = query(this.container, `.${CLASS.BTN.copy}`);
    this.els.selects = queryAll(this.container, `.${CLASS.SETTINGS.select}`);
    this.els.toggles = queryAll(this.container, `.${CLASS.SETTINGS.toggle}`);
  }

  public updateDownloadModel(status: IslandStatus, progress: number): void {
    this.updateStatus(status, false, progress);
  }
  /**
   * Update UI 'loading-model' | 'recognizing' | 'error' | 'finish' status
   */
  public updateOcrState(state: State): void {
    this.updateStatus(state.status, state.hasCopied);
    this.updateCopyBtn(state.status, state.hasCopied);
    this.updatePreviewText(state.textarea, state.isTextExpanded);
    this.updateTextareaContent(state.status, state.textarea);
  }

  public updatePosition(pos: Point): void {
    this.container.style.left = `${pos.x}px`;
    this.container.style.top = `${pos.y}px`;
  }

  public updateTextareaExpand(
    text: string,
    isTextExpanded: boolean,
    width: number,
  ): void {
    if (!this.els.textarea) return;
    this.container.classList.toggle(CLASS.STATE.textExpanded, isTextExpanded);
    this.container.style.width = `${width}px`;
    if (!isTextExpanded) {
      this.els.textarea.style.display = 'none';
      return;
    }
    this.els.textarea.style.display = 'block';
    this.updatePreviewText(text, isTextExpanded);
  }

  public updateSettingsExpand(isSettingsExpanded: boolean): void {
    this.container.classList.toggle(
      CLASS.STATE.settingsExpanded,
      isSettingsExpanded,
    );
  }

  public updateCopyBtn(status: IslandStatus, hasCopied: boolean): void {
    if (!this.els.copyBtn) return;
    if (status === 'loading-model' || status === 'recognizing') {
      if (this.els.copyBtn.className.includes(CLASS.STATE.copyLoading)) return;
      this.els.copyBtn.className = `${CLASS.BTN.btn} ${CLASS.BTN.copy} ${CLASS.STATE.copyLoading}`;
      this.els.copyBtn.innerHTML = ICONS.spinner;
      this.els.copyBtn.disabled = true;
      return;
    }
    // status is 'done' or 'error'
    this.els.copyBtn.className = `${CLASS.BTN.btn} ${CLASS.BTN.copy} ${hasCopied ? CLASS.STATE.copySuccess : ''}`;
    this.els.copyBtn.innerHTML = hasCopied ? ICONS.check : ICONS.clipboard;
    this.els.copyBtn.disabled = false;
    this.updateStatus(status, hasCopied);
  }

  public updateSettingsToggles(
    status: IslandStatus,
    settings: ToggleSettings,
    hasCopied: boolean,
  ): void {
    if (!this.els.toggles) return;
    this.els.toggles.forEach((toggle) => {
      const key = toggle.getAttribute('data-key') as keyof ToggleSettings;
      if (key) {
        toggle.classList.toggle(CLASS.STATE.toggleActive, settings[key]);
      }
    });
    this.updateStatus(status, hasCopied);
    this.updateCopyBtn(status, hasCopied);
  }

  public updateSettingsSelects(settings: SelectSettings): void {
    if (!this.els.selects) return;
    this.els.selects.forEach((select) => {
      const key = select.getAttribute('data-key') as keyof SelectSettings;
      if (key) {
        select.value = settings[key];
      }
    });
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
          | 'newCapture'
          | 'expandSettings'
          | 'openShortcutSettings';
        this.onAction({ type: actionType });
        return;
      }

      // Auto-copy/expand toggles Settings
      const toggle = target.closest(`.${CLASS.SETTINGS.toggle}`);
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
      if (target.classList.contains(CLASS.SETTINGS.select)) {
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

  private updateStatus(
    status: IslandStatus,
    hasCopied: boolean,
    progress?: number,
  ): void {
    if (!this.els.status) return;
    this.els.status.className = `${CLASS.MAIN.status} ${status}`;

    if (status === 'downloading') {
      if (progress === undefined) {
        this.els.status.textContent = 'Downloading...';
        return;
      }
      this.els.status.textContent = `Downloading ${progress}%`;
      return;
    }
    if (status === 'loading-model') {
      this.els.status.textContent = 'Loading model...';
      return;
    }
    if (status === 'recognizing') {
      this.els.status.textContent = 'Recognizing...';
      return;
    }
    if (status === 'error') {
      this.els.status.textContent = 'Error';
      return;
    }
    if (hasCopied) {
      this.els.status.textContent = 'Copied';
      return;
    }
    this.els.status.textContent = 'Extracted';
  }
  private updatePreviewText(text: string, isTextExpanded: boolean): void {
    if (!this.els.preview) return;

    const max = isTextExpanded ? 100 : 25;
    if (this.els.preview.textContent.length > max && text.length > max) return;

    this.els.preview.title = isTextExpanded ? 'Collapse' : 'Expand';
    this.els.preview.textContent =
      text.length > max ? text.slice(0, max) + '...' : text;
  }
  private updateTextareaContent(status: IslandStatus, text: string): void {
    if (!this.els.textarea) return;
    if (status !== 'done') {
      this.els.textarea.textContent = text;
      return;
    }
    this.els.textarea.innerHTML = text;
    this.renderMath();
  }
  private renderMath(): void {
    if (!this.els.textarea) return;
    const mathElements = queryAll(this.els.textarea, '.formula');
    if (mathElements.length === 0) return;

    mathElements.forEach((element) => {
      try {
        element.innerHTML = katex.renderToString(element.textContent, {
          output: 'mathml',
        });
      } catch (err) {
        console.debug('[Island.view] KaTeX render failed:', err);
      }
    });
  }
}
