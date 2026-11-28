import { localizedUrl } from '../i18n.js';
import { productCopy } from '../product-copy.js';
import { createStudio } from '../catalog-scene.js';
import { asset } from './catalog-data.js';
import { byId, element, link } from './dom.js';
import { t } from './messages.js';

function showSpecifications(p) {
  byId('model-details').replaceChildren(
    ...p.details.map(({ label, value }) => {
      const row = element('div');
      row.append(element('dt', label), element('dd', value));
      return row;
    }),
  );
  const links = p.stl
    .filter(({ file }) => asset(p, file))
    .map(({ file, label }) => link(label || t('stl'), asset(p, file), true));
  const exhibit = asset(p, p.exhibit);
  if (exhibit) links.push(link(t('fullExhibit'), localizedUrl(exhibit)));
  byId('resources').replaceChildren(...links);
  byId('passport').hidden = !links.length && !p.details.length;
}

export function createProductPanel() {
  let source;
  let display;
  let selected;
  const remembered = new Map();
  const palette = byId('color-options');
  const studio = createStudio({ onColor: (hex) => choose(hex, false) });

  function notifyOrder() {
    if (!source) return;
    const canonical = source.colors.find(({ hex }) => hex === selected?.hex);
    window.dispatchEvent(
      new CustomEvent('fgk:order-model', {
        detail: {
          slug: source.slug,
          name: source.name,
          color: canonical?.name || '',
          colorHex: canonical?.hex || '',
        },
      }),
    );
  }
  function highlight() {
    byId('color-reading').textContent = selected?.name || '';
    for (const button of palette.children)
      button.setAttribute('aria-pressed', String(button.dataset.hex === selected?.hex));
  }
  function choose(hex, forward = true) {
    if (typeof hex !== 'string') return;
    const color = display.colors.find((entry) => entry.hex.toLowerCase() === hex.toLowerCase());
    if (!color) return;
    selected = color;
    remembered.set(source.slug, selected.hex);
    highlight();
    studio.sendColor(color, forward);
    notifyOrder();
  }
  function copy() {
    display = productCopy(source);
    document.title = `${display.name} — FGK Corp`;
    byId('model-title').textContent = display.name;
    byId('model-description').textContent = display.description;
    byId('model-category').textContent = display.category || t('noCategory');
    showSpecifications(display);
  }
  function renderPalette() {
    document.querySelector('.color-section').hidden = !display.colors.length;
    palette.replaceChildren(
      ...display.colors.map((color) => {
        const button = element('button', null, 'color-swatch');
        button.type = 'button';
        button.dataset.hex = color.hex;
        button.style.setProperty('--swatch', color.hex);
        return button;
      }),
    );
  }
  function labelPalette() {
    const byHex = new Map(display.colors.map((c) => [c.hex, c.name]));
    for (const button of palette.children) {
      const name = byHex.get(button.dataset.hex);
      button.title = name;
      button.setAttribute('aria-label', name);
    }
  }
  palette.addEventListener('click', (event) =>
    choose(event.target.closest('[data-hex]')?.dataset.hex),
  );
  byId('order-selected').addEventListener('click', notifyOrder);

  return {
    select(product) {
      source = product;
      copy();
      studio.setProduct(source, display);
      renderPalette();
      labelPalette();
      selected =
        display.colors.find(({ hex }) => hex === remembered.get(source.slug)) || display.colors[0];
      if (selected) choose(selected.hex);
      else {
        highlight();
        studio.sendColor(null);
        notifyOrder();
      }
    },
    refreshLanguage() {
      if (!source) return;
      copy();
      selected = display.colors.find(({ hex }) => hex === selected?.hex);
      labelPalette();
      highlight();
      studio.refreshLanguage(display);
    },
    notifyOrder,
  };
}
