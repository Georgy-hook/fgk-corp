// Ownership is per loaded model, never per mesh. glTF primitives and paint
// variants often share the same geometry, texture, or decoded ImageBitmap.
export function resourceOwner() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const shadows = new Set();
  const skeletons = new Set();

  function collect(root) {
    if (root?.environment?.isTexture) textures.add(root.environment);
    root?.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.shadow) shadows.add(node.shadow);
      if (node.skeleton) skeletons.add(node.skeleton);
      if (Array.isArray(node.material)) node.material.forEach((mat) => materials.add(mat));
      else if (node.material) materials.add(node.material);
    });
  }

  function dispose() {
    const images = new Set();
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) {
      const image = texture.source?.data;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image);
      texture.dispose();
    }
    for (const image of images) image.close();
    for (const skeleton of skeletons) skeleton.dispose();
    for (const shadow of shadows) shadow.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const set of [materials, textures, skeletons, shadows, geometries]) set.clear();
  }

  return { collect, materials, dispose };
}
