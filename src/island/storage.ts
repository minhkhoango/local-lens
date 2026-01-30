import { STORAGE_KEY } from '../constants';
import { INITIAL_STATE } from './constants';
import {
  ExtensionAction,
  type ExtensionMessage,
  type ShortcutResponse,
} from '../types';
import type { Settings } from './types';

/**
 * Class for talking with chrome.storage.local
 * for loading / settings
 */
export class Storage {
  /**
   * Loading settings from storage.local, if none, use INITIAL_STATE
   */
  public async loadSettings(): Promise<Settings> {
    console.debug('[Island.storage] loadSettings');
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEY]);
      const saved = stored[STORAGE_KEY] as Partial<Settings>;
      return { ...INITIAL_STATE.settings, ...saved };
    } catch (err) {
      console.warn('Failed to load settings:', err);
      return { ...INITIAL_STATE.settings };
    }
  }

  /**
   * Save to storage.local
   * @param settings Current state of auto toggles & language
   */
  public async saveSettings(settings: Settings): Promise<void> {
    console.debug('[Island.storage] saveSettings');
    await chrome.storage.local.set({
      [STORAGE_KEY]: settings,
    });
  }

  /**
   * Get shortcut string by pinging background for chrome.commands privilege
   */
  public async getShortcut(): Promise<string> {
    console.debug('[Island.storage] getShortcut');
    try {
      const response: ShortcutResponse =
        await chrome.runtime.sendMessage<ExtensionMessage>({
          action: ExtensionAction.GET_SHORTCUT,
        });

      return response.shortcut;
    } catch {
      return 'Set shortcut';
    }
  }

  /**
   * New tab to browser://extensions/shortcuts
   */
  public openShortcutsPage(): void {
    chrome.runtime.sendMessage({ action: ExtensionAction.OPEN_SHORTCUTS_PAGE });
  }
}
