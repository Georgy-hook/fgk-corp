import { createView } from './viewer/view.js';
import { createStage } from './viewer/stage.js';
import { disposeModel, loadModel, loadPart, printableParts } from './model-media.js';

// The status (including an error) follows the host's locale until closed.
// The renderer and the current request have a shorter, independently owned life.
export async function mountViewer(container, { base, product, signal }) {
  if (signal?.aborted) return () => {};
  const ui = new AbortController();
  const parts = printableParts(product);
  const view = createView(container.ownerDocument, product, parts, ui.signal);
  container.replaceChildren(view.root);
  let stage;
  let reading = new AbortController();
  let partIndex = -1;
  let color = product.selectedColor || product.colors?.[0]?.hex;

  function releaseStage() {
    reading.abort();
    stage?.dispose();
    stage = null;
  }
  function close() {
    if (ui.signal.aborted) return;
    signal?.removeEventListener('abort', close);
    ui.abort();
    releaseStage();
    view.root.remove();
  }
  function fail(key) {
    releaseStage();
    view.fail(key);
  }
  function mount(object, index) {
    stage.mount(object, index < 0, color);
    partIndex = index;
    view.setStatus(index >= 0 && parts.length > 1 ? 'position' : 'gesture', index);
  }
  async function switchPart(index) {
    if (!stage || !parts[index]) return;
    reading.abort();
    reading = new AbortController();
    const { signal } = reading;
    view.setStatus('loadingPart');
    try {
      const object = await loadPart(base, parts[index].file, color, signal);
      if (signal.aborted || !container.isConnected) {
        disposeModel(object);
        if (!container.isConnected) close();
        return;
      }
      mount(object, index);
    } catch {
      if (signal.aborted) return;
      view.part.value = String(partIndex);
      view.setStatus('partFailed', -1, true);
    }
  }
  function receiveColor({ detail }) {
    if (!/^#[\da-f]{6}$/i.test(detail?.hex)) return;
    color = detail.hex;
    stage?.color(color);
    view.color(color);
  }
  function sendColor(hex) {
    container.dispatchEvent(
      new CustomEvent('fgk:viewer-color', { bubbles: true, detail: { hex } }),
    );
  }
  signal?.addEventListener('abort', close, { once: true });
  container.addEventListener('fgk:viewer-color', receiveColor, { signal: ui.signal });
  try {
    stage = createStage(view, product.colors?.[0]?.hex, fail);
    const { object, part } = await loadModel(base, product, parts, reading.signal);
    if (reading.signal.aborted || !container.isConnected) {
      disposeModel(object);
      if (!container.isConnected) close();
      return close;
    }
    mount(object, part);
    view.controls(
      { switchPart, sendColor, zoom: (factor) => stage?.zoom(factor), reset: () => stage?.reset() },
      part,
    );
    view.color(color);
  } catch {
    if (!reading.signal.aborted) fail(stage ? 'failed' : 'scene.webgl');
  }
  return close;
}
