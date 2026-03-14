import { ICONS, CLASS } from './constants';
import type {
  SelectSettings,
  ToggleSettings,
  EngineOption,
  TesseractLang,
} from '../types';
import type { State } from './types';

export const LANGUAGE_OPTIONS: Record<TesseractLang, string> = {
  ara: chrome.i18n.getMessage('ara'),
  ben: chrome.i18n.getMessage('ben'),
  bul: chrome.i18n.getMessage('bul'),
  cat: chrome.i18n.getMessage('cat'),
  ces: chrome.i18n.getMessage('ces'),
  chi_sim: chrome.i18n.getMessage('chi_sim'),
  chi_tra: chrome.i18n.getMessage('chi_tra'),
  dan: chrome.i18n.getMessage('dan'),
  deu: chrome.i18n.getMessage('deu'),
  ell: chrome.i18n.getMessage('ell'),
  eng: chrome.i18n.getMessage('eng'),
  fin: chrome.i18n.getMessage('fin'),
  fra: chrome.i18n.getMessage('fra'),
  heb: chrome.i18n.getMessage('heb'),
  hin: chrome.i18n.getMessage('hin'),
  hun: chrome.i18n.getMessage('hun'),
  ind: chrome.i18n.getMessage('ind'),
  ita: chrome.i18n.getMessage('ita'),
  jpn: chrome.i18n.getMessage('jpn'),
  kor: chrome.i18n.getMessage('kor'),
  nld: chrome.i18n.getMessage('nld'),
  nor: chrome.i18n.getMessage('nor'),
  pol: chrome.i18n.getMessage('pol'),
  por: chrome.i18n.getMessage('por'),
  ron: chrome.i18n.getMessage('ron'),
  rus: chrome.i18n.getMessage('rus'),
  spa: chrome.i18n.getMessage('spa'),
  swe: chrome.i18n.getMessage('swe'),
  tha: chrome.i18n.getMessage('tha'),
  tur: chrome.i18n.getMessage('tur'),
  ukr: chrome.i18n.getMessage('ukr'),
  vie: chrome.i18n.getMessage('vie'),
} as const;

const ENGINE_OPTIONS: Record<EngineOption, string> = {
  tesseract: chrome.i18n.getMessage('engine_fast'),
  granite: chrome.i18n.getMessage('engine_thinking'),
};

interface ToggleSettingsConfig {
  key: keyof ToggleSettings;
  labelKey: string;
  type: 'toggle';
}

interface SelectSettingsConfig {
  key: keyof SelectSettings;
  labelKey: string;
  type: 'select';
  options: Record<TesseractLang, string> | Record<EngineOption, string>;
}

type SettingsConfig = ToggleSettingsConfig | SelectSettingsConfig;

const SELECT_SETTINGS: SelectSettingsConfig[] = [
  {
    key: 'language',
    labelKey: chrome.i18n.getMessage('ui_language'),
    type: 'select',
    options: LANGUAGE_OPTIONS,
  },
];

const TOGGLE_SETTINGS: ToggleSettingsConfig[] = [
  {
    key: 'autoCopy',
    labelKey: chrome.i18n.getMessage('ui_auto_copy'),
    type: 'toggle',
  },
  {
    key: 'autoExpand',
    labelKey: chrome.i18n.getMessage('ui_auto_expand'),
    type: 'toggle',
  },
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
        <span>${chrome.i18n.getMessage('ui_shortcut')}</span>
        <button class="${CLASS.BTN.shortcut}" data-action="openShortcutSettings">
          ${state.shortcutText}
        </button>
      </div>`;

  return rows + shortcutRow;
}

function renderViewContainer(state: State, webgpuSupported: boolean): string {
  return `
    <div contenteditable="false" class="${CLASS.MAIN.textarea}"></div>
    <div class="${CLASS.MAIN.toolsBar}">
      <div class="select-wrapper">
        <select class="${CLASS.SETTINGS.select}" data-key="engine">
          ${Object.entries(ENGINE_OPTIONS)
            .map(([value, display]) => {
              const isSelected =
                value === state.settings.engine ? 'selected' : '';
              if (value === 'granite' && !webgpuSupported) {
                return `<option value="${value}" ${isSelected} disabled title="${chrome.i18n.getMessage('hint_webgpu_not_supported')}">${display} ${chrome.i18n.getMessage('ui_engine_unavailable')}</option>`;
              }
              return `<option value="${value}" ${isSelected}>${display}</option>`;
            })
            .join('')}
        </select>
        <div class="select-icon">${ICONS.dropdown}</div>
      </div>
    </div>
  `;
}

/**
 * Helper function to initialize the floatingIsland's main HTML
 */
export function renderMainTemplate(
  state: State,
  webgpuSupported: boolean,
): string {
  return `
    <div class="row">
      <img class="image" src="${state.imageUrl}"/>
      <div class="content">
        <span class="${CLASS.MAIN.status}">${chrome.i18n.getMessage('ui_load_model')}...</span>
        <div class="${CLASS.MAIN.preview}"></div>
      </div>
      <div class="actions">
        <button class="${CLASS.BTN.btn} ${CLASS.BTN.copy} ${CLASS.STATE.copyLoading}" title="${chrome.i18n.getMessage('hint_copy')}" data-action="copy">${ICONS.spinner}</button>
        <button class="${CLASS.BTN.btn} ${CLASS.BTN.settings}" title="${chrome.i18n.getMessage('hint_settings')}" data-action="expandSettings">${ICONS.settings}</button>
      </div>
    </div>
    <div class="${CLASS.MAIN.viewContainer}">
      ${renderViewContainer(state, webgpuSupported)}
    </div>
    <div class="settings">
      ${renderSettingsRows(state)}
    </div>
  `;
}
