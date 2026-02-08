import { INITIAL_STATE, CONFIG } from './constants';
import { RuntimeMessageAction } from '../types';
import type {
  Point,
  RuntimeMessage,
  EngineOption,
  TesseractLang,
  TabsConnectMessage,
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
  constructor(cursorPosition: Point, imageUrl: string, isPdf: boolean) {
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
      this.view.init(this.state);
      this.updateView();
      this.eventsCtrl?.attach();
    });
  }

  // --- Public functions ---

  /**
   * Continuously update island with OCR progress from offscreen
   */
  public updateOcrProgress(payload: TabsConnectMessage): void {
    this.state.status = payload.stage;
    this.state.text = payload.text;
    if (this.state.status === 'done') {
      if (this.state.settings.autoExpand) this.state.isTextExpanded = true;
      if (this.state.settings.autoCopy) this.copyToClipboard();
    }
    this.updateView();
  }

  /**
   * Mount the island if not already
   */
  public mount(): void {
    if (!document.getElementById(ID)) {
      document.documentElement.appendChild(this.host);
    }
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
      case 'expandSettings':
        this.toggleSettingsExpand();
        break;
      case 'expandText':
        this.toggleTextExpand();
        break;
      case 'updateText':
        this.state.text = action.payload;
        this.state.hasCopied = false;
        this.updateView();
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

  /**
   * The general updateUI, calculate dynamic width
   * then call view.update to update floating island -> update position
   */
  private updateView(): void {
    console.debug('[Island.index] updateView, position:', this.position);
    const oldWidth =
      parseFloat(this.view.container.style.width) || CONFIG.widthCollapsed;
    const width = this.state.isTextExpanded
      ? calculateDynamicWidth(this.state.text)
      : CONFIG.widthCollapsed;

    // Expand to left / collapse to right
    const widthDelta = width - oldWidth;
    if (widthDelta !== 0) {
      this.position.x -= widthDelta;
    }

    this.view.update(this.state, width);
    this.updatePosition(this.position);
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

  private toggleTextExpand(): void {
    this.state.isTextExpanded = !this.state.isTextExpanded;
    this.updateView();
    this.updatePosition(this.position);
  }

  private toggleSettingsExpand(): void {
    this.state.isSettingsExpanded = !this.state.isSettingsExpanded;
    this.updateView();
    this.updatePosition(this.position);
  }

  private async copyToClipboard(): Promise<void> {
    if (!this.state.text) return;
    try {
      await navigator.clipboard.writeText(this.state.text);
      this.state.hasCopied = true;
      this.updateView();
    } catch (err) {
      if (err instanceof Error && err.message.includes('focus')) {
        console.debug('Auto-copy blocked, wait for user to click');
        return;
      }
      console.error('Clipboard write failed:', err);
    }
  }

  private toggleSetting(key: keyof State['settings']): void {
    if (key === 'language' || key === 'engine') return;

    this.state.settings[key] = !this.state.settings[key];
    this.storage.saveSettings(this.state.settings);

    if (key === 'autoExpand') {
      if (
        (!this.state.isTextExpanded && this.state.settings[key]) ||
        (this.state.isTextExpanded && !this.state.settings[key])
      ) {
        this.toggleTextExpand();
        return;
      }
      this.updateView();
      return;
    }

    if (!this.state.hasCopied && this.state.settings[key])
      this.copyToClipboard();
    if (this.state.hasCopied && !this.state.settings[key])
      this.state.hasCopied = false;
    this.updateView();
  }

  /**
   * All in one update language with complex, inefficient routing
   * index -> bg -> content -> offscreen -> content -> bg -> index
   * @param lang new language
   */
  private async changeLanguage(lang: TesseractLang): Promise<void> {
    this.state.settings.language = lang;
    this.storage.saveSettings(this.state.settings);

    if (this.state.settings.engine === 'granite') return;

    const previousText = this.state.text;
    this.state.status = 'loading-model';
    this.state.text = '';
    this.state.hasCopied = false;
    this.updateView();

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
      this.state.text = previousText;
      this.updateView();
    }
  }

  private async changeEngine(engine: EngineOption): Promise<void> {
    console.log('[Island.index] changeEngine to', engine);
    this.state.settings.engine = engine;
    this.storage.saveSettings(this.state.settings);

    const previousText = this.state.text;
    this.state.status = 'loading-model';
    this.state.text = '';
    this.state.hasCopied = false;
    this.updateView();

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
      this.state.text = previousText;
      this.updateView();
    }
  }
}
