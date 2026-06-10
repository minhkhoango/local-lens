import { ISLAND_STORAGE } from '../constants';
import { INITIAL_STATE } from './constants';
import {
  RuntimeMessageAction,
  toEngineOption,
  type RuntimeMessage,
  type ShortcutResponse,
} from '../types';
import type { Settings } from '../types';

const FIRST_ENGINE_SWITCH = 'firstEngineSwitch';

/** Class for talking with chrome.storage.local for loading / settings */
export class Storage {
  /** Loading settings from storage.local, use INITIAL_STATE if none */
  public async loadSettings(): Promise<Settings> {
    console.debug('[Island.storage] loadSettings');
    try {
      const stored = await chrome.storage.local.get([ISLAND_STORAGE]);
      const saved = stored[ISLAND_STORAGE] as Partial<Settings> | undefined;
      const settings = { ...INITIAL_STATE.settings, ...saved };
      // Storage may hold engine values from older versions (e.g. the removed
      // 'tesseract'); coerce so the switcher and OCR flow stay in sync.
      settings.engine = toEngineOption(settings.engine);
      return settings;
    } catch (err) {
      console.warn('Failed to load settings:', err);
      return { ...INITIAL_STATE.settings };
    }
  }

  /** Check if the first time user download thinking engine */
  public async isFirstEngineSwitch(): Promise<boolean> {
    console.debug('[Island.storage] isFirstEngineSwitch');
    try {
      const stored = await chrome.storage.local.get([FIRST_ENGINE_SWITCH]);
      const saved = stored[FIRST_ENGINE_SWITCH] as boolean | undefined;
      if (saved === false) return false;
      return true;
    } catch (err) {
      console.warn('Failed to load firstEngineSwitch:', err);
      return INITIAL_STATE.firstEngineSwitch;
    }
  }

  /** Save to storage.local */
  public async saveSettings(settings: Settings): Promise<void> {
    console.debug('[Island.storage] saveSettings');
    await chrome.storage.local.set({
      [ISLAND_STORAGE]: settings,
    });
  }

  public async firstEngineSwitchCompleted(): Promise<void> {
    console.debug('[Island.storage] firstEngineSwitchCompleted');
    await chrome.storage.local.set({
      [FIRST_ENGINE_SWITCH]: false,
    });
  }

  /** Get shortcut string by pinging bg for chrome.commands privilege */
  public async getShortcut(): Promise<string> {
    console.debug('[Island.storage] getShortcut');
    try {
      const response: ShortcutResponse =
        await chrome.runtime.sendMessage<RuntimeMessage>({
          action: RuntimeMessageAction.GET_SHORTCUT,
        });

      return response.shortcut;
    } catch {
      return INITIAL_STATE.shortcutText;
    }
  }

  /** New tab to browser://extensions/shortcuts */
  public openShortcutsPage(): void {
    chrome.runtime.sendMessage({
      action: RuntimeMessageAction.OPEN_SHORTCUTS_PAGE,
    });
  }
}
