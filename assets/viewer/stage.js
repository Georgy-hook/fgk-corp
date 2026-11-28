import * as THREE from '../../vendor/three/build/three.module.js';
import { createTurntable } from '../turntable.js';
import { disposeModel, paintFinish } from '../model-media.js';

const initialDirection = new THREE.Vector3(1.55, 0.95, 1.65).normalize();

export function createStage(view, originalColor, fail) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38);
  const center = new THREE.Vector3();
  let radius = 0;
  let fit = 0;
  let renderer;
  let orbit;
  let observer;
  let frame = 0;
  let model;
  let paint;
  let disposed = false;
  let inMotion = false;
  let sized = '';
  let width = 0;
  let height = 0;
  const doc = view.canvas.ownerDocument;

  function render() {
    if (disposed || frame || !renderer || doc.hidden) return;
    frame = requestAnimationFrame((now) => {
      frame = 0;
      if (disposed || doc.hidden) return;
      const coasting = orbit?.step(now);
      try {
        renderer.render(scene, camera);
      } catch {
        fail('failed');
        return;
      }
      if (coasting) render();
    });
  }

  function resolution(active) {
    inMotion = active;
    if (!width || !height || !renderer || disposed) return;
    const dpr = Math.min(
      devicePixelRatio || 1,
      active ? 1.4 : 2,
      Math.sqrt((active ? 700000 : 1600000) / (width * height)),
    );
    const next = `${width}:${height}:${dpr}`;
    if (sized === next) return;
    sized = next;
    renderer.setDrawingBufferSize(width, height, dpr);
    render();
  }

  function visibility() {
    if (doc.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      orbit?.stop();
    } else render();
  }

  function reset() {
    orbit.stop();
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(initialDirection, fit);
    orbit.update();
    render();
  }

  function resize() {
    if (disposed) return;
    width = view.stage.clientWidth;
    height = view.stage.clientHeight;
    if (!width || !height || !radius || !renderer) return;
    const zoom = fit ? camera.position.distanceTo(orbit.target) / fit : 1;
    camera.aspect = width / height;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    fit = (1.05 * radius) / Math.sin(Math.min(halfV, halfH));
    orbit.minDistance = radius * 0.2;
    orbit.maxDistance = fit * 4;
    camera.near = Math.max(0.000001, radius / 1000);
    camera.far = fit * 10;
    camera.updateProjectionMatrix();
    const direction = camera.position.clone().sub(orbit.target);
    if (!direction.lengthSq()) direction.copy(initialDirection);
    camera.position.copy(orbit.target).addScaledVector(direction.normalize(), fit * zoom);
    resolution(inMotion);
    orbit.update();
    render();
  }

  function mount(object, isAssembly, color) {
    const bounds = new THREE.Box3().setFromObject(object);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
      disposeModel(object);
      throw new Error('scene.invalid');
    }
    if (model) scene.remove(model);
    disposeModel(model);
    model = object;
    scene.add(model);
    paint = paintFinish(model, originalColor, isAssembly);
    paint(color);
    center.copy(sphere.center);
    radius = sphere.radius;
    fit = 0;
    resize();
    reset();
  }

  function zoom(factor) {
    orbit.stop();
    const direction = camera.position.clone().sub(orbit.target);
    const distance = THREE.MathUtils.clamp(
      direction.length() * factor,
      orbit.minDistance,
      orbit.maxDistance,
    );
    camera.position.copy(orbit.target).addScaledVector(direction.normalize(), distance);
    orbit.update();
    render();
  }

  function keys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Home') reset();
    else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-') zoom(1.25);
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      orbit.stop();
      const sphere = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(orbit.target),
      );
      const step = Math.PI / 18;
      if (event.key === 'ArrowLeft') sphere.theta -= step;
      if (event.key === 'ArrowRight') sphere.theta += step;
      if (event.key === 'ArrowUp') sphere.phi -= step;
      if (event.key === 'ArrowDown') sphere.phi += step;
      sphere.makeSafe();
      camera.position.setFromSpherical(sphere).add(orbit.target);
      orbit.update();
      render();
    } else return;
    event.preventDefault();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    cancelAnimationFrame(frame);
    observer?.disconnect();
    orbit?.dispose();
    scene.clear();
    disposeModel(model);
    model = paint = null;
    renderer?.dispose();
    renderer?.forceContextLoss();
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas: view.canvas, alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene.add(new THREE.HemisphereLight(0xf0f5ff, 0x8b9399, 1.6));
    const key = new THREE.DirectionalLight(0xfff8ed, 2.6);
    const rim = new THREE.DirectionalLight(0xd5e5ff, 1.2);
    key.position.set(4, 6, 3);
    rim.position.set(-4, 2, -3);
    scene.add(key, rim);
    orbit = createTurntable(THREE, camera, view.canvas, {
      invalidate: render,
      onMotion: resolution,
    });
    doc.addEventListener('visibilitychange', visibility, { signal });
    view.canvas.addEventListener('keydown', keys, { signal });
    view.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        fail('scene.contextLost');
      },
      { signal },
    );
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(resize);
      observer.observe(view.stage);
    } else {
      window.addEventListener('resize', resize, { signal });
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    mount,
    reset,
    zoom,
    dispose,
    color(hex) {
      paint?.(hex);
      render();
    },
  };
}
