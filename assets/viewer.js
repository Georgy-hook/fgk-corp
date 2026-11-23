import * as THREE from '../vendor/three/build/three.module.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from '../vendor/three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';

const colorPattern = /^#?([\da-f]{6})$/i;

function assetUrl(base, file) {
  const folder = base instanceof URL ? new URL(base.href) : new URL(base, document.baseURI);
  if (!folder.pathname.endsWith('/')) folder.pathname += '/';
  return new URL(file, folder).href;
}

function createControls(documentRef, product) {
  const root = documentRef.createElement('div');
  root.className = 'fgk-viewer';

  const stage = documentRef.createElement('div');
  stage.className = 'fgk-viewer__stage';
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', `3D-просмотр модели «${product.name || 'изделие'}»`);

  const canvas = documentRef.createElement('canvas');
  canvas.className = 'fgk-viewer__canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Интерактивная 3D-модель «${product.name || 'изделие'}»`);
  stage.append(canvas);

  const status = documentRef.createElement('p');
  status.className = 'fgk-viewer__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Загружаем модель…';
  stage.append(status);
  root.append(stage);

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'fgk-viewer__toolbar';

  const palette = documentRef.createElement('div');
  palette.className = 'fgk-viewer__palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Цвет модели');
  toolbar.append(palette);

  const actions = documentRef.createElement('div');
  actions.className = 'fgk-viewer__actions';
  toolbar.append(actions);

  function addAction(label, text, className, onClick) {
    const button = documentRef.createElement('button');
    button.className = `fgk-viewer__button ${className || ''}`.trim();
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = text;
    button.addEventListener('click', onClick);
    actions.append(button);
    return button;
  }

  root.append(toolbar);
  return { root, stage, canvas, status, palette, addAction };
}

function setStatus(status, message, isError = false) {
  status.textContent = message;
  status.classList.toggle('fgk-viewer__status--error', isError);
}

function getStlFiles(product) {
  return (Array.isArray(product.stl) ? product.stl : [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.file))
    .filter((file) => typeof file === 'string' && /\.stl$/i.test(file));
}

async function loadModel(base, product) {
  if (product.glb) {
    try {
      const folder = new URL(assetUrl(base, '.'));
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (/^(data|blob):/i.test(url)) return url;
        const resource = new URL(url, folder);
        if (resource.origin !== folder.origin || !resource.pathname.startsWith(folder.pathname)) {
          throw new Error('Модель ссылается на файл вне каталога товара.');
        }
        return resource.href;
      });
      const gltf = await new GLTFLoader(manager).loadAsync(assetUrl(base, product.glb));
      return { object: gltf.scene, animations: gltf.animations };
    } catch (error) {
      const stlFiles = getStlFiles(product);
      if (!stlFiles.length) throw error;
    }
  }

  const stlFiles = getStlFiles(product);
  if (!stlFiles.length) {
    throw new Error('Для интерактивного просмотра добавьте файл GLB или STL.');
  }

  let lastError;
  for (const file of stlFiles) {
    try {
      const geometry = await new STLLoader().loadAsync(assetUrl(base, file));
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: product.colors?.[0]?.hex || '#aeb9c3',
        metalness: 0.14,
        roughness: 0.58,
      });
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Не удалось открыть файл STL.');
}

function applyColor(object, hex) {
  const match = colorPattern.exec(hex || '');
  if (!match) return;
  const color = `#${match[1]}`;
  object.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material?.color) material.color.set(color);
    }
  });
}

function disposeObject(object) {
  object?.traverse((node) => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) {
          const bitmap = value.source?.data;
          if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
          value.dispose();
        }
      }
      material.dispose();
    }
  });
}

function errorMessage(error) {
  if (typeof WebGLRenderingContext === 'undefined') {
    return 'Просмотр 3D-модели недоступен в этом браузере. Файлы для заказа доступны ниже.';
  }
  if (error?.message?.includes('WebGL')) {
    return 'Для 3D-просмотра включите поддержку WebGL. Файлы для заказа доступны ниже.';
  }
  if (error?.message?.includes('интерактивного просмотра')) return error.message;
  return 'Не удалось загрузить превью. Файлы для заказа доступны ниже.';
}

/** Mounts a model viewer into a catalogue card and resolves to its cleanup function. */
export async function mountViewer(container, { base, product }) {
  const documentRef = container.ownerDocument || document;
  const controlsView = createControls(documentRef, product);
  container.replaceChildren(controlsView.root);

  let renderer;
  let controls;
  let resizeObserver;
  let resizeHandler;
  let frameId = 0;
  let model;
  let disposed = false;
  let selectedColor = product.selectedColor || null;

  function chooseColor(hex, name, notify = false) {
    const match = colorPattern.exec(hex || '');
    if (!match || !model) return;
    selectedColor = `#${match[1]}`;
    applyColor(model, selectedColor);
    for (const swatch of controlsView.palette.querySelectorAll('.fgk-viewer__swatch')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.hex?.toLowerCase() === selectedColor.toLowerCase()));
    }
    requestRender();
    if (notify) {
      container.dispatchEvent(new documentRef.defaultView.CustomEvent('fgk:viewer-color', {
        bubbles: true,
        detail: { hex: selectedColor, name: name || 'Выбранный цвет' },
      }));
    }
  }

  function receiveColor(event) {
    const { hex, name } = event.detail || {};
    selectedColor = hex || selectedColor;
    chooseColor(hex, name);
  }

  container.addEventListener('fgk:viewer-color', receiveColor);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (frameId) cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    container.removeEventListener('fgk:viewer-color', receiveColor);
    controls?.removeEventListener('change', requestRender);
    controls?.dispose();
    disposeObject(model);
    renderer?.dispose();
    renderer?.domElement.remove();
    controlsView.root.remove();
  };

  function requestRender() {
    if (disposed || frameId || !renderer || !controls) return;
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
    });
  }

  let scene;
  let camera;
  try {
    const loaded = await loadModel(base, product);
    model = loaded.object;
    if (disposed || !container.isConnected) {
      cleanup();
      return cleanup;
    }

    renderer = new THREE.WebGLRenderer({ canvas: controlsView.canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x46515e, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9ebcf0, 1.4);
    fillLight.position.set(-5, 2, -3);
    scene.add(fillLight);

    const initialColor = selectedColor || product.colors?.[0]?.hex;
    if (initialColor) applyColor(model, initialColor);
    scene.add(model);

    const bounds = new THREE.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.01);
    const target = sphere.center;
    camera = new THREE.PerspectiveCamera(38, 1, Math.max(radius / 1000, 0.00001), radius * 100);
    camera.position.copy(target).add(new THREE.Vector3(radius * 1.55, radius * 0.95, radius * 1.65));
    camera.lookAt(target);

    controls = new OrbitControls(camera, controlsView.canvas);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = radius * 0.12;
    controls.maxDistance = radius * 9;
    controls.target.copy(target);
    controls.listenToKeyEvents(controlsView.canvas);
    controls.addEventListener('change', requestRender);

    const initialPosition = camera.position.clone();
    controlsView.addAction('Приблизить модель', '+', 'fgk-viewer__button--symbol', () => {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(0.8);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    });
    controlsView.addAction('Отдалить модель', '−', 'fgk-viewer__button--symbol', () => {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(1.25);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    });
    controlsView.addAction('Сбросить ракурс', 'Сбросить', '', () => {
      camera.position.copy(initialPosition);
      controls.target.copy(target);
      controls.update();
      requestRender();
    });

    const paletteItems = Array.isArray(product.colors) ? product.colors : [];
    if (paletteItems.length) {
      paletteItems.forEach((color, index) => {
        const match = colorPattern.exec(color.hex || '');
        if (!match) return;
        const button = documentRef.createElement('button');
        button.className = 'fgk-viewer__swatch';
        button.type = 'button';
        const swatchHex = `#${match[1]}`;
        button.dataset.hex = swatchHex;
        button.style.setProperty('--swatch-color', swatchHex);
        button.setAttribute('aria-label', `Цвет: ${color.name || `вариант ${index + 1}`}`);
        button.setAttribute('aria-pressed', String((selectedColor || paletteItems[0]?.hex || '').toLowerCase() === swatchHex.toLowerCase()));
        button.title = color.name || `Вариант ${index + 1}`;
        button.addEventListener('click', () => {
          chooseColor(color.hex, color.name, true);
        });
        controlsView.palette.append(button);
      });
      controlsView.palette.hidden = Boolean(product.externalColors) || !controlsView.palette.childElementCount;
    } else {
      controlsView.palette.hidden = true;
    }

    resizeHandler = () => {
      const bounds = controlsView.stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
      requestRender();
    };
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resizeHandler);
      resizeObserver.observe(controlsView.stage);
    } else {
      window.addEventListener('resize', resizeHandler);
    }
    resizeHandler();
    setStatus(controlsView.status, 'Вращайте модель мышью или касанием.');
  } catch (error) {
    resizeObserver?.disconnect();
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    controls?.removeEventListener('change', requestRender);
    controls?.dispose();
    controls = undefined;
    if (renderer) renderer.dispose();
    renderer = undefined;
    disposeObject(model);
    model = undefined;
    setStatus(controlsView.status, errorMessage(error), true);
    controlsView.canvas.hidden = true;
    controlsView.palette.hidden = true;
  }

  return cleanup;
}
