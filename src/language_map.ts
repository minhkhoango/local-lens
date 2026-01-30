/**
 * Translate chrome's 2 letter language format
 * to Tesseract's 3 letter lang format
 */
export const CHROME_TO_TESSERACT = {
  ar: 'ara',
  bg: 'bul',
  bn: 'ben',
  ca: 'cat',
  cs: 'ces',
  da: 'dan',
  de: 'deu',
  el: 'ell',
  en: 'eng',
  'en-GB': 'eng',
  'en-US': 'eng',
  es: 'spa',
  'es-419': 'spa',
  fi: 'fin',
  fr: 'fra',
  'fr-CA': 'fra',
  he: 'heb',
  hi: 'hin',
  hu: 'hun',
  id: 'ind',
  it: 'ita',
  ja: 'jpn',
  ko: 'kor',
  nb: 'nor',
  nl: 'nld',
  no: 'nor',
  pl: 'pol',
  pt: 'por',
  'pt-BR': 'por',
  'pt-PT': 'por',
  ro: 'ron',
  ru: 'rus',
  sv: 'swe',
  th: 'tha',
  tr: 'tur',
  uk: 'ukr',
  vi: 'vie',
  zh: 'chi_sim',
  'zh-CN': 'chi_sim',
  'zh-TW': 'chi_tra',
} as const;

export type ChromeLang = keyof typeof CHROME_TO_TESSERACT;
export type TesseractLang = (typeof CHROME_TO_TESSERACT)[ChromeLang];
