/* Loaded only after the visitor opens the exhibit. */
(() => {
  async function prepare(signal) {
    signal?.throwIfAborted();
    const scene = import('./render/inspection.js');
    const geometry = import('./render/model.js').then((model) => model.geometry(signal));
    return Promise.all([scene, geometry]);
  }

  async function create(canvas, data, events, signal, prepared) {
    const [scene, bytes] = prepared || (await prepare(signal));
    return scene.openInspection(window.AtlasThree, bytes, canvas, data, events, signal);
  }

  window.BuranViewport = Object.freeze({ prepare, create });
})();
