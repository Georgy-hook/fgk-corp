import { getLocale } from '../../../assets/i18n.js';
import { byId } from './copy.js';

const valid = (hex) => typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex);

export function mountPalette(scene, { embedded }) {
  const menu = byId('paint');
  const toggle = byId('open-model');
  let color = '#edece7';
  let metadata;

  function refresh() {
    const names = metadata?.i18n?.[getLocale()]?.colors;
    for (const option of menu.options) {
      option.textContent = names?.[option.dataset.name] || option.dataset.name;
    }
  }
  function apply(hex) {
    if (!valid(hex)) return;
    color = hex.toLowerCase();
    if (Array.from(menu.options).some((option) => option.value === color)) menu.value = color;
    scene.current()?.setPaint(color);
  }
  function updateVisibility() {
    byId('paint-picker').hidden = !menu.length || toggle.getAttribute('aria-expanded') !== 'true';
  }
  if (embedded) {
    window.addEventListener('message', (event) => {
      if (
        event.origin === location.origin &&
        event.source === window.parent &&
        event.data?.type === 'fgk:viewer-color'
      ) {
        apply(event.data.hex);
      }
    });
  }
  menu.addEventListener('change', () => {
    apply(menu.value);
    if (embedded)
      window.parent.postMessage({ type: 'fgk:viewer-color', hex: color }, location.origin);
  });
  new MutationObserver(updateVisibility).observe(toggle, {
    attributes: true,
    attributeFilter: ['aria-expanded'],
  });
  window.addEventListener('buran:paint', ({ detail }) => apply(detail));
  window.addEventListener('buran:viewer-ready', () => {
    apply(color);
    updateVisibility();
  });

  fetch('product.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((product) => {
      metadata = product;
      for (const { name, hex } of product?.colors || []) {
        if (!valid(hex)) continue;
        const option = new Option(name, hex.toLowerCase());
        option.dataset.name = name;
        menu.add(option);
      }
      refresh();
      apply(color);
      updateVisibility();
    })
    .catch(() => {
      /* The exhibit works without optional paint metadata. */
    });
  return { refresh };
}
