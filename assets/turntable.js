// Upright, target-centred object inspection. Input accumulates here; the host owns the render loop.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const decayMs = 90;

export function createTurntable(T, camera, canvas, { invalidate, onStart, onTap, onMotion }) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const fingers = new Map();
  const offset = new T.Vector3();
  const api = {
    target: new T.Vector3(),
    minDistance: 0.000001,
    maxDistance: Infinity,
    minPolarAngle: 0.015,
    maxPolarAngle: Math.PI - 0.015,
    getAzimuthalAngle: () => Math.atan2(camera.position.x - api.target.x, camera.position.z - api.target.z),
    getPolarAngle: () => Math.acos(clamp(offset.copy(camera.position).sub(api.target).normalize().y, -1, 1)),
    update: () => camera.lookAt(api.target),
    step,
    stop,
    dispose,
  };

  let dx = 0;
  let dy = 0;
  let logZoom = 0;
  let vx = 0;
  let vy = 0;
  let gain = 0;
  let span = 0;
  let lastMove = 0;
  let lastStep = 0;
  let coastUntil = 0;
  let multi = false;
  let moving = false;

  function motion(value) {
    if (moving === value) return;
    moving = value;
    onMotion?.(value);
  }

  function stop() {
    const ids = [...fingers.keys()];
    fingers.clear();
    for (const id of ids) release(id);
    dx = dy = logZoom = vx = vy = coastUntil = lastMove = 0;
    multi = false;
    motion(false);
  }

  function release(id) {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function separation() {
    const [a, b] = fingers.values();
    return Math.max(2, Math.hypot(a.x - b.x, a.y - b.y));
  }

  function down(e) {
    if (e.button !== 0 || fingers.has(e.pointerId) || fingers.size === 2) return;
    if (!fingers.size) {
      stop();
      onStart?.();
      const rect = canvas.getBoundingClientRect();
      gain = Math.PI * 1.15 / clamp(Math.min(rect.width, rect.height), 200, 720);
      lastMove = performance.now();
    }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, drag: false });
    canvas.setPointerCapture(e.pointerId);
    if (fingers.size === 2) {
      multi = true;
      span = separation();
      vx = vy = 0;
    }
  }

  function move(e) {
    const p = fingers.get(e.pointerId);
    if (!p) return;
    const x = e.clientX;
    const y = e.clientY;
    if (p.x === x && p.y === y) return;
    const now = performance.now();
    const dt = clamp(now - lastMove, 2, 50);
    if (fingers.size === 2) {
      p.x = x;
      p.y = y;
      const next = separation();
      logZoom += Math.log(span / next);
      span = next;
    } else {
      if (!p.drag && Math.hypot(x - p.startX, y - p.startY) < (e.pointerType === 'mouse' ? 3 : 6)) return;
      const ax = -(x - p.x) * gain;
      const ay = -(y - p.y) * gain * 0.82;
      dx += ax;
      dy += ay;
      // A short velocity estimate keeps the object under the finger. Only the release coasts.
      const mix = 1 - Math.exp(-dt / 30);
      vx += (clamp(ax / dt, -0.009, 0.009) - vx) * mix;
      vy += (clamp(ay / dt, -0.008, 0.008) - vy) * mix;
      p.x = x;
      p.y = y;
      p.drag = true;
    }
    lastMove = now;
    motion(true);
    invalidate();
  }

  function up(e) {
    const p = fingers.get(e.pointerId);
    if (!p) return;
    move(e);
    fingers.delete(e.pointerId);
    release(e.pointerId);
    if (fingers.size) {
      const other = fingers.values().next().value;
      other.startX = other.x;
      other.startY = other.y;
      other.drag = false;
      vx = vy = 0;
      return;
    }
    const now = performance.now();
    if (!multi && p.drag && !reduced.matches && now - lastMove < 65 && Math.hypot(vx, vy) > 0.00028) {
      coastUntil = now + 390;
      lastStep = now;
      invalidate();
    } else {
      motion(false);
      if (!multi && !p.drag) onTap?.(e);
    }
    multi = false;
  }

  function cancel(e) {
    if (fingers.has(e.pointerId)) stop();
  }

  function wheel(e) {
    if (fingers.size || (!e.ctrlKey && doc.activeElement !== canvas)) return;
    e.preventDefault();
    onStart?.();
    coastUntil = 0;
    motion(false);
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    logZoom += clamp(pixels * (e.ctrlKey ? 0.009 : 0.0016), -0.55, 0.55);
    invalidate();
  }

  function step(now) {
    if (coastUntil) {
      const elapsed = Math.max(0, Math.min(now, coastUntil) - lastStep);
      const fade = Math.exp(-elapsed / decayMs);
      dx += vx * decayMs * (1 - fade);
      dy += vy * decayMs * (1 - fade);
      vx *= fade;
      vy *= fade;
      lastStep = now;
      if (now >= coastUntil || Math.hypot(vx, vy) < 0.00015) {
        coastUntil = 0;
        motion(false);
      }
    }
    if (dx || dy || logZoom) {
      offset.copy(camera.position).sub(api.target);
      const radius = Math.max(offset.length(), 0.000001);
      const distance = clamp(radius * Math.exp(clamp(logZoom, -4, 4)), api.minDistance, api.maxDistance);
      const yaw = Math.atan2(offset.x, offset.z) + dx;
      const pitch = clamp(Math.acos(clamp(offset.y / radius, -1, 1)) + dy, api.minPolarAngle, api.maxPolarAngle);
      const ring = Math.sin(pitch) * distance;
      camera.position.set(Math.sin(yaw) * ring, Math.cos(pitch) * distance, Math.cos(yaw) * ring).add(api.target);
      api.update();
      dx = dy = logZoom = 0;
    }
    return Boolean(coastUntil);
  }

  function dispose() {
    listeners.abort();
    stop();
  }
  const options = { signal: listeners.signal };
  canvas.addEventListener('pointerdown', down, options);
  canvas.addEventListener('pointermove', move, options);
  canvas.addEventListener('pointerup', up, options);
  canvas.addEventListener('pointercancel', cancel, options);
  canvas.addEventListener('lostpointercapture', cancel, options);
  canvas.addEventListener('wheel', wheel, { ...options, passive: false });
  win.addEventListener('blur', stop, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) stop(); }, options);
  reduced.addEventListener('change', stop, options);
  return api;
}
