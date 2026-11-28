// The same small module runs in the storefront, its same-origin exhibit and the studio.
export const languages = Object.freeze([
  { code: 'ru', name: 'Русский', country: 'ru', label: 'Язык' },
  { code: 'kk', name: 'Қазақша', country: 'kz', label: 'Тіл' },
  { code: 'en', name: 'English', country: 'gb', label: 'Language' },
  { code: 'be', name: 'Беларуская', country: 'by', label: 'Мова' },
  { code: 'uz', name: 'O‘zbekcha', country: 'uz', label: 'Til' },
  { code: 'hy', name: 'Հայերեն', country: 'am', label: 'Լեզու' },
]);

const codes = new Set(languages.map(({ code }) => code));
const preference = 'fgk.locale';
const changeEvent = 'fgk:localechange';
const hasWindow = typeof window !== 'undefined';
let current = 'ru';

function readPreference() {
  try {
    return localStorage.getItem(preference);
  } catch {
    return null;
  }
}

function remember(code) {
  try {
    localStorage.setItem(preference, code);
  } catch {
    // Private windows can still use an in-page choice and language-aware links.
  }
}

function apply(code) {
  if (!codes.has(code)) return;
  document.documentElement.lang = code;
  if (code === current) return;
  current = code;
  const url = new URL(location.href);
  if (url.searchParams.has('lang') && url.searchParams.get('lang') !== code) {
    url.searchParams.set('lang', code);
    history.replaceState(history.state, '', url);
  }
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: { locale: code } }));
}

if (hasWindow) {
  const explicit = new URL(location.href).searchParams.get('lang');
  const saved = readPreference();
  apply(codes.has(explicit) ? explicit : codes.has(saved) ? saved : 'ru');
  if (codes.has(explicit) && window === window.parent) remember(explicit);
  window.addEventListener('storage', ({ key, newValue }) => {
    if (key === preference) apply(newValue || 'ru');
  });
  window.addEventListener('message', ({ source, origin, data }) => {
    if (
      window !== window.parent &&
      source === window.parent &&
      origin === location.origin &&
      data?.type === 'fgk:locale'
    ) {
      apply(data.locale);
    }
  });
}

export const getLocale = () => current;

export function setLocale(code) {
  if (!codes.has(code)) return false;
  if (hasWindow) {
    remember(code);
    apply(code);
  } else {
    current = code;
  }
  return true;
}

export function onLocaleChange(callback, { signal } = {}) {
  const listener = ({ detail }) => callback(detail.locale);
  window.addEventListener(changeEvent, listener, { signal });
  return () => window.removeEventListener(changeEvent, listener);
}

export function translator(messages) {
  return (key, vars = {}, locale = getLocale()) => {
    const text = messages[locale]?.[key] ?? messages.ru?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (token, name) =>
      Object.hasOwn(vars, name) ? String(vars[name]) : token,
    );
  };
}

const attributes = ['aria-label', 'placeholder', 'title', 'alt'];
const selector = ['[data-i18n]', ...attributes.map((attr) => `[data-i18n-${attr}]`)].join(',');

export function translateTree(root, t) {
  const descendants = root.querySelectorAll(selector);
  const nodes = root.matches?.(selector) ? [root, ...descendants] : descendants;
  for (const node of nodes) {
    if (node.hasAttribute('data-i18n')) node.textContent = t(node.dataset.i18n);
    for (const attr of attributes) {
      const key = node.getAttribute(`data-i18n-${attr}`);
      if (key) node.setAttribute(attr, t(key));
    }
  }
}

export function localizedUrl(value, base = document.baseURI) {
  const url = new URL(value, base);
  if (url.origin === location.origin && (getLocale() !== 'ru' || url.searchParams.has('lang'))) {
    url.searchParams.set('lang', getLocale());
  }
  return url;
}
