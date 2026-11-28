import { msg, StudioError } from "./copy.js";

// Quick checks before the first authenticated request. The Pages build additionally
// checks ZIP members, GLB resources and all referenced assets, including existing ones.
const checked = new WeakSet();

async function checkFile(file) {
  if (checked.has(file)) return;
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const header = new TextDecoder("latin1").decode(bytes);
  const ext = file.name.split(".").at(-1).toLowerCase();
  const view = new DataView(bytes.buffer);
  const has = (...seq) => seq.every((n, i) => bytes[i] === n);
  let ok = false;
  switch (ext) {
    case "png":
      ok = has(137, 80, 78, 71, 13, 10, 26, 10);
      break;
    case "jpg":
    case "jpeg":
      ok = has(255, 216, 255);
      break;
    case "webp":
      ok = header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
      break;
    case "avif":
      ok = header.slice(4, 8) === "ftyp" && /avi[fs]/.test(header.slice(8, 64));
      break;
    case "zip":
      ok = has(80, 75, 3, 4);
      break;
    case "glb":
      ok =
        bytes.length >= 20 &&
        header.startsWith("glTF") &&
        view.getUint32(4, true) === 2 &&
        view.getUint32(8, true) === file.size &&
        header.slice(16, 20) === "JSON";
      break;
    case "stl":
      ok =
        (bytes.length > 84 && 84 + 50 * view.getUint32(80, true) === file.size) ||
        (/^\s*solid/i.test(header) && /facet/i.test(header));
      break;
  }
  if (!ok) throw new StudioError(msg("badContent", { name: file.name, format: ext.toUpperCase() }));
  checked.add(file);
}
export async function checkUploads(files) {
  for (const file of files) await checkFile(file);
}
