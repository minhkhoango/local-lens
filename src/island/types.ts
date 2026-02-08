import type {
  EngineOption,
  Settings,
  ToggleSettings,
  TesseractLang,
  IslandStatus,
} from '../types';

/**
 * Hold runtime value for all of island's variables
 */
export interface State {
  status: IslandStatus;
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
  | { type: 'updateLang'; payload: TesseractLang }
  | { type: 'switchEngine'; payload: EngineOption }
  | { type: 'expandText' }
  | { type: 'updateText'; payload: string }
  | { type: 'startDrag'; payload: MouseEvent };
