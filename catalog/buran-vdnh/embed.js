(() => {
  const params = new URLSearchParams(location.search);
  const withinParent = window.parent !== window && params.has('embed');
  const origin = location.origin;
  const menu = document.getElementById('paint');
  const toggle = document.getElementById('open-model');
  const tools = document.getElementById('model-tools');
  const instrument = document.getElementById('instrument');
  const compact = matchMedia('(max-width: 900px), (pointer: coarse)');
  let color = '#edece7';
  let available = false;

  function applyColor(hex) {
    color = hex.toLowerCase();
    if (Array.from(menu.options).some((option) => option.value === color)) menu.value = color;
    if (available) window.dispatchEvent(new CustomEvent('buran:paint', { detail: color }));
  }

  function setInspectionLayout(isolated) {
    instrument.classList.toggle('inspection-layout', isolated);
    tools.open = !isolated;
  }

  if (withinParent) {
    document.documentElement.classList.add('exhibit-embedded');
    if (params.has('inspect')) {
      setInspectionLayout(true);
    } else {
      new ResizeObserver(() => {
        const height = Math.ceil(document.body.getBoundingClientRect().height);
        window.parent.postMessage({ type: 'fgk:viewer-size', height }, origin);
      }).observe(document.body);
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        window.parent.postMessage({ type: 'fgk:request-close' }, origin);
      }
    });
    window.addEventListener('message', (event) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      if (event.data?.type === 'fgk:viewer-color' && /^#[0-9a-f]{6}$/i.test(event.data.hex)) {
        applyColor(event.data.hex);
      }
    });
  } else {
    // A direct exhibit link opens the same viewing surface without a second iframe.
    const dialog = document.getElementById('exhibit-inspection');
    const done = document.getElementById('inspect-done');
    const hero = instrument.parentElement;
    let returnY = 0;
    function openInspection() {
      returnY = window.scrollY;
      dialog.append(instrument);
      setInspectionLayout(true);
      document.documentElement.classList.add('inspection-open');
      dialog.showModal();
      done.focus({ preventScroll: true });
    }
    function closeInspection() {
      window.dispatchEvent(new Event('fgk:viewer-close'));
      dialog.close();
      setInspectionLayout(false);
      document.documentElement.classList.remove('inspection-open');
      hero.prepend(instrument);
      toggle.focus({ preventScroll: true });
      window.scrollTo(0, returnY);
    }
    function requestClose() {
      if (history.state?.fgkExhibit) history.back();
      closeInspection();
    }
    toggle.addEventListener('click', () => {
      if (!dialog.open && compact.matches && typeof dialog.showModal === 'function' &&
          toggle.getAttribute('aria-expanded') === 'false') {
        openInspection();
        if (!history.state?.fgkExhibit) history.pushState({ ...history.state, fgkExhibit: true }, '');
      }
    }, { capture: true });
    done.addEventListener('click', requestClose);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      requestClose();
    });
    window.addEventListener('popstate', () => {
      if (dialog.open && !history.state?.fgkExhibit) closeInspection();
      else if (!dialog.open && history.state?.fgkExhibit) toggle.click();
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
