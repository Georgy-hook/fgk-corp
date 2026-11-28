import { productCopy } from '../product-copy.js';
import { getLocale, onLocaleChange } from '../i18n.js';
import { viewerMessage as t } from './copy.js';

export function createView(doc, product, parts, signal) {
  function element(tag, name, parent) {
    const node = doc.createElement(tag);
    node.className = `fgk-viewer${name ? `__${name}` : ''}`;
    parent?.append(node);
    return node;
  }
  const root = element('div');
  const stage = element('div', 'stage', root);
  const canvas = element('canvas', 'canvas', stage);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  const status = element('p', 'status', stage);
  status.setAttribute('role', 'status');
  const toolbar = element('div', 'toolbar', root);
  const partLabel = element('label', 'part', toolbar);
  partLabel.hidden = true;
  const caption = element('span', 'caption', partLabel);
  const part = element('select', 'select', partLabel);
  const palette = element('div', 'palette', toolbar);
  palette.hidden = true;
  palette.setAttribute('role', 'group');
  const actions = element('div', 'actions', toolbar);
  const labels = [];
  const swatches = new Map();
  let statusKey = 'loading';
  let activeIndex = -1;

  function describe(button, label) {
    button.title = label;
    button.setAttribute('aria-label', label);
  }
  function localize() {
    const copy = productCopy(product);
    const number = new Intl.NumberFormat(getLocale());
    const names = new Map(copy.stl?.map(({ file, label }) => [file, label]));
    const partName = (index) =>
      names.get(parts[index].file) || t('numberedPart', { index: number.format(index + 1) });
    canvas.setAttribute('aria-label', t('canvas', { name: copy.name }));
    palette.setAttribute('aria-label', t('palette'));
    caption.textContent = t('part');
    for (const option of part.options) option.textContent = partName(Number(option.value));
    for (const { hex, name } of copy.colors) {
      const button = swatches.get(hex?.toLowerCase());
      if (button) describe(button, name);
    }
    for (const { button, label, text } of labels) {
      describe(button, t(label));
      if (text) button.textContent = t(text);
    }
    status.textContent =
      statusKey === 'position'
        ? t('position', {
            index: number.format(activeIndex + 1),
            total: number.format(parts.length),
            label: partName(activeIndex),
          })
        : t(statusKey);
  }
  function setStatus(key, index = -1, error = false) {
    statusKey = key;
    activeIndex = index;
    if (error) status.dataset.error = 'true';
    else delete status.dataset.error;
    localize();
  }
  function button(parent, klass, click) {
    const node = element('button', klass, parent);
    node.type = 'button';
    node.addEventListener('click', click, { signal });
    return node;
  }
  function controls({ switchPart, sendColor, zoom, reset }, index) {
    if (index >= 0 && parts.length > 1) {
      parts.forEach((entry, i) => part.add(new Option('', String(i))));
      part.value = String(index);
      partLabel.hidden = false;
      part.addEventListener('change', () => switchPart(Number(part.value)), { signal });
    }
    if (!product.externalColors) {
      for (const { hex } of product.colors || []) {
        if (!/^#[\da-f]{6}$/i.test(hex)) continue;
        const swatch = button(palette, 'swatch', () => sendColor(hex));
        swatch.dataset.hex = hex.toLowerCase();
        swatch.style.setProperty('--swatch-color', hex);
        swatches.set(hex.toLowerCase(), swatch);
      }
      palette.hidden = !swatches.size;
    }
    const commands = [
      ['in', '+', () => zoom(0.8)],
      ['out', '−', () => zoom(1.25)],
      ['reset', '', reset],
    ];
    for (const [label, symbol, click] of commands) {
      const node = button(actions, 'button', click);
      node.textContent = symbol;
      labels.push({ button: node, label, text: symbol ? '' : 'resetText' });
    }
    localize();
  }
  function color(hex) {
    for (const [key, swatch] of swatches)
      swatch.setAttribute('aria-pressed', String(key === hex?.toLowerCase()));
  }
  function fail(key) {
    canvas.hidden = true;
    toolbar.hidden = true;
    setStatus(key, -1, true);
  }
  onLocaleChange(localize, { signal });
  localize();
  return { root, canvas, stage, part, controls, color, setStatus, fail };
}
