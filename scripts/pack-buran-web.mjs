// Build-time only. No external decoder or npm dependency on the site.
// From the repository root (Node 22+):
//   T=$(mktemp -d); npm install --prefix "$T" --ignore-scripts meshoptimizer@1.0.1
//   git show 23c7cd0381960e90a94ec358c798ad06cafefc67:catalog/buran-vdnh/assets/buran.glb.gz > "$T/source.gz"
//   node scripts/pack-buran-web.mjs "$T/source.gz" "$T/web.glb.gz" "$T/node_modules/meshoptimizer"
// Once those two inputs exist, the conversion runs completely offline.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const [source, destination, tools] = process.argv.slice(2);
assert(source && destination && tools, 'Expected: source.glb.gz output.glb.gz meshoptimizer-directory');
assert.equal(JSON.parse(readFileSync(resolve(tools, 'package.json'))).version, '1.0.1');
const { MeshoptSimplifier: simplifier } = await import(pathToFileURL(resolve(tools, 'meshopt_simplifier.js')));
const { MeshoptEncoder: encoder } = await import(pathToFileURL(resolve(tools, 'meshopt_encoder.js')));
await simplifier.ready;
await encoder.ready;
assert(statSync(source).size <= 26_000_000);
const raw = gunzipSync(readFileSync(source), { maxOutputLength: 68_000_000 });
// Deliberately not a general glTF parser. Reject a changed scene, buffer layout,
// material, pivot etc. rather than quietly stripping an unsupported feature.
assert.equal(createHash('sha256').update(raw).digest('hex'),
  'd94f498e6d56b1a9455e478d56ec3d875bde779e09dcba77cbbca877f4b3fcf6');
const jsonEnd = 20 + raw.readUInt32LE(12);
const original = JSON.parse(raw.subarray(20, jsonEnd));
const data = raw.byteOffset + jsonEnd + 8;
const out = { ...original, nodes: [], meshes: [], materials: [], bufferViews: [], accessors: [] };
out.extensionsUsed = ['KHR_mesh_quantization'];
out.extensionsRequired = [...out.extensionsUsed];
const chunks = [];
let length = 0;

function accessor(array, count, componentType, type, target, extra = {}, view = {}) {
  const pad = (4 - length % 4) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  length += pad;
  const bufferView = out.bufferViews.length;
  out.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: array.byteLength, target, ...view });
  chunks.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  length += array.byteLength;
  return out.accessors.push({ bufferView, count, type, componentType, ...extra }) - 1;
}

function glbChunk(buffer, type, padding) {
  const pad = Buffer.alloc((4 - buffer.length % 4) % 4, padding);
  const head = Buffer.alloc(8);
  head.writeUInt32LE(buffer.length + pad.length);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, buffer, pad]);
}

function unpack(p) {
  const pos = original.accessors[p.attributes.POSITION];
  const idx = original.accessors[p.indices];
  const offset = acc => data + original.bufferViews[acc.bufferView].byteOffset;
  const attributes = new Float32Array(raw.buffer, offset(pos), pos.count * 6);
  const Index = idx.componentType === 5123 ? Uint16Array : Uint32Array;
  const indices = Uint32Array.from(new Index(raw.buffer, offset(idx), idx.count));
  const material = original.materials[p.material];
  return { pos, attributes, indices, material };
}

// Match the *old viewer's* support sampling, including traversal order and
// first-wins ties, before changing the vertex stream. All 18 transforms are identity.
const axes = [];
for (let a = 0; a < 8; ++a) {
  for (const h of [-1, 0, 1]) axes.push([Math.cos(a * Math.PI / 4), h, Math.sin(a * Math.PI / 4)]);
}
axes.push([0, 1, 0], [0, -1, 0]);
function supportPoints(pieces) {
  const best = axes.map(() => -Infinity);
  const points = [];
  for (const { attributes: v, pos } of pieces) {
    const step = Math.max(1, Math.ceil(pos.count / 5000));
    for (let i = 0; i < pos.count; i += step) {
      const [x, y, z] = v.subarray(6 * i, 6 * i + 3);
      axes.forEach(([u, h, w], a) => {
        const dot = x * u + y * h + z * w;
        if (dot > best[a]) {
          best[a] = dot;
          points[a] = [x, y, z];
        }
      });
    }
  }
  return points;
}

function keyOf(v, offset) {
  return `${v[offset]},${v[offset + 1]},${v[offset + 2]}`;
}

// Pin matching points of different source materials, as well as each source
// primitive's six bounds. Small inserts and glass are left completely intact.
function compact(piece, seams) {
  const { attributes: v, pos, material } = piece;
  let { indices } = piece;
  let error = 0;
  if (indices.length > 6000 && material.pbrMetallicRoughness.roughnessFactor >= 0.5) {
    const normals = new Float32Array(pos.count * 3);
    const locks = new Uint8Array(pos.count);
    const extrema = new Set();
    for (let i = 0; i < pos.count; ++i) {
      const j = 6 * i;
      normals.set(v.subarray(j + 3, j + 6), 3 * i);
      if (seams.has(keyOf(v, j))) locks[i] = 1;
      for (let k = 0; k < 3; ++k) {
        for (const bound of ['min', 'max']) {
          const face = `${bound}${k}`;
          if (!extrema.has(face) && v[j + k] === pos[bound][k]) {
            locks[i] = 1;
            extrema.add(face);
          }
        }
      }
    }
    // Attribute-aware QEM in metres. No floating-point position is moved, no
    // disconnected component pruning, no sloppy/permissive seam collapse.
    [indices, error] = simplifier.simplifyWithAttributes(indices, v, 6, normals, 3,
      [1, 1, 1], locks, Math.floor(indices.length / 15) * 3, 0.000012, ['ErrorAbsolute']);
  }
  const [remap, count] = encoder.reorderMesh(indices, true, false);
  return { ...piece, indices, remap, count, error };
}

const materialIds = new Map();
function materialIndex(material) {
  const key = JSON.stringify(material);
  if (!materialIds.has(key)) materialIds.set(key, out.materials.push(material) - 1);
  return materialIds.get(key);
}

// All colours in input baseColorFactor and output COLOR_0 are linear, not
// display sRGB. White material × vertex colour preserves the original shell
// tint multiplication. Keep the existing name-based paint predicate working.
const grid = 0.0000024; // metres; one common lattice means no cracks across parts.
function assemble(group, origin) {
  const mixed = group.some(p => p.material.name !== group[0].material.name);
  let mat = group[0].material;
  if (mixed) {
    mat = { name: group[0].paintable ? '#ffffff' : 'Fixed finish',
      pbrMetallicRoughness: { ...mat.pbrMetallicRoughness, baseColorFactor: [1, 1, 1, 1] } };
  }
  const count = group.reduce((n, p) => n + p.count, 0);
  const positions = new Uint16Array(count * 4);
  // Normalized SHORT is read directly by WebGL: 16-bit unit components, with
  // a fourth short for glTF's required four-byte vertex alignment.
  const normals = new Int16Array(count * 4);
  const colors = mixed ? new Uint16Array(count * 4) : null;
  const Index = count < 65536 ? Uint16Array : Uint32Array;
  const idx = new Index(group.reduce((n, p) => n + p.indices.length, 0));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let start = 0;
  let cursor = 0;
  for (const { pos, attributes: v, indices, remap, count: used, material } of group) {
    const color = material.pbrMetallicRoughness.baseColorFactor.map(x => Math.round(x * 65535));
    // Remaps end at the highest *surviving* index, not the old vertex count.
    for (let i = 0; i < remap.length; ++i) {
      if (remap[i] === 0xffffffff) continue;
      const dest = start + remap[i];
      for (let k = 0; k < 3; ++k) {
        positions[dest * 4 + k] = Math.round(v[i * 6 + k] / grid) - origin[k];
        normals[dest * 4 + k] = Math.round(Math.max(-1, Math.min(1, v[i * 6 + 3 + k])) * 32767);
      }
      if (mixed) colors.set(color, dest * 4);
    }
    for (const i of indices) idx[cursor++] = start + i;
    start += used;
    for (let k = 0; k < 3; ++k) {
      min[k] = Math.min(min[k], Math.round(pos.min[k] / grid) - origin[k]);
      max[k] = Math.max(max[k], Math.round(pos.max[k] / grid) - origin[k]);
      assert(min[k] >= 0 && max[k] <= 65535);
    }
  }
  const attributes = {
    POSITION: accessor(positions, count, 5123, 'VEC3', 34962,
      { min, max, normalized: true }, { byteStride: 8 }),
    NORMAL: accessor(normals, count, 5122, 'VEC3', 34962, { normalized: true }, { byteStride: 8 }),
  };
  if (mixed) attributes.COLOR_0 = accessor(colors, count, 5123, 'VEC4', 34962, { normalized: true });
  return { attributes, indices: accessor(idx, idx.length, Index === Uint16Array ? 5123 : 5125,
    'SCALAR', 34963), material: materialIndex(mat), mode: 4 };
}

const stats = [];
const frames = [];
for (const node of original.nodes) {
  const mesh = original.meshes[node.mesh];
  const pieces = mesh.primitives.map(unpack);
  // Leave the original named/world pivot untransformed. Only its mesh child
  // decodes quantized positions. Uniform scale keeps normals and hinges rigid.
  const origin = [0, 1, 2].map(k => Math.round(Math.min(...pieces.map(p => p.pos.min[k])) / grid));
  out.nodes.push({ name: node.name, children: [original.nodes.length + frames.length],
    extras: { buranSupportPoints: supportPoints(pieces) } });
  frames.push({ mesh: node.mesh, translation: origin.map(v => v * grid), scale: Array(3).fill(65535 * grid) });
  const owners = new Map();
  const seams = new Set();
  for (const [p, { attributes: v }] of pieces.entries()) {
    for (let j = 0; j < v.length; j += 6) {
      const key = keyOf(v, j);
      if (!owners.has(key)) owners.set(key, p);
      else if (owners.get(key) !== p) seams.add(key);
    }
  }
  owners.clear();
  const groups = new Map();
  const fixed = ['Plinth', 'GearFront', 'BogiePort', 'BogieStarboard'].includes(node.name);
  for (const p of pieces) {
    const paintable = !fixed && /^#[d-f][0-9a-f]{5}$/i.test(p.material.name);
    const { metallicFactor, roughnessFactor } = p.material.pbrMetallicRoughness;
    const key = `${paintable}:${metallicFactor}:${roughnessFactor}`;
    if (!groups.has(key)) groups.set(key, []);
    const packed = compact(p, seams);
    groups.get(key).push({ ...packed, paintable });
    stats.push({ input: p.indices.length / 3, output: packed.indices.length / 3, error: packed.error });
  }
  // Batch without crossing the 16-bit index limit when possible. A single
  // large CAD primitive can still use a 32-bit index stream.
  const batches = [];
  for (const group of groups.values()) {
    let batch = [];
    let count = 0;
    for (const piece of group) {
      if (batch.length && count + piece.count > 65535) {
        batches.push(batch);
        batch = [];
        count = 0;
      }
      batch.push(piece);
      count += piece.count;
    }
    batches.push(batch);
  }
  out.meshes.push({ ...mesh, primitives: batches.map(batch => assemble(batch, origin)) });
}
out.nodes.push(...frames);
out.buffers = [{ byteLength: length }];
const json = glbChunk(Buffer.from(JSON.stringify(out)), 'JSON', 32);
const bin = glbChunk(Buffer.concat(chunks), 'BIN\0', 0);
const header = Buffer.from(raw.subarray(0, 12));
header.writeUInt32LE(header.length + json.length + bin.length, 8);
const glb = Buffer.concat([header, json, bin]);
const gz = gzipSync(glb, { level: 9 });
writeFileSync(destination, gz);
console.log(JSON.stringify({ raw: glb.length, gzip: gz.length,
  draws: out.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0),
  triangles: stats.reduce((n, s) => n + s.output, 0),
  maxQemMetres: Math.max(...stats.map(s => s.error)) }, null, 2));
