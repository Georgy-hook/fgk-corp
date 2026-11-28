export function exhibitFinish(T, parts, owner, dirty) {
  const paint = new Map();
  const copies = new Map();
  for (const [id, part] of parts) {
    if (['Plinth', 'GearFront', 'BogiePort', 'BogieStarboard'].includes(id)) continue;
    for (const mesh of part.surfaces) {
      const material = mesh.material;
      if (!material.color || !/^#[d-f][0-9a-f]{5}$/i.test(material.name)) continue;
      if (!copies.has(material)) {
        const copy = material.clone();
        owner.materials.add(copy);
        copies.set(material, copy);
        paint.set(copy, material.color.clone());
      }
      mesh.material = copies.get(material);
    }
  }

  const highlights = new Map();
  function highlight(material) {
    if (highlights.has(material)) return highlights.get(material);
    const copy = material.clone();
    if (copy.emissive) {
      copy.emissive.set(0xe4753b);
      copy.emissiveIntensity = 0.32;
    } else {
      copy.color?.lerp(new T.Color(0xf89255), 0.45);
    }
    owner.materials.add(copy);
    highlights.set(material, copy);
    return copy;
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
  return { highlight, setPaint };
}
