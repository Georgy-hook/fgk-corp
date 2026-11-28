import { parseModel } from '../../../assets/viewer/parse.js';
import { resourceOwner } from '../../../assets/viewer/resources.js';
import { createSurface } from '../surface.js';
import { register } from './model.js';
import { inspectionCamera } from './camera.js';
import { bindCameraKeys, picker } from './input.js';
import { exhibitFinish } from './finish.js';

const supports = new Set(['Plinth', 'GearFront', 'BogiePort', 'BogieStarboard']);

export async function openInspection(T, bytes, canvas, data, events, signal) {
  signal?.throwIfAborted();
  if (!T) throw new Error('scene.library');
  const owner = resourceOwner();
  const scene = new T.Scene();
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    throw new Error('scene.external');
  });
  let surface;
  try {
    const loader = new T.GLTFLoader(manager);
    const gltf = await parseModel(loader, manager, bytes, '', signal, owner);
    signal?.throwIfAborted();
    const { parts, owners } = register(T, scene, gltf, data.parts);
    surface = createSurface(T, canvas, scene, owner);
    return build(T, canvas, events, scene, parts, owners, surface, owner);
  } catch (error) {
    if (surface) surface.dispose();
    else owner.dispose();
    throw error;
  }
}

function build(T, canvas, events, scene, parts, owners, surface, owner) {
  const { renderer, dirty, resize } = surface;
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 0.86;
  const light = window.BuranStudio.illuminate(T, renderer, scene);
  const foot = Array.from(parts.values()).reduce((a, b) =>
    a.bounds.min.y < b.bounds.min.y ? a : b,
  );
  const rig = inspectionCamera(T, canvas, {
    invalidate: dirty,
    onStart: settle,
    onTap: (event) => pick(event),
    onMotion: surface.motion,
  });
  const { camera, orbit, home, below, plinthBelow, views, currentEye, placeCamera, setRange } = rig;
  const pick = picker(T, canvas, camera, scene, parts, owners, events.pick);
  surface.signal.addEventListener('abort', orbit.dispose, { once: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const originals = new Map();
  const { highlight, setPaint } = exhibitFinish(T, parts, owner, dirty);
  let selected = null;
  let isolated = null;
  let assemblyEye = null;
  let underside = false;
  const opening = { bay: 0, brakeUpper: 1, brakeLower: 1 };
  let detail = null;
  let amount = 0;
  let destination = 0;
  let anim = null;

  const visible = (part) =>
    isolated ? part.id === isolated : !underside || !supports.has(part.id);
  function frame(eye, value) {
    const fit = window.BuranStudio.framing(
      T,
      parts,
      camera.aspect,
      camera.fov,
      eye,
      visible,
      value,
    );
    if (detail) {
      fit.center.set(...detail.at);
      const span = Math.max(detail.span[0] / camera.aspect, detail.span[1]);
      fit.distance = span / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    return fit;
  }
  function lightScene(fit, contact) {
    const part = isolated ? parts.get(isolated) : foot;
    const offset = part.delta.clone().multiplyScalar(amount);
    // An underside inspection hangs in space. A turned leaf no longer has
    // the same floor contact as its cached footprint in the museum pose.
    const inspectUnderside = underside || isolated === 'Plinth';
    const grounded = contact && !inspectUnderside && !part.poseBounds;
    light(fit.bounds, fit.radius, grounded ? part : null, offset, inspectUnderside);
  }
  function placeParts(value) {
    amount = value;
    for (const part of parts.values()) {
      part.node.position.copy(part.anchor).addScaledVector(part.delta, value);
      part.node.visible = visible(part);
    }
  }
  function snap(eye = currentEye()) {
    anim = null;
    placeParts(destination);
    const fit = frame(eye, destination);
    setRange(fit);
    placeCamera(fit.center, eye, fit.distance);
    lightScene(fit, destination === 0 || !!isolated);
    dirty();
  }
  function settle() {
    if (anim) snap(anim.eye);
  }
  function step(now) {
    const coast = orbit.step(now);
    if (anim) {
      const t = Math.min(1, (now - anim.start) / 360);
      const ease = t * t * (3 - 2 * t);
      placeParts(anim.from + (destination - anim.from) * ease);
      const center = anim.center.clone().lerp(anim.fit.center, ease);
      placeCamera(center, anim.eye, anim.dist + (anim.fit.distance - anim.dist) * ease);
      renderer.shadowMap.needsUpdate = true;
      if (t === 1) snap(anim.eye);
    }
    return coast || !!anim;
  }

  function pose(control, fraction) {
    opening[control] = fraction;
    // The museum pose is the closed bay and an already split air brake.
    const travel = control === 'bay' ? fraction : 1 - fraction;
    for (const part of parts.values()) {
      if (part.hinge?.control === control) part.hinge.set(travel);
    }
  }
  function setOpening(control, fraction) {
    if (!Object.hasOwn(opening, control) || !Number.isFinite(fraction)) return false;
    orbit.stop();
    settle();
    const eye = currentEye();
    const before = frame(eye, amount);
    const scale = camera.position.distanceTo(orbit.target) / before.distance;
    pose(control, Math.min(1, Math.max(0, fraction)));
    placeParts(amount);
    const after = frame(eye, amount);
    setRange(after);
    // Keep the current crop/zoom when the visitor moves the hinge by hand.
    const target = orbit.target.clone().sub(before.center).add(after.center);
    placeCamera(target, eye, scale * after.distance);
    lightScene(after, !amount);
    dirty();
    return true;
  }
  function inspectBottom(active) {
    orbit.stop();
    detail = null;
    isolated = null;
    select(null, false);
    destination = 0;
    underside = active;
    snap(active ? below : home);
  }

  function explode(value) {
    orbit.stop();
    detail = null;
    underside = false;
    destination = value ? 1 : 0;
    if (reduced.matches || isolated) {
      snap();
      return;
    }
    const eye = currentEye();
    const fit = frame(eye, destination);
    const dist = camera.position.distanceTo(orbit.target);
    setRange(fit);
    lightScene(fit, false);
    anim = {
      eye,
      fit,
      center: orbit.target.clone(),
      dist,
      from: amount,
      start: performance.now(),
    };
    dirty();
  }
  function select(id, solo) {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    selected = parts.has(id) ? id : null;
    const next = solo ? selected : null;
    if (next !== isolated) {
      orbit.stop();
      detail = null;
      const eye = currentEye();
      if (!isolated) assemblyEye = eye;
      isolated = next;
      snap(next === 'Plinth' ? plinthBelow : next ? eye : assemblyEye || eye);
      if (!next) assemblyEye = null;
    }
    if (selected && !isolated) {
      for (const mesh of parts.get(selected).surfaces) {
        originals.set(mesh, mesh.material);
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(highlight)
          : highlight(mesh.material);
      }
    }
    dirty();
  }
  function setView(name, opts = {}) {
    const preset = views.get(name);
    if (!['home', 'underside', 'plinth-under'].includes(name) && !preset) return false;
    if (name === 'plinth-under' && !parts.has('Plinth')) return false;
    orbit.stop();
    resize();
    destination = 0;
    anim = null;
    isolated = null;
    select(null, false);
    underside = name === 'underside';
    pose('bay', name === 'opened' ? 1 : 0);
    pose('brakeUpper', 1);
    pose('brakeLower', 1);
    detail = preset || null;
    if (name === 'plinth-under') select('Plinth', true);
    else snap(preset ? new T.Vector3(...preset.eye).normalize() : underside ? below : home);
    if (opts?.instant) surface.renderNow();
    return true;
  }
  function zoom(factor) {
    orbit.stop();
    settle();
    const distance = camera.position.distanceTo(orbit.target) / factor;
    placeCamera(
      orbit.target,
      currentEye(),
      Math.max(orbit.minDistance, Math.min(orbit.maxDistance, distance)),
    );
    dirty();
  }
  bindCameraKeys(canvas, surface.signal, {
    T,
    camera,
    orbit,
    placeCamera,
    dirty,
    settle,
    zoom,
    reset: events.reset,
  });
  reduced.addEventListener('change', settle, { signal: surface.signal });
  surface.observe({
    step,
    render() {
      renderer.render(scene, camera);
    },
    suspend() {
      orbit.stop();
      settle();
    },
    resize(w, h, first) {
      orbit.stop();
      if (!first) settle();
      const eye = first ? home : currentEye();
      const oldDistance = first ? 1 : frame(eye, amount).distance;
      camera.aspect = w / h;
      if (first) snap(eye);
      else {
        // Keep the same subject and relative zoom through phone rotation / browser-bar resize.
        const fit = frame(eye, amount);
        const zoom = camera.position.distanceTo(orbit.target) / oldDistance;
        setRange(fit);
        placeCamera(fit.center, eye, fit.distance * zoom);
      }
    },
    error: events.error,
  });
  return {
    select,
    explode,
    zoom,
    setOpening,
    setPaint,
    inspectBottom,
    isSupport: (id) => supports.has(id),
    setView,
    snapshot() {
      if (!surface.renderNow()) throw new Error('scene.snapshot');
      return canvas.toDataURL('image/png');
    },
    saveView() {
      settle();
      return {
        selected,
        isolated,
        underside,
        destination,
        opening: { ...opening },
        detail: [...views.keys()].find((id) => views.get(id) === detail),
        assemblyEye: assemblyEye?.toArray(),
        eye: currentEye().toArray(),
        target: orbit.target.toArray(),
        distance: camera.position.distanceTo(orbit.target),
        aspect: camera.aspect,
      };
    },
    restoreView(saved) {
      for (const [id, value] of Object.entries(saved.opening)) pose(id, value);
      underside = saved.underside;
      destination = saved.destination;
      select(saved.selected, !!saved.isolated);
      detail = views.get(saved.detail) || null;
      assemblyEye = saved.assemblyEye ? new T.Vector3(...saved.assemblyEye) : null;
      const eye = new T.Vector3(...saved.eye);
      snap(eye);
      if (Math.abs(camera.aspect - saved.aspect) < 0.01) {
        placeCamera(new T.Vector3(...saved.target), eye, saved.distance);
      }
    },
    dispose() {
      surface.dispose();
    },
    reset() {
      setView('home');
    },
  };
}
