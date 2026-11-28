import { byId, label, t } from './copy.js';

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          scripts.delete(src);
          script.remove();
          reject(new Error('loadError'));
        };
        document.head.append(script);
      }),
    );
  }
  return scripts.get(src);
}

export function mountScene(catalogue, inspection) {
  const toggle = byId('open-model');
  const caption = toggle.querySelector('span');
  const error = byId('scene-error');
  let viewer = null;
  let request = null;
  let savedView = null;
  let errorKey = null;
  let viewerMessage;

  function showScene(active) {
    byId('instrument').classList.toggle('is-active', active);
    byId('model').hidden = !active;
    byId('poster').hidden = active;
    byId('camera-tools').hidden = !active;
    byId('model-tools').hidden = !active;
    label(caption, active ? 'close3D' : 'rotate');
    toggle.setAttribute('aria-expanded', String(active));
  }

  function closeScene() {
    if (!request && !viewer) return;
    request?.abort();
    request = null;
    if (viewer) {
      savedView = viewer.saveView();
      viewer.dispose();
      viewer = null;
    }
    // A deliberately lost WebGL context can only be reopened on a fresh canvas.
    const canvas = byId('model');
    if (!canvas.hidden) {
      const next = canvas.cloneNode(false);
      next.removeAttribute('width');
      next.removeAttribute('height');
      next.style.removeProperty('visibility');
      canvas.replaceWith(next);
    }
    showScene(false);
    toggle.removeAttribute('aria-busy');
  }

  function refreshError() {
    if (!errorKey) return;
    const message = errorKey.startsWith('scene.') ? viewerMessage?.(errorKey) : null;
    const fallback = errorKey === 'loadError' ? 'loadError' : 'openError';
    error.textContent = message && message !== errorKey ? message : t(fallback);
  }
  async function fail(key) {
    closeScene();
    inspection.unavailable();
    errorKey = typeof key === 'string' ? key : 'openError';
    error.hidden = false;
    refreshError();
    if (errorKey.startsWith('scene.') && !viewerMessage) {
      try {
        ({ viewerMessage } = await import('../../../assets/viewer/copy.js'));
        refreshError();
      } catch {
        /* The localized generic error remains available offline. */
      }
    }
  }
  async function open() {
    if (request || viewer) {
      closeScene();
      return;
    }
    const operation = new AbortController();
    const canvas = byId('model');
    request = operation;
    errorKey = null;
    error.hidden = true;
    toggle.setAttribute('aria-busy', 'true');
    label(caption, 'cancelLoad');
    try {
      const [prepared] = await Promise.all([
        loadScript('viewport.js').then(() => window.BuranViewport.prepare(operation.signal)),
        ...['vendor/three-atlas.js', 'assets/model-data.js', 'studio.js'].map(loadScript),
      ]);
      operation.signal.throwIfAborted();
      catalogue.populate(window.BURAN);
      canvas.hidden = false;
      canvas.style.visibility = 'hidden';
      const next = await window.BuranViewport.create(
        canvas,
        window.BURAN,
        {
          pick: inspection.pick,
          reset: inspection.reset,
          error: fail,
        },
        operation.signal,
        prepared,
      );
      if (operation.signal.aborted) {
        next.dispose();
        return;
      }
      viewer = next;
      inspection.ready(viewer, savedView);
      showScene(true);
      window.dispatchEvent(new Event('buran:viewer-ready'));
    } catch (reason) {
      if (!operation.signal.aborted) await fail(reason?.message);
    } finally {
      if (request === operation) {
        request = null;
        canvas.style.removeProperty('visibility');
        if (!canvas.hidden) canvas.focus({ preventScroll: true });
        toggle.removeAttribute('aria-busy');
      }
    }
  }

  toggle.addEventListener('click', open);
  toggle.hidden = false;
  window.addEventListener('pagehide', closeScene);
  window.addEventListener('fgk:viewer-close', closeScene);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && request) closeScene();
  });
  return { current: () => viewer, refreshError };
}
