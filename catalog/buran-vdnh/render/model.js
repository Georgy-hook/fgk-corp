export async function geometry(signal) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('scene.browser');
  }
  const response = await fetch('assets/buran.glb.gz', { signal });
  if (!response.ok || !response.body) throw new Error('scene.fetch');
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    head.getUint32(0, true) !== 0x46546c67 ||
    head.getUint32(4, true) !== 2 ||
    head.getUint32(8, true) !== bytes.length
  ) {
    throw new Error('scene.invalid');
  }
  return bytes.buffer;
}

export function register(T, scene, gltf, catalog) {
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
    if (!node) throw new Error('scene.part');
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
    if (!part.surfaces.length) throw new Error('scene.surface');
    part.bounds = new T.Box3().setFromObject(part.node);
    // The packed exhibit carries the original framing cloud, in assembled world metres.
    const cloud = part.node.userData.buranSupportPoints;
    part.points =
      Array.isArray(cloud) &&
      cloud.length === 26 &&
      cloud.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
        ? cloud.map((p) => new T.Vector3(...p))
        : window.BuranStudio.supportPoints(T, part.surfaces);
    part.hinge = window.BuranStudio.hingeFor(T, part, part.articulation);
  }
  return { parts, owners };
}
