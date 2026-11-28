/* Local renderer and compressed GLB for the Buran exhibit. */
(() => {
  'use strict';

  async function geometry(signal) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Для 3D-осмотра обновите браузер.');
    }
    const response = await fetch('assets/buran.glb.gz', { signal });
    if (!response.ok || !response.body) throw new Error('Не удалось загрузить геометрию.');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      bytes.length < 20 ||
      head.getUint32(0, true) !== 0x46546c67 ||
      head.getUint32(4, true) !== 2 ||
      head.getUint32(8, true) !== bytes.length
    ) {
      throw new Error('Файл геометрии повреждён.');
    }
    return bytes.buffer;
  }

  function prepare(signal) {
    // The large file can stream and inflate while the classic Three bundle is still loading.
    signal?.throwIfAborted();
    return Promise.all([geometry(signal), import('../../assets/turntable.js'), import('./surface.js')]);
  }

  function parse(T, bytes) {
    const manager = new T.LoadingManager();
    manager.setURLModifier((url) => {
      if (/^(data|blob):/i.test(url)) return url;
      throw new Error('Модель содержит внешнюю зависимость.');
    });
    return new T.GLTFLoader(manager).parseAsync(bytes, '');
  }

  function register(T, scene, gltf, catalog) {
    const root = gltf.scene;
    const nodes = new Map();
    const parts = new Map();
    const owners = new WeakMap();
    scene.add(root);
    root.traverse((obj) => {
      const index = gltf.parser.associations.get(obj)?.nodes;
      const id = gltf.parser.json.nodes[index]?.name;
      if (id) nodes.set(id, obj);
    });
    // Put each physical item directly in the world frame before applying its
    // world-space explosion vector. attach() preserves its assembled transform.
    for (const item of catalog) {
      const node = nodes.get(item.id);
      if (!node) throw new Error(`В геометрии нет детали «${item.label}».`);
      scene.attach(node);
      parts.set(item.id, {
        id: item.id,
        node,
        origin: node.position.clone(),
        anchor: node.position.clone(),
        articulation: item.articulation,
        delta: new T.Vector3(...item.explode),
        surfaces: [],
      });
    }
    scene.remove(root);
    scene.updateMatrixWorld(true);
    for (const part of parts.values()) {
      part.node.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        owners.set(mesh, part.id);
        part.surfaces.push(mesh);
      });
      if (!part.surfaces.length) throw new Error('В одной из деталей отсутствуют поверхности.');
      part.bounds = new T.Box3().setFromObject(part.node);
      // The packed exhibit carries the original framing cloud, in assembled world metres.
      const cloud = part.node.userData.buranSupportPoints;
      part.points = Array.isArray(cloud) && cloud.length === 26 &&
          cloud.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
        ? cloud.map((p) => new T.Vector3(...p))
        : window.BuranStudio.supportPoints(T, part.surfaces);
      part.hinge = window.BuranStudio.hingeFor(T, part, part.articulation);
    }
    return { parts, owners };
  }

  async function create(canvas, data, events, signal, prepared) {
    const T = window.AtlasThree;
    if (!T) throw new Error('Не найдена локальная библиотека 3D.');
    const [bytes, { createTurntable }, { createSurface }] = prepared || await prepare(signal);
    signal?.throwIfAborted();
    const gltf = await parse(T, bytes);
    signal?.throwIfAborted();
    const scene = new T.Scene();
    const { parts, owners } = register(T, scene, gltf, data.parts);
    const surface = createSurface(T, canvas, scene);
    try {
      return build(T, canvas, events, scene, parts, owners, surface, createTurntable);
    } catch (reason) {
      surface.dispose();
      throw reason;
    }
  }

  function build(T, canvas, events, scene, parts, owners, surface, createTurntable) {
    const paint = new Map();
    const copies = new Map();
    for (const [id, part] of parts) {
      if (['Plinth', 'GearFront', 'BogiePort', 'BogieStarboard'].includes(id)) continue;
      for (const mesh of part.surfaces) {
        const material = mesh.material;
        if (!material.color || !/^#[d-f][0-9a-f]{5}$/i.test(material.name)) continue;
        if (!copies.has(material)) {
          const copy = material.clone();
          copies.set(material, copy);
          paint.set(copy, material.color.clone());
        }
        mesh.material = copies.get(material);
      }
    }
    const { renderer, dirty, resize } = surface;
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NeutralToneMapping;
    renderer.toneMappingExposure = 0.86;
    const light = window.BuranStudio.illuminate(T, renderer, scene);
    const camera = new T.PerspectiveCamera(23, 1, 0.0001, 10);
    const home = new T.Vector3(-0.53, 0.92, 1.12).normalize();
    const below = new T.Vector3(-0.32, -1.32, 0.68).normalize();
    const plinthBelow = new T.Vector3(-0.31, -1.12, 0.84).normalize();
    const supports = new Set(['Plinth', 'GearFront', 'BogiePort', 'BogieStarboard']);
    // Catalogue crops in the assembled GLB's world frame (aft, up, port), metres.
    // Span is the minimum width/height of the photograph at its subject plane.
    const views = new Map([
      ['cockpit', { at: [0.043, 0.027, 0.003], eye: [-0.86, 0.49, 1.07], span: [0.078, 0.054] }],
      ['fin', { at: [0.224, 0.058, 0.001], eye: [0.55, 0.32, 1.16], span: [0.093, 0.087] }],
      ['rear', { at: [0.235, 0.024, 0], eye: [1.55, 0.16, 0.67], span: [0.091, 0.070] }],
      ['gear', { at: [0.168, -0.009, 0.023], eye: [-0.89, 0.14, 1.05], span: [0.044, 0.036] }],
      ['opened', { at: [0.132, 0.027, 0], eye: [-0.30, 1.48, 0.82], span: [0.145, 0.107] }],
    ]);
    const foot = Array.from(parts.values()).reduce((a, b) =>
      a.bounds.min.y < b.bounds.min.y ? a : b,
    );
    const orbit = createTurntable(T, camera, canvas, {
      invalidate: dirty, onStart: settle, onTap: pick, onMotion: surface.motion,
    });
    surface.signal.addEventListener('abort', orbit.dispose, { once: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ray = new T.Raycaster();
    const pointer = new T.Vector2();
    const originals = new Map();
    const highlights = new Map();
    let selected = null;
    let isolated = null;
    let assemblyEye = null;
    let underside = false;
    const opening = { bay: 0, brakeUpper: 1, brakeLower: 1 };
    let detail = null;
    let amount = 0;
    let destination = 0;
    let anim = null;

    const currentEye = () => camera.position.clone().sub(orbit.target).normalize();
    const visible = (part) => isolated ? part.id === isolated : !underside || !supports.has(part.id);
    function frame(eye, value) {
      const fit = window.BuranStudio.framing(
        T, parts, camera.aspect, camera.fov, eye, visible, value,
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
    function placeCamera(center, eye, distance) {
      orbit.target.copy(center);
      camera.position.copy(center).addScaledVector(eye, distance);
      orbit.update();
    }
    function placeParts(value) {
      amount = value;
      for (const part of parts.values()) {
        part.node.position.copy(part.anchor).addScaledVector(part.delta, value);
        part.node.visible = visible(part);
      }
    }
    function setRange(fit) {
      orbit.minDistance = Math.max(0.000002, fit.radius * 0.15);
      orbit.maxDistance = fit.distance * 6;
      camera.near = Math.max(0.0000001, fit.radius * 0.002);
      camera.far = Math.max(fit.radius * 35, orbit.maxDistance * 2);
      camera.updateProjectionMatrix();
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
    function highlight(material) {
      if (highlights.has(material)) return highlights.get(material);
      const copy = material.clone();
      if (copy.emissive) {
        copy.emissive.set(0xe4753b);
        copy.emissiveIntensity = 0.32;
      } else {
        copy.color?.lerp(new T.Color(0xf89255), 0.45);
      }
      highlights.set(material, copy);
      return copy;
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
    function setPaint(hex) {
      const tint = new T.Color(hex);
      for (const [material, initial] of paint) {
        material.color.copy(initial);
        if (hex.toLowerCase() !== '#edece7') {
          material.color.multiply(tint).multiplyScalar(1.15);
        }
        const selectedMaterial = highlights.get(material);
        if (selectedMaterial) selectedMaterial.color.copy(material.color);
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
    function pick(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        (2 * (event.clientX - rect.left)) / rect.width - 1,
        1 - (2 * (event.clientY - rect.top)) / rect.height,
      );
      camera.updateMatrixWorld();
      scene.updateMatrixWorld(true);
      ray.setFromCamera(pointer, camera);
      const surfaces = [];
      for (const part of parts.values()) {
        if (part.node.visible) surfaces.push(...part.surfaces);
      }
      const hit = ray.intersectObjects(surfaces, false)[0];
      if (hit) events.pick(owners.get(hit.object));
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
    canvas.addEventListener('keydown', (event) => {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const key = event.key;
      if (key === 'Home') events.reset();
      else if (key === '+' || key === '=') zoom(1.2);
      else if (key === '-') zoom(1 / 1.2);
      else if (key.startsWith('Arrow')) {
        orbit.stop();
        settle();
        const theta =
          orbit.getAzimuthalAngle() +
          (key === 'ArrowRight' ? 0.13 : key === 'ArrowLeft' ? -0.13 : 0);
        const phi = Math.min(
          orbit.maxPolarAngle,
          Math.max(
            orbit.minPolarAngle,
            orbit.getPolarAngle() + (key === 'ArrowUp' ? -0.13 : key === 'ArrowDown' ? 0.13 : 0),
          ),
        );
        const eye = new T.Vector3().setFromSphericalCoords(1, phi, theta);
        placeCamera(orbit.target, eye, camera.position.distanceTo(orbit.target));
        dirty();
      } else return;
      event.preventDefault();
    }, { signal: surface.signal });
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
        if (!surface.renderNow()) throw new Error('Снимок недоступен до отрисовки модели.');
        return canvas.toDataURL('image/png');
      },
      saveView() {
        settle();
        return {
          selected, isolated, underside, destination, opening: { ...opening },
          detail: [...views.keys()].find((id) => views.get(id) === detail),
          assemblyEye: assemblyEye?.toArray(), eye: currentEye().toArray(),
          target: orbit.target.toArray(), distance: camera.position.distanceTo(orbit.target),
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
        surface.dispose([...copies.keys(), ...paint.keys(), ...highlights.values()]);
      },
      reset() {
        setView('home');
      },
    };
  }

  window.BuranViewport = Object.freeze({ prepare, create });
})();
