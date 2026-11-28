import * as THREE from '../vendor/three/build/three.module.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from '../vendor/three/examples/jsm/loaders/STLLoader.js';

export function printableParts(product) {
  return (product.stl || []).filter((entry) => typeof entry?.file === 'string' && /\.stl$/i.test(entry.file));
}

function productLoader(base) {
  const folder = new URL(base, document.baseURI);
  if (!folder.pathname.endsWith('/')) folder.pathname += '/';
  if (folder.origin !== location.origin) throw new Error('Нет локальной папки модели.');
  const resolve = (file) => {
    const url = new URL(file, folder);
    if (url.origin !== folder.origin || !url.pathname.startsWith(folder.pathname)) {
      throw new Error('Файл находится вне папки модели.');
    }
    return url.href;
  };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => /^(data|blob):/i.test(url) ? url : resolve(url));
  return { resolve, manager };
}

export async function loadPart(base, file, color) {
  const { resolve, manager } = productLoader(base);
  const geometry = await new STLLoader(manager).loadAsync(resolve(file));
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: color || '#b1bdc4', metalness: 0.10, roughness: 0.60 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // Print files are shown with the build plate in the horizontal plane.
  return mesh;
}

export async function loadModel(base, product, parts) {
  if (product.glb) {
    try {
      const { resolve, manager } = productLoader(base);
      const gltf = await new GLTFLoader(manager).loadAsync(resolve(product.glb));
      return { object: gltf.scene, part: -1 };
    } catch (error) {
      if (!parts.length) throw error;
    }
  }
  if (!parts.length) throw new Error('Для интерактивного просмотра нужен файл GLB или STL.');
  const object = await loadPart(base, parts[0].file, product.colors?.[0]?.hex);
  return { object, part: 0 };
}

export function paintFinish(object, firstColor, isAssembly) {
  const source = new Map();
  object.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of materials) {
      if (mat?.color) source.set(mat, mat.color.clone());
    }
  });
  const marked = [...source.keys()].some((mat) => mat.userData.fgkPaint === true);
  return (hex) => {
    if (!/^#[\da-f]{6}$/i.test(hex || '')) return;
    for (const [mat, original] of source) {
      if (marked ? mat.userData.fgkPaint !== true : mat.transparent || mat.map || mat.transmission > 0) continue;
      if (isAssembly && hex.toLowerCase() === firstColor?.toLowerCase()) mat.color.copy(original);
      else mat.color.set(hex);
    }
  };
}

export function disposeModel(object) {
  object?.traverse((node) => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const value of Object.values(mat)) {
        if (!value?.isTexture) continue;
        const bitmap = value.source?.data;
        if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
        value.dispose();
      }
      mat.dispose();
    }
  });
}
