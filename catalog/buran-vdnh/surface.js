/* One renderer per open exhibit; invisible and stationary exhibits do not draw. */
export function createSurface(T, canvas, scene) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    throw new Error('Для осмотра нужен WebGL 2. Детали и файлы доступны ниже.');
  }
  const listeners = new AbortController();
  let events;
  let frame = 0;
  let width = 0;
  let height = 0;
  let inView = true;
  let moving = false;
  let drawing = false;
  let closed = false;
  const visible = () => !closed && !document.hidden && inView && width > 0 && height > 0;

  function draw(now) {
    frame = 0;
    if (!visible()) return;
    drawing = true;
    const more = events.step(now);
    // Keep detail in the stationary photograph, not in pixels blurred by motion.
    // One backing-store resize on each transition, never one per pointermove.
    const ratio = Math.min(devicePixelRatio || 1, moving ? 1.25 : 2,
      Math.sqrt((moving ? 750000 : 2500000) / (width * height)));
    if (renderer.getPixelRatio() !== ratio || canvas.width !== Math.floor(width * ratio) ||
        canvas.height !== Math.floor(height * ratio)) {
      renderer.setDrawingBufferSize(width, height, ratio);
    }
    events.render();
    drawing = false;
    if (more) dirty();
  }
  function dirty() {
    if (!drawing && !frame && visible()) frame = requestAnimationFrame(draw);
  }
  function cancel() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function visibility() {
    if (visible()) dirty();
    else {
      cancel();
      events.suspend();
    }
  }
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    const first = !width || !height;
    width = w;
    height = h;
    if (w && h) events.resize(w, h, first);
    visibility();
  }
  const sizeObserver = new ResizeObserver(resize);
  const intersection = new IntersectionObserver(([entry]) => {
    if (inView !== entry.isIntersecting) {
      inView = entry.isIntersecting;
      visibility();
    }
  });
  return {
    renderer, dirty, resize, signal: listeners.signal,
    observe(callbacks) {
      events = callbacks;
      sizeObserver.observe(canvas);
      intersection.observe(canvas);
      document.addEventListener('visibilitychange', visibility, { signal: listeners.signal });
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        cancel();
        events.error('Контекст 3D потерян. Можно открыть осмотр заново.');
      }, { signal: listeners.signal });
      resize();
    },
    motion(active) {
      if (active === moving) return;
      moving = active;
      dirty();
    },
    renderNow() {
      resize();
      if (!visible()) return false;
      cancel();
      draw(performance.now());
      return true;
    },
    dispose(extraMaterials) {
      if (closed) return;
      closed = true;
      cancel();
      listeners.abort();
      sizeObserver.disconnect();
      intersection.disconnect();
      const materials = new Set(extraMaterials);
      const geometries = new Set();
      const textures = new Set();
      if (scene.environment) textures.add(scene.environment);
      scene.traverse((obj) => {
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material) {
          for (const m of [].concat(obj.material)) materials.add(m);
        }
        obj.shadow?.dispose();
      });
      for (const mat of materials) {
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
        mat.dispose();
      }
      for (const tex of textures) tex.dispose();
      for (const geo of geometries) geo.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
