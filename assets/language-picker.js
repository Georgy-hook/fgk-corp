import { getLocale, languages, onLocaleChange, setLocale } from './i18n.js';

const flag = (country) => new URL(`./flags/${country}.svg`, import.meta.url).href;
const mounted = new WeakMap();
let sequence = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function flagImage(country) {
  const image = element('img', 'fgk-language__flag');
  image.alt = '';
  image.width = 24;
  image.height = 18;
  image.src = flag(country);
  return image;
}

function languageOption({ code, name, country }) {
  const option = element('button', 'fgk-language__option');
  option.type = 'button';
  option.dataset.locale = code;
  option.lang = code;
  option.tabIndex = -1;
  option.setAttribute('role', 'option');
  option.append(flagImage(country), element('span', 'fgk-language__name', name));
  return option;
}

export function mountLanguagePicker(slot) {
  if (!slot) return () => {};
  if (mounted.has(slot)) return mounted.get(slot);
  const lifetime = new AbortController();
  const events = { signal: lifetime.signal };
  const root = element('div', 'fgk-language');
  const trigger = element('button', 'fgk-language__trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const label = element('span', 'fgk-language__selected');
  const selectedFlag = flagImage(languages.find(({ code }) => code === getLocale()).country);
  selectedFlag.classList.add('fgk-language__current-flag');
  const short = element('span', 'fgk-language__code');
  short.setAttribute('aria-hidden', 'true');
  const list = element('div', 'fgk-language__list');
  list.id = `fgk-languages-${++sequence}`;
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  const options = languages.map(languageOption);
  list.append(...options);
  trigger.setAttribute('aria-controls', list.id);
  trigger.append(selectedFlag, label, short);
  root.append(trigger, list);
  slot.replaceChildren(root);

  function paint() {
    const selected = languages.find(({ code }) => code === getLocale());
    trigger.setAttribute('aria-label', `${selected.label}: ${selected.name}`);
    list.setAttribute('aria-label', selected.label);
    selectedFlag.src = flag(selected.country);
    label.textContent = selected.name;
    short.textContent = selected.code.toUpperCase();
    for (const option of options)
      option.setAttribute('aria-selected', String(option.dataset.locale === selected.code));
  }
  function close(restore = false) {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restore) trigger.focus({ preventScroll: true });
  }
  function fitToViewport() {
    if (list.hidden) return;
    const margin = 8;
    const width = list.offsetWidth;
    const start = root.getBoundingClientRect().right - width;
    const endLimit = Math.max(margin, document.documentElement.clientWidth - margin - width);
    const left = Math.min(endLimit, Math.max(margin, start));
    list.style.setProperty('--menu-end', `${start - left}px`);
  }
  function open() {
    list.hidden = false;
    fitToViewport();
    trigger.setAttribute('aria-expanded', 'true');
    options.find((option) => option.dataset.locale === getLocale()).focus({ preventScroll: true });
  }
  function navigate(event) {
    const index = options.indexOf(document.activeElement);
    const keys = {
      ArrowDown: (index + 1) % options.length,
      ArrowUp: (index + options.length - 1) % options.length,
      Home: 0,
      End: options.length - 1,
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (Object.hasOwn(keys, event.key)) {
      event.preventDefault();
      options[keys[event.key]].focus();
    } else if (event.key.length === 1 && /\p{L}/u.test(event.key)) {
      const match = languages.findIndex(({ name }) =>
        name.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
      );
      if (match !== -1) options[match].focus();
    }
  }
  trigger.addEventListener('click', () => (list.hidden ? open() : close(true)), events);
  trigger.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
      }
    },
    events,
  );
  list.addEventListener('keydown', navigate, events);
  window.addEventListener('resize', fitToViewport, events);
  list.addEventListener(
    'click',
    (event) => {
      const option = event.target.closest('[data-locale]');
      if (!option) return;
      setLocale(option.dataset.locale);
      close(true);
    },
    events,
  );
  document.addEventListener(
    'pointerdown',
    ({ target }) => {
      if (!list.hidden && !root.contains(target)) close();
    },
    events,
  );
  root.addEventListener(
    'focusout',
    ({ relatedTarget }) => {
      if (!list.hidden && !root.contains(relatedTarget)) close();
    },
    events,
  );
  paint();
  onLocaleChange(paint, events);
  const dispose = () => {
    lifetime.abort();
    root.remove();
    mounted.delete(slot);
  };
  mounted.set(slot, dispose);
  return dispose;
}
