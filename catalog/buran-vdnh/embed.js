(() => {
  const withinParent = window.parent !== window && new URLSearchParams(location.search).has('embed');
  const origin = location.origin;
  const menu = document.getElementById('paint');
  const toggle = document.getElementById('open-model');
  let color = '#edece7';
  let available = false;

  function applyColor(hex) {
    color = hex.toLowerCase();
    if (Array.from(menu.options).some((option) => option.value === color)) menu.value = color;
    if (available) window.dispatchEvent(new CustomEvent('buran:paint', { detail: color }));
  }

  if (withinParent) {
    document.documentElement.classList.add('exhibit-embedded');
    new ResizeObserver(() => {
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      window.parent.postMessage({ type: 'fgk:viewer-size', height }, origin);
    }).observe(document.body);
    window.addEventListener('message', (event) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      if (event.data?.type === 'fgk:viewer-color' && /^#[0-9a-f]{6}$/i.test(event.data.hex)) {
        applyColor(event.data.hex);
      }
    });
  }

  fetch('product.json')
    .then((response) => {
      if (!response.ok) throw new Error('No product metadata');
      return response.json();
    })
    .then(({ colors }) => {
      for (const { name, hex } of colors) {
        if (/^#[0-9a-f]{6}$/i.test(hex)) menu.add(new Option(name, hex.toLowerCase()));
      }
      applyColor(color);
      updateVisibility();
    })
    .catch(() => {});

  function updateVisibility() {
    menu.parentElement.hidden = !available || !menu.length || toggle.getAttribute('aria-expanded') !== 'true';
  }

  window.addEventListener('buran:viewer-ready', () => {
    available = true;
    applyColor(color);
    updateVisibility();
  });

  new MutationObserver(updateVisibility).observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
  menu.addEventListener('change', () => {
    applyColor(menu.value);
    if (withinParent) window.parent.postMessage({ type: 'fgk:viewer-color', hex: color }, origin);
  });
})();
