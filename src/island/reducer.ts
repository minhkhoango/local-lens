import type {
  Settings,
  ToggleSettings,
  EngineOption,
  IslandStatus,
  ClipboardOutput,
} from '../types';
import type { State } from './types';

export type Action =
  | { type: 'settingsLoaded'; settings: Settings; shortcutText: string }
  | { type: 'firstEngineSwitchLoaded'; value: boolean }
  | { type: 'firstEngineSwitchCompleted' }
  | { type: 'toggleSetting'; key: keyof ToggleSettings }
  | { type: 'setEngine'; engine: EngineOption }
  | { type: 'expandText' }
  | { type: 'setTextExpanded'; value: boolean }
  | { type: 'expandSettings' }
  | { type: 'copySuccess' }
  | { type: 'resetCopied' }
  | { type: 'downloadStatus'; status: IslandStatus }
  | { type: 'ocrProgress'; status: IslandStatus; text: string }
  | { type: 'ocrFinish'; output: ClipboardOutput; textarea: string }
  | { type: 'ocrError'; message: string }
  | { type: 'ocrStartLoading' };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'settingsLoaded':
      return {
        ...state,
        settings: action.settings,
        shortcutText: action.shortcutText,
      };

    case 'firstEngineSwitchLoaded':
      return { ...state, firstEngineSwitch: action.value };

    case 'firstEngineSwitchCompleted':
      return { ...state, firstEngineSwitch: false };

    case 'toggleSetting': {
      const key = action.key;
      const next = !state.settings[key];
      const settings = { ...state.settings, [key]: next };
      // autoCopy turned off => clear the copied flag so UI returns to normal
      const hasCopied =
        key === 'autoCopy' && !next ? false : state.hasCopied;
      return { ...state, settings, hasCopied };
    }

    case 'setEngine':
      return {
        ...state,
        settings: { ...state.settings, engine: action.engine },
      };

    case 'expandText':
      return { ...state, isTextExpanded: !state.isTextExpanded };

    case 'setTextExpanded':
      return { ...state, isTextExpanded: action.value };

    case 'expandSettings':
      return { ...state, isSettingsExpanded: !state.isSettingsExpanded };

    case 'copySuccess':
      return { ...state, hasCopied: true };

    case 'resetCopied':
      return { ...state, hasCopied: false };

    case 'downloadStatus':
      return { ...state, status: action.status };

    case 'ocrProgress':
      return { ...state, status: action.status, textarea: action.text };

    case 'ocrFinish':
      return {
        ...state,
        status: 'done',
        clipboardOutput: action.output,
        textarea: action.textarea,
      };

    case 'ocrError':
      return { ...state, status: 'error', textarea: action.message };

    case 'ocrStartLoading':
      return {
        ...state,
        status: 'loading-model',
        textarea: '',
        hasCopied: false,
      };
  }
}
