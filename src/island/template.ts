import { CLASSES } from './constants';
import { ICONS } from './constants';
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
            <div class="${CLASSES.settingRow}">
            <span>${config.labelKey}</span>
            <div class="${CLASSES.selectWrapper}">
                <select class="${CLASSES.settingsSelect}" data-key="${config.key}">
                ${optionsHtml}
                </select>
                <div class="${CLASSES.selectIcon}">${ICONS.dropdown}</div>
            </div>
            </div>`;
    }

    if (config.type === 'toggle') {
      const isActive = state.settings[config.key];
      const toggleClass = `${CLASSES.settingsToggle} ${isActive ? CLASSES.active : ''}`;
      return `
            <div class="${CLASSES.settingRow}">
            <span>${config.labelKey}</span>
            <div class="${toggleClass}" data-key="${config.key}"></div>
            </div>`;
    }
    return '';
  }).join('');

  const shortcutRow = `
      <div class="${CLASSES.settingRow}">
        <span>Set shortcut</span>
        <button class="${CLASSES.settingsActionBtn}" data-action="openShortcutSettings">
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
    <div class="${CLASSES.row}">
      <img class="${CLASSES.image}" src="${state.imageUrl}" alt="Captured region"/>
      <div class="${CLASSES.content}">
        <span class="${CLASSES.status}">processing...</span>
        <div class="${CLASSES.preview}"></div>
      </div>
      <div class="${CLASSES.actions}">
        <button class="${CLASSES.btn} ${CLASSES.copybtn} ${CLASSES.loading}" title="Copy" data-action="copy">${ICONS.spinner}</button>
        <button class="${CLASSES.btn} ${CLASSES.openSettings}" title="Settings" data-action="expandSettings">${ICONS.settings}</button>
      </div>
    </div>
    <div contenteditable="false" aria-readonly="true" class="${CLASSES.textarea}"></div>
    <div class="${CLASSES.settings}">
      ${renderSettingsRows(state)}
    </div>
  `;
}
