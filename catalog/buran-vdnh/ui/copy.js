import { getLocale, translator } from '../../../assets/i18n.js';
import ruUI from '../locales/ru/surface.js';
import ruGuide from '../locales/ru/guide.js';
import ruParts from '../locales/ru/parts.js';
import kkUI from '../locales/kk/surface.js';
import kkGuide from '../locales/kk/guide.js';
import kkParts from '../locales/kk/parts.js';
import enUI from '../locales/en/surface.js';
import enGuide from '../locales/en/guide.js';
import enParts from '../locales/en/parts.js';
import beUI from '../locales/be/surface.js';
import beGuide from '../locales/be/guide.js';
import beParts from '../locales/be/parts.js';
import uzUI from '../locales/uz/surface.js';
import uzGuide from '../locales/uz/guide.js';
import uzParts from '../locales/uz/parts.js';
import hyUI from '../locales/hy/surface.js';
import hyGuide from '../locales/hy/guide.js';
import hyParts from '../locales/hy/parts.js';

export const t = translator({
  ru: { ...ruUI, ...ruGuide, ...ruParts },
  kk: { ...kkUI, ...kkGuide, ...kkParts },
  en: { ...enUI, ...enGuide, ...enParts },
  be: { ...beUI, ...beGuide, ...beParts },
  uz: { ...uzUI, ...uzGuide, ...uzParts },
  hy: { ...hyUI, ...hyGuide, ...hyParts },
});

export const byId = (id) => document.getElementById(id);

export function label(node, key) {
  node.dataset.i18n = key;
  node.textContent = t(key);
}

export function measure(vector) {
  if (vector?.length !== 3 || !vector.every(Number.isFinite)) return '';
  const format = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 });
  return t('measurement', { dimensions: vector.map(format.format).join(' × ') });
}

export function percentage(value) {
  return new Intl.NumberFormat(getLocale(), { style: 'percent' }).format(value / 100);
}
