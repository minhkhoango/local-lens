import { ISLAND_STORAGE } from '../constants';
import { INITIAL_STATE } from './constants';
import {
  RuntimeMessageAction,
  type RuntimeMessage,
  type ShortcutResponse,
} from '../types';
import type { Settings } from '../types';

/** Class for talking with chrome.storage.local for loading / settings */
export class Storage {
  /** Loading settings from storage.local, use INITIAL_STATE if none */
  public async loadSettings(): Promise<Settings> {
    console.debug('[Island.storage] loadSettings');
    try {
      const stored = await chrome.storage.local.get([ISLAND_STORAGE]);
      const saved = stored[ISLAND_STORAGE] as Partial<Settings>;
      return { ...INITIAL_STATE.settings, ...saved };
    } catch (err) {
      console.warn('Failed to load settings:', err);
      return { ...INITIAL_STATE.settings };
    }
  }

  /** Save to storage.local */
  public async saveSettings(settings: Settings): Promise<void> {
    console.debug('[Island.storage] saveSettings');
    await chrome.storage.local.set({
      [ISLAND_STORAGE]: settings,
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
