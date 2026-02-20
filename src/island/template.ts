import { ICONS, CLASS } from './constants';
import type {
  SelectSettings,
  ToggleSettings,
  EngineOption,
  TesseractLang,
} from '../types';
import type { State } from './types';

export const LANGUAGE_OPTIONS: Record<TesseractLang, string> = {
  ara: 'Arabic',
  ben: 'Bengali',
  bul: 'Bulgarian',
  cat: 'Catalan',
  ces: 'Czech',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  dan: 'Danish',
  deu: 'German',
  ell: 'Greek',
  eng: 'English',
  fin: 'Finnish',
  fra: 'French',
  heb: 'Hebrew',
  hin: 'Hindi',
  hun: 'Hungarian',
  ind: 'Indonesian',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  nld: 'Dutch',
  nor: 'Norwegian',
  pol: 'Polish',
  por: 'Portuguese',
  ron: 'Romanian',
  rus: 'Russian',
  spa: 'Spanish',
  swe: 'Swedish',
  tha: 'Thai',
  tur: 'Turkish',
  ukr: 'Ukrainian',
  vie: 'Vietnamese',
} as const;

const ENGINE_OPTIONS: Record<EngineOption, string> = {
  tesseract: 'Fast',
  granite: 'Thinking',
};

interface ToggleSettingsConfig {
  key: keyof ToggleSettings;
  labelKey: 'Auto-Copy' | 'Auto-Expand';
  type: 'toggle';
}

interface SelectSettingsConfig {
  key: keyof SelectSettings;
  labelKey: 'Language' | 'Engine';
  type: 'select';
  options: Record<TesseractLang, string> | Record<EngineOption, string>;
}

type SettingsConfig = ToggleSettingsConfig | SelectSettingsConfig;

const SELECT_SETTINGS: SelectSettingsConfig[] = [
  {
    key: 'engine',
    labelKey: 'Engine',
    type: 'select',
    options: ENGINE_OPTIONS,
  },
  {
    key: 'language',
    labelKey: 'Language',
    type: 'select',
    options: LANGUAGE_OPTIONS,
  },
];

const TOGGLE_SETTINGS: ToggleSettingsConfig[] = [
  { key: 'autoCopy', labelKey: 'Auto-Copy', type: 'toggle' },
  { key: 'autoExpand', labelKey: 'Auto-Expand', type: 'toggle' },
];

const SETTINGS_CONFIG: SettingsConfig[] = [
  ...SELECT_SETTINGS,
  ...TOGGLE_SETTINGS,
];

/**
 * Helper function to render the settings options
 */
function renderSettingsRows(state: State): string {
  const rows = SETTINGS_CONFIG.map((config) => {
    if (config.type === 'select') {
      const currentVal = state.settings[config.key];
      const optionsHtml = Object.entries(config.options)
        .map(([value, display]) => {
          const isSelected = value === currentVal ? 'selected' : '';
          return `<option value="${value}" ${isSelected}>${display}</option>`;
        })
        .join('');

      return `
            <div class="settings-row">
            <span>${config.labelKey}</span>
            <div class="select-wrapper">
                <select class="${CLASS.SETTINGS.select}" data-key="${config.key}">
                ${optionsHtml}
                </select>
                <div class="select-icon">${ICONS.dropdown}</div>
            </div>
            </div>`;
    }

    if (config.type === 'toggle') {
      const isActive = state.settings[config.key];
      const toggleClass = `${CLASS.SETTINGS.toggle} ${isActive ? CLASS.STATE.toggleActive : ''}`;
      return `
            <div class="settings-row">
            <span>${config.labelKey}</span>
            <div class="${toggleClass}" data-key="${config.key}"></div>
            </div>`;
    }
    return '';
  }).join('');

  const shortcutRow = `
      <div class="settings-row">
        <span>Set shortcut</span>
        <button class="${CLASS.BTN.shortcut}" data-action="openShortcutSettings">
          ${state.shortcutText}
        </button>
      </div>`;

  return rows + shortcutRow;
}

/**
 * Helper function to initialize the floatingIsland's main HTML
 */
export function renderMainTemplate(state: State): string {
  return `
    <div class="row">
      <img class="image" src="${state.imageUrl}" alt="Captured region"/>
      <div class="content">
        <span class="${CLASS.MAIN.status}">Loading model...</span>
        <div class="${CLASS.MAIN.preview}"></div>
      </div>
      <div class="actions">
        <button class="${CLASS.BTN.btn} ${CLASS.BTN.copy} ${CLASS.STATE.copyLoading}" title="Copy" data-action="copy">${ICONS.spinner}</button>
        <button class="${CLASS.BTN.btn} ${CLASS.BTN.capture}" title="New capture" data-action="newCapture">${ICONS.capture}</button>
        <button class="${CLASS.BTN.btn} ${CLASS.BTN.settings}" title="Settings" data-action="expandSettings">${ICONS.settings}</button>
      </div>
    </div>
    <div contenteditable="false" aria-readonly="true" class="${CLASS.MAIN.textarea}"></div>
    <div class="settings">
      ${renderSettingsRows(state)}
    </div>
  `;
}
