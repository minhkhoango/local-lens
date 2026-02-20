import { INITIAL_STATE, CONFIG } from './constants';
import { RuntimeMessageAction } from '../types';
import type {
  Point,
  RuntimeMessage,
  EngineOption,
  TesseractLang,
  ProgressPayload,
  ResultPayload,
  ErrorPayload,
  Settings,
  DownloadProgress,
} from '../types';
import type { Action, State } from './types';
import { View } from './view';
import { Storage } from './storage';
import { DragController, EventsController } from './behavior';
import { clampToViewport, calculateDynamicWidth } from './utils';

const ID = 'xr-floating-island-host';
/**
 * The draggable pill shaped UI of local-lens
 */
export class FloatingIsland {
  private host: HTMLDivElement;
  private view: View;
  private storage: Storage;
  private dragCtrl?: DragController;
  private eventsCtrl?: EventsController;

  private state: State;
  private position: Point;

  /**
   * Load island settings, UI, positioning, and behavior controllers
   */
  constructor(
    cursorPosition: Point,
    imageUrl: string,
    isPdf: boolean,
    webgpuSupported: boolean,
  ) {
    console.debug('[Island.index] begin constructor');
    this.host = document.createElement('div');
    this.host.id = ID;

    this.state = { ...INITIAL_STATE, imageUrl };
    this.position = clampToViewport(
      cursorPosition,
      CONFIG.widthCollapsed,
      CONFIG.heightCollapsed,
    );

    this.storage = new Storage();
    this.view = new View(this.host, this.handleAction.bind(this));

    this.dragCtrl = new DragController((pos) => this.updatePosition(pos));
    this.eventsCtrl = new EventsController(this.host, isPdf, {
      onDestroy: () => this.destroy(),
      onReposition: (pos) => this.updatePosition(pos),
      getCurrentPosition: () => this.position,
    });

    this.storage.loadSettings().then(async (settings) => {
      this.state.settings = settings;
      this.state.shortcutText = await this.storage.getShortcut();
      await this.view.init(this.state, webgpuSupported);

      this.updatePosition(this.position);
      this.eventsCtrl?.attach();
    });
  }

  // --- Public functions ---
  /**
   * Mount the island if not already
   */
  public mount(): void {
    if (!document.getElementById(ID)) {
      document.documentElement.appendChild(this.host);
    }
  }

  public updateDownload(payload: DownloadProgress): void {
    this.state.status = payload.stage;
    this.view.updateDownloadModel(this.state.status, payload.progress);
  }

  /**
   * Continuously update island with OCR progress from offscreen
   */
  public updateProgress(payload: ProgressPayload): void {
    this.state.status = payload.stage;
    this.state.textarea = payload.text;
    this.view.updateOcrState(this.state);
  }

  /**
   * Show OCR error message to user
   */
  public updateError(payload: ErrorPayload): void {
    this.state.status = 'error';
    this.state.textarea = payload.error;
    this.view.updateOcrState(this.state);
  }

  /** Show rendered HTML result to user, copy to clipboard if enabled */
  public updateFinish(result: ResultPayload): void {
    this.state.status = 'done';
    this.state.clipboardOutput = result.output;
    this.state.textarea = result.output.textHtml;
    if (this.state.settings.autoCopy) this.copyToClipboard();
    this.view.updateOcrState(this.state);
  }

  /**
   * Remove island and its listener
   */
  public async destroy(keepOffscreen = false): Promise<void> {
    console.debug('[Island.index] destroy');
    this.eventsCtrl?.destroy();
    this.dragCtrl?.destroy();
    this.host.remove();

    if (!keepOffscreen) {
      await chrome.runtime.sendMessage<RuntimeMessage>({
        action: RuntimeMessageAction.DESTROY_OFFSCREEN,
      });
    }
  }

  // --- Internal logic ---
  /**
   * Handle user input sent from view.ts
   */
  private handleAction(action: Action): void {
    console.debug('[Island.action] handAction:', action);
    switch (action.type) {
      case 'copy':
        this.copyToClipboard();
        break;
      case 'newCapture':
        this.restartCapture();
        break;
      case 'expandSettings':
        this.toggleSettingsExpand();
        break;
      case 'expandText':
        this.toggleTextareaExpand();
        break;
      case 'startDrag':
        this.dragCtrl?.start(action.payload, this.position);
        break;
      case 'toggleSettings':
        this.toggleSetting(action.payload);
        break;
      case 'updateLang':
        this.changeLanguage(action.payload);
        break;
      case 'switchEngine':
        this.changeEngine(action.payload);
        break;
      case 'openShortcutSettings':
        this.storage.openShortcutsPage();
        break;
    }
  }
  private restartCapture(): void {
    this.destroy(true);
    chrome.runtime.sendMessage<RuntimeMessage>({
      action: RuntimeMessageAction.NEW_CAPTURE,
    });
  }

  private updatePosition(pos: Point): void {
    const constrained = clampToViewport(
      pos,
      this.view.container.clientWidth || CONFIG.widthCollapsed,
      this.view.container.clientHeight || CONFIG.heightCollapsed,
    );
    this.position = constrained;
    this.view.updatePosition(constrained);
  }

  private toggleTextareaExpand(): void {
    this.state.isTextExpanded = !this.state.isTextExpanded;

    const oldWidth =
      parseFloat(this.view.container.style.width) || CONFIG.widthCollapsed;
    const width = this.state.isTextExpanded
      ? calculateDynamicWidth(this.state.textarea)
      : CONFIG.widthCollapsed;

    // Expand to left / collapse to right
    const widthDelta = width - oldWidth;
    if (widthDelta !== 0) {
      this.position.x -= widthDelta;
    }
    this.view.updateTextareaExpand(
      this.state.textarea,
      this.state.isTextExpanded,
      width,
    );
    this.updatePosition(this.position);
  }

  private toggleSettingsExpand(): void {
    this.state.isSettingsExpanded = !this.state.isSettingsExpanded;
    this.view.updateSettingsExpand(this.state.isSettingsExpanded);
    this.updatePosition(this.position);
  }

  private async copyToClipboard(): Promise<void> {
    if (
      !this.state.clipboardOutput.textHtml ||
      !this.state.clipboardOutput.textPlain
    )
      return;
    try {
      const double$Formula = this.state.clipboardOutput.textHtml
        .replace(
          /<div class="formula">([\s\S]*?)<\/div>/g,
          '<div class="formula">$$$$$1$$$$</div>',
        )
        .replace(
          /<span class="formula">([\s\S]*?)<\/span>/g,
          '<span class="formula">$$$$$1$$$$</span>',
        );
      const item = new ClipboardItem({
        'text/plain': new Blob([this.state.clipboardOutput.textPlain], {
          type: 'text/plain',
        }),
        'text/html': new Blob([double$Formula], {
          type: 'text/html',
        }),
      });
      await navigator.clipboard.write([item]);
      this.state.hasCopied = true;
      this.view.updateCopyBtn(this.state.status, this.state.hasCopied);
    } catch (err) {
      if (err instanceof Error && err.message.includes('focus')) {
        console.debug('Auto-copy blocked, wait for user to click');
        return;
      }
      console.error('Clipboard write failed:', err);
    }
  }

  private toggleSetting(key: keyof Settings): void {
    if (key === 'language' || key === 'engine') return;

    this.state.settings[key] = !this.state.settings[key];
    this.storage.saveSettings(this.state.settings);

    if (key === 'autoExpand') {
      if (
        (!this.state.isTextExpanded && this.state.settings[key]) ||
        (this.state.isTextExpanded && !this.state.settings[key])
      ) {
        this.toggleTextareaExpand();
      }
      this.view.updateSettingsToggles(
        this.state.status,
        this.state.settings,
        this.state.hasCopied,
      );
      return;
    }

    // autoCopy toggle
    if (!this.state.hasCopied && this.state.settings[key])
      this.copyToClipboard();
    if (this.state.hasCopied && !this.state.settings[key])
      this.state.hasCopied = false;
    this.view.updateSettingsToggles(
      this.state.status,
      this.state.settings,
      this.state.hasCopied,
    );
  }

  /**
   * All in one update language with complex, inefficient routing
   * index -> bg -> content -> offscreen -> content -> bg -> index
   * @param lang new language
   */
  private async changeLanguage(lang: TesseractLang): Promise<void> {
    this.state.settings.language = lang;
    this.storage.saveSettings(this.state.settings);
    this.view.updateSettingsSelects(this.state.settings);

    if (this.state.settings.engine === 'granite') return;

    const previousText = this.state.textarea;
    this.state.status = 'loading-model';
    this.state.textarea = '';
    this.state.hasCopied = false;
    this.view.updateOcrState(this.state);

    try {
      await chrome.runtime.sendMessage<RuntimeMessage>({
        action: RuntimeMessageAction.BG_PERFORM_OCR,
        payload: {
          engine: 'tesseract',
          language: 'tha', // not used
          croppedImage: '', // not used
        },
      });
    } catch (err) {
      console.error('Language update failed:', err);
      this.state.status = 'error';
      this.state.textarea = previousText;
      this.view.updateOcrState(this.state);
    }
  }

  private async changeEngine(engine: EngineOption): Promise<void> {
    console.log('[Island.index] changeEngine to', engine);
    this.state.settings.engine = engine;
    this.storage.saveSettings(this.state.settings);
    this.view.updateSettingsSelects(this.state.settings);

    const previousText = this.state.textarea;
    this.state.status = 'loading-model';
    this.state.textarea = '';
    this.state.hasCopied = false;
    this.view.updateOcrState(this.state);

    try {
      await chrome.runtime.sendMessage<RuntimeMessage>({
        action: RuntimeMessageAction.BG_PERFORM_OCR,
        payload: {
          engine: engine,
          language: 'tha', // not used
          croppedImage: '', // not used
        },
      });
    } catch (err) {
      console.error('Language update failed:', err);
      this.state.status = 'error';
      this.state.textarea = previousText;
      this.view.updateOcrState(this.state);
    }
  }
}
