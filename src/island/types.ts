import type {
  EngineOption,
  Settings,
  ToggleSettings,
  TesseractLang,
  IslandStatus,
  ClipboardOutput,
} from '../types';

/**
 * Hold runtime value for all of island's variables
 */
export interface State {
  // Rarely changing values
  firstEngineSwitch: boolean;
  shortcutText: string;
  isPdf: boolean;
  webgpuSupported: boolean;
  // Dynamic values
  status: IslandStatus;
  textarea: string;
  clipboardOutput: ClipboardOutput;
  imageUrl: string;
  isTextExpanded: boolean;
  isSettingsExpanded: boolean;
  hasCopied: boolean;
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
  | { type: 'startDrag'; payload: MouseEvent };
