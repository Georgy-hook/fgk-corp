/* One renderer per open exhibit; invisible and stationary exhibits do not draw. */
export function createSurface(T, canvas, scene, owner) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    throw new Error('scene.webgl');
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
    let more;
    try {
      more = events.step(now);
      // Keep detail in the stationary photograph, not in pixels blurred by motion.
      // One backing-store resize on each transition, never one per pointermove.
      const ratio = Math.min(
        devicePixelRatio || 1,
        moving ? 1.25 : 2,
        Math.sqrt((moving ? 750000 : 2500000) / (width * height)),
      );
      if (
        renderer.getPixelRatio() !== ratio ||
        canvas.width !== Math.floor(width * ratio) ||
        canvas.height !== Math.floor(height * ratio)
      ) {
        renderer.setDrawingBufferSize(width, height, ratio);
      }
      events.render();
    } catch {
      events.error('failed');
      return;
    } finally {
      drawing = false;
    }
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
    if (closed) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    const first = !width || !height;
    width = w;
    height = h;
    if (w && h) events.resize(w, h, first);
    visibility();
  }
  let sizeObserver;
  let intersection;
  return {
    renderer,
    dirty,
    resize,
    signal: listeners.signal,
    observe(callbacks) {
      events = callbacks;
      if ('ResizeObserver' in window) {
        sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', resize, { signal: listeners.signal });
      }
      if ('IntersectionObserver' in window) {
        intersection = new IntersectionObserver(([entry]) => {
          if (!closed && inView !== entry.isIntersecting) {
            inView = entry.isIntersecting;
            visibility();
          }
        });
        intersection.observe(canvas);
      }
      document.addEventListener('visibilitychange', visibility, { signal: listeners.signal });
      canvas.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          cancel();
          events.error('scene.contextLost');
        },
        { signal: listeners.signal },
      );
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
    dispose() {
      if (closed) return;
      closed = true;
      cancel();
      listeners.abort();
      sizeObserver?.disconnect();
      intersection?.disconnect();
      owner.collect(scene);
      owner.dispose();
      scene.clear();
      scene.environment = null;
      events = null;
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
