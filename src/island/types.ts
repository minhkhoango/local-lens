import type { Settings, IslandStatus, ClipboardOutput } from '../types';

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
