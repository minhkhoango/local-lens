import { CLASSES } from './constants';
import { ICONS } from './constants';
import type { SelectSettings, ToggleSettings } from '../types';
import type { State } from './types';
import type { TesseractLang } from '../language_map';

export const TESSERACT_LANGS: TesseractLang[] = [
  'ara',
  'ben',
  'bul',
  'cat',
  'ces',
  'chi_sim',
  'chi_tra',
  'dan',
  'deu',
  'ell',
  'eng',
  'fin',
  'fra',
  'heb',
  'hin',
  'hun',
  'ind',
  'ita',
  'jpn',
  'kor',
  'nld',
  'nor',
  'pol',
  'por',
  'ron',
  'rus',
  'spa',
  'swe',
  'tha',
  'tur',
  'ukr',
  'vie',
];

interface ToggleSettingsConfig {
  key: keyof ToggleSettings;
  labelKey: 'ui_auto_copy' | 'ui_auto_expand';
  type: 'toggle';
}

interface SelectSettingsConfig {
  key: keyof SelectSettings;
  labelKey: 'ui_language';
  type: 'select';
  options: readonly TesseractLang[];
}

type SettingsConfig = ToggleSettingsConfig | SelectSettingsConfig;

const SELECT_SETTINGS: SelectSettingsConfig[] = [
  {
    key: 'language',
    labelKey: 'ui_language',
    type: 'select',
    options: TESSERACT_LANGS,
  },
];

const TOGGLE_SETTINGS: ToggleSettingsConfig[] = [
  { key: 'autoCopy', labelKey: 'ui_auto_copy', type: 'toggle' },
  { key: 'autoExpand', labelKey: 'ui_auto_expand', type: 'toggle' },
];

const SETTINGS_CONFIG: SettingsConfig[] = [
  ...SELECT_SETTINGS,
  ...TOGGLE_SETTINGS,
];

/**
 * Helper function to render the settings options
 * @param state Settings saved island state for toggle value & shortcut
 * @returns HTML Settings block
 */
function renderSettingsRows(state: State): string {
  const rows = SETTINGS_CONFIG.map((config) => {
    const label = chrome.i18n.getMessage(config.labelKey);

    if (config.type === 'select') {
      const currentVal = state.settings[config.key];
      const optionsHtml =
        config.options
          ?.map(
            (lang) =>
              `<option value="${lang}" ${lang === currentVal ? 'selected' : ''}>
                ${chrome.i18n.getMessage(lang)}
                </option>`,
          )
          .join('') || '';

      return `
            <div class="${CLASSES.settingRow}">
            <span>${label}</span>
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
      const toggleClass = `${CLASSES.toggle} ${isActive ? CLASSES.active : ''}`;
      return `
            <div class="${CLASSES.settingRow}">
            <span>${label}</span>
            <div class="${toggleClass}" data-key="${config.key}"></div>
            </div>`;
    }
    return '';
  }).join('');

  // Add shortcut button
  const shortcutRow = `
      <div class="${CLASSES.settingRow}">
        <span>${chrome.i18n.getMessage('ui_shortcut')}</span>
        <button class="${CLASSES.settingsActionBtn}" data-action="openShortcutSettings">
          ${state.shortcutText}
        </button>
      </div>`;

  return rows + shortcutRow;
}

/**
 * Helper function to initialize the floatingIsland
 * @param state Settings saved island state
 * @returns Full HTML for container
 */
export function renderMainTemplate(state: State): string {
  return `
    <div class="${CLASSES.row}">
      <img class="${CLASSES.image}" src="${state.imageUrl}" alt="${chrome.i18n.getMessage('ui_cropped_screenshot')}"/>
      <div class="${CLASSES.content}">
        <span class="${CLASSES.status}">${chrome.i18n.getMessage('ui_processing')}</span>
        <div class="${CLASSES.preview}"></div>
      </div>
      <div class="${CLASSES.actions}">
        <button class="${CLASSES.btn} ${CLASSES.copybtn} ${CLASSES.loading}" title="${chrome.i18n.getMessage('hint_copy')}" data-action="copy">${ICONS.spinner}</button>
        <button class="${CLASSES.btn} ${CLASSES.openSettings}" title="${chrome.i18n.getMessage('hint_settings')}" data-action="expandSettings">${ICONS.settings}</button>
      </div>
    </div>
    <textarea class="${CLASSES.textarea}"></textarea>
    <div class="${CLASSES.settings}">
      ${renderSettingsRows(state)}
    </div>
  `;
}
