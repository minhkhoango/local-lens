import type { SelectSettings, ToggleSettings } from '../types';
import type { TesseractLang } from '../language_map';

/**
 * Hold runtime values of auto-copy, auto-expand, and language
 */
export interface Settings extends ToggleSettings, SelectSettings {}

/**
 * Hold runtime value for all of island's variables
 */
export interface State {
  status: 'loading' | 'success' | 'error';
  text: string;
  imageUrl: string;
  isTextExpanded: boolean;
  isSettingsExpanded: boolean;
  hasCopied: boolean;
  shortcutText: string;
  settings: Settings;
}

/**
 * Action type and payload sent from view -> index for logic handling
 */
export type Action =
  | { type: 'copy' }
  | { type: 'expandSettings' }
  | { type: 'openShortcutSettings' }
  | { type: 'toggleSettings'; payload: keyof ToggleSettings }
  | { type: 'expandText' }
  | { type: 'updateText'; payload: string }
  | { type: 'startDrag'; payload: MouseEvent }
  | { type: 'updateLang'; payload: TesseractLang };
