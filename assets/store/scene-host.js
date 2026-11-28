import { getLocale, localizedUrl } from '../i18n.js';
import { asset } from './catalog-data.js';
import { t } from './messages.js';

// A mount owns one frame or one generic WebGL session, never both.
export function createSceneHost(container, { onColor, onClose }) {
  let frame;
  let mount;
  let lifetime;
  let release;
  let paint;
  let labelKey;

  function send(message) {
    frame?.contentWindow?.postMessage(message, location.origin);
  }
  function setPaint(value, forward = true) {
    paint = value;
    if (!paint || !forward) return;
    mount?.dispatchEvent(new CustomEvent('fgk:viewer-color', { detail: paint }));
    send({ type: 'fgk:viewer-color', ...paint });
  }
  function refreshLanguage(display) {
    if (frame) {
      frame.title = t('interactiveName', { name: display.name });
      send({ type: 'fgk:locale', locale: getLocale() });
    }
    if (labelKey && mount && !mount.childElementCount) mount.textContent = t(labelKey);
  }
  function close() {
    lifetime?.abort();
    lifetime = null;
    try {
      frame?.contentWindow?.dispatchEvent(new Event('fgk:viewer-close'));
    } catch {
      // A custom exhibit may have navigated away from its original same-origin URL.
    }
    release?.();
    release = null;
    frame = null;
    mount = null;
    labelKey = null;
    container.replaceChildren();
  }
  function mountFrame(url, isolated, display, signal) {
    frame = document.createElement('iframe');
    frame.allow = 'fullscreen';
    frame.title = t('interactiveName', { name: display.name });
    const address = localizedUrl(url);
    if (isolated && address.searchParams.has('embed')) address.searchParams.set('inspect', '1');
    frame.src = address.href;
    frame.addEventListener(
      'load',
      () => {
        setPaint(paint);
        refreshLanguage(display);
        // A curated exhibit has a poster gate of its own. One gesture opens both.
        const gate = frame.contentDocument?.getElementById('open-model');
        if (gate?.getAttribute('aria-expanded') === 'false') gate.click();
      },
      { once: true, signal },
    );
    window.addEventListener(
      'message',
      (event) => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
        const message = event.data;
        if (message?.type === 'fgk:viewer-color') onColor(message.hex);
        if (message?.type === 'fgk:request-close') onClose();
        if (!isolated && message?.type === 'fgk:viewer-size' && Number.isFinite(message.height)) {
          frame.style.height = `${Math.max(250, Math.min(1600, message.height))}px`;
        }
      },
      { signal },
    );
    container.append(frame);
  }
  async function mountGeneric(product, isolated, signal) {
    mount = document.createElement('div');
    labelKey = 'loading';
    mount.textContent = t(labelKey);
    mount.addEventListener(
      'fgk:viewer-color',
      (event) => {
        if (event.bubbles) onColor(event.detail?.hex);
      },
      { signal },
    );
    container.append(mount);
    try {
      const { mountViewer } = await import('../viewer.js');
      if (signal.aborted) return;
      const cleanup = await mountViewer(mount, {
        product: { ...product, externalColors: !isolated, selectedColor: paint?.hex },
        base: product.base.href,
        signal,
      });
      if (signal.aborted) cleanup?.();
      else {
        labelKey = null;
        release = cleanup;
      }
    } catch {
      if (!signal.aborted) {
        labelKey = 'sceneError';
        mount.textContent = t(labelKey);
      }
    }
  }
  return {
    close,
    refreshLanguage,
    setPaint,
    open(product, display, isolated) {
      close();
      lifetime = new AbortController();
      const url = asset(product, product.viewer);
      if (url) mountFrame(url, isolated, display, lifetime.signal);
      else mountGeneric(product, isolated, lifetime.signal);
    },
  };
}
