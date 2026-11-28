import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { disposeModel, loadModel, loadPart, paintFinish, printableParts } from './model-media.js';

function makeView(doc, product) {
  function element(tag, name, parent) {
    const node = doc.createElement(tag);
    node.className = `fgk-viewer${name ? `__${name}` : ''}`;
    parent?.append(node);
    return node;
  }
  const root = element('div');
  const stage = element('div', 'stage', root);
  const canvas = element('canvas', 'canvas', stage);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${product.name}. Стрелки — поворот, плюс и минус — масштаб, Home — сброс.`);
  const status = element('p', 'status', stage);
  status.setAttribute('role', 'status');
  status.textContent = 'Загружаем модель…';
  const toolbar = element('div', 'toolbar', root);
  const partLabel = element('label', 'part', toolbar);
  partLabel.hidden = true;
  partLabel.append('Деталь STL');
  const part = element('select', 'select', partLabel);
  const palette = element('div', 'palette', toolbar);
  palette.hidden = true;
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Окрас модели');
  const actions = element('div', 'actions', toolbar);
  function button(parent, label, text, klass, action) {
    const node = element('button', klass, parent);
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.textContent = text;
    node.addEventListener('click', action);
    return node;
  }
  return { root, stage, canvas, status, partLabel, part, palette, actions, button };
}

const colorPattern = /^#[\da-f]{6}$/i;
const initialDirection = new THREE.Vector3(1.55, 0.95, 1.65).normalize();

export async function mountViewer(container, { base, product }) {
  const view = makeView(container.ownerDocument, product);
  container.replaceChildren(view.root);
  const parts = printableParts(product);
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
  let partIndex = -1;
  let requestId = 0;
  let disposed = false;
  let color = product.selectedColor || product.colors?.[0]?.hex;

  function render() {
    if (disposed || frame || !renderer) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed) renderer.render(scene, camera);
    });
  }

  function reset() {
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(initialDirection, fit);
    orbit.update();
    render();
  }

  function resize() {
    const { width, height } = view.stage.getBoundingClientRect();
    if (!width || !height || !radius || !renderer) return;
    const zoom = fit ? camera.position.distanceTo(orbit.target) / fit : 1;
    camera.aspect = width / height;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    fit = 1.05 * radius / Math.sin(Math.min(halfV, halfH));
    orbit.minDistance = radius * 0.20;
    orbit.maxDistance = fit * 4;
    camera.near = Math.max(0.000001, radius / 1000);
    camera.far = fit * 10;
    camera.updateProjectionMatrix();
    const direction = camera.position.clone().sub(orbit.target);
    if (!direction.lengthSq()) direction.copy(initialDirection);
    camera.position.copy(orbit.target).addScaledVector(direction.normalize(), fit * zoom);
    renderer.setSize(width, height, false);
    orbit.update();
    render();
  }

  function chooseColor(hex) {
    if (!colorPattern.test(hex)) return;
    color = hex;
    paint?.(hex);
    for (const swatch of view.palette.children) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.hex === hex.toLowerCase()));
    }
    render();
  }

  function mount(object, index) {
    const bounds = new THREE.Box3().setFromObject(object);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
      disposeModel(object);
      throw new Error('В файле нет видимой геометрии.');
    }
    if (model) scene.remove(model);
    disposeModel(model);
    model = object;
    partIndex = index;
    scene.add(model);
    paint = paintFinish(model, product.colors?.[0]?.hex, index === -1);
    chooseColor(color);
    center.copy(sphere.center);
    radius = sphere.radius;
    fit = 0;
    resize();
    reset();
    view.status.textContent = index >= 0 && parts.length > 1
      ? `Деталь ${index + 1} из ${parts.length}: ${parts[index].label}`
      : 'Перетащите, чтобы повернуть';
    view.status.removeAttribute('data-error');
  }

  function zoom(factor) {
    const direction = camera.position.clone().sub(orbit.target);
    const distance = THREE.MathUtils.clamp(direction.length() * factor, orbit.minDistance, orbit.maxDistance);
    camera.position.copy(orbit.target).addScaledVector(direction.normalize(), distance);
    orbit.update();
    render();
  }

  function keys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Home') reset();
    else if (event.key === '+' || event.key === '=') zoom(0.80);
    else if (event.key === '-') zoom(1.25);
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const sphere = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
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

  async function switchPart() {
    const index = Number(view.part.value);
    const id = ++requestId;
    view.status.textContent = 'Загружаем деталь…';
    try {
      const object = await loadPart(base, parts[index].file, color);
      if (disposed || !container.isConnected || id !== requestId) {
        disposeModel(object);
        return;
      }
      mount(object, index);
    } catch {
      if (disposed || id !== requestId) return;
      view.part.value = String(partIndex);
      view.status.dataset.error = 'true';
      view.status.textContent = 'Не удалось открыть выбранную деталь. Загрузите её STL ниже.';
    }
  }

  const receiveColor = (event) => chooseColor(event.detail?.hex);
  container.addEventListener('fgk:viewer-color', receiveColor);
  function cleanup() {
    if (disposed) return;
    disposed = true;
    requestId++;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    view.canvas.removeEventListener('keydown', keys);
    view.part.removeEventListener('change', switchPart);
    container.removeEventListener('fgk:viewer-color', receiveColor);
    orbit?.dispose();
    disposeModel(model);
    renderer?.dispose();
    view.root.remove();
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas: view.canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene.add(new THREE.HemisphereLight(0xf0f5ff, 0x8b9399, 1.6));
    const key = new THREE.DirectionalLight(0xfff8ed, 2.6);
    const rim = new THREE.DirectionalLight(0xd5e5ff, 1.2);
    key.position.set(4, 6, 3);
    rim.position.set(-4, 2, -3);
    scene.add(key, rim);
    orbit = new OrbitControls(camera, view.canvas);
    orbit.enablePan = false;
    orbit.addEventListener('change', render);
    const { object, part } = await loadModel(base, product, parts);
    if (!container.isConnected) {
      disposeModel(object);
      cleanup();
      return cleanup;
    }
    mount(object, part);
    if (part >= 0 && parts.length > 1) {
      parts.forEach((entry, index) => view.part.add(new Option(entry.label || `Деталь ${index + 1}`, String(index))));
      view.part.value = String(part);
      view.partLabel.hidden = false;
      view.part.addEventListener('change', switchPart);
    }
    if (!product.externalColors) {
      for (const { name, hex } of product.colors || []) {
        if (!colorPattern.test(hex)) continue;
        const button = view.button(view.palette, name, '', 'swatch', () => {
          container.dispatchEvent(new CustomEvent('fgk:viewer-color', { bubbles: true, detail: { name, hex } }));
        });
        button.dataset.hex = hex.toLowerCase();
        button.style.setProperty('--swatch-color', hex);
      }
      view.palette.hidden = !view.palette.childElementCount;
      chooseColor(color);
    }
    view.button(view.actions, 'Приблизить модель', '+', 'button', () => zoom(0.8));
    view.button(view.actions, 'Отдалить модель', '−', 'button', () => zoom(1.25));
    view.button(view.actions, 'Сбросить ракурс', 'Исходный ракурс', 'button', reset);
    view.canvas.addEventListener('keydown', keys);
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(resize);
      observer.observe(view.stage);
    } else {
      window.addEventListener('resize', resize);
    }
  } catch {
    view.canvas.hidden = true;
    view.status.dataset.error = 'true';
    view.status.textContent = renderer
      ? 'Не удалось показать модель. Файлы для печати доступны для скачивания.'
      : 'WebGL недоступен. Модель можно скачать или рассмотреть на изображениях.';
  }
  return cleanup;
}
