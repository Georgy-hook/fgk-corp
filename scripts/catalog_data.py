"""The on-disk product contract used by the importer and the Pages build."""

import json
import re
import struct
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import BadZipFile, ZipFile

CATALOG = Path(__file__).resolve().parents[1] / "catalog"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
HEX = re.compile(r"#[0-9a-fA-F]{6}")
IMAGES = {".avif", ".jpg", ".jpeg", ".png", ".webp"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: {error}") from error


def write_json(path, value, *, compact=False):
    options = {"separators": (",", ":")} if compact else {"indent": 2}
    path.write_text(json.dumps(value, ensure_ascii=False, **options) + "\n", encoding="utf-8")


def product_slugs(catalog):
    """The optional index pins items first; dropping a product folder is sufficient."""
    index = catalog / "index.json"
    pinned = read_json(index) if index.is_file() else []
    require(isinstance(pinned, list), f"{index}: expected an array")
    discovered = sorted(
        path.parent.name for path in catalog.glob("*/product.json")
        if not path.parent.name.startswith(".")
    )
    for slug in [*pinned, *discovered]:
        require(isinstance(slug, str) and SLUG.fullmatch(slug), f"Invalid product slug: {slug!r}")
        require(not (catalog / slug).is_symlink(), f"{slug}: linked product folder")
    require(len(set(pinned)) == len(pinned), f"{index}: duplicate product slug")
    pinned_set = set(pinned)
    return [*pinned, *(slug for slug in discovered if slug not in pinned_set)]


def text(obj, field):
    return isinstance(obj, dict) and isinstance(obj.get(field), str) and bool(obj[field].strip())


def validate_media(file):
    size = file.stat().st_size
    require(0 < size <= 100 * 1024 * 1024, f"{file}: empty or over the GitHub file limit")
    ext = file.suffix.lower()
    with file.open("rb") as source:
        head = source.read(1024)
        if ext == ".stl":
            binary = size > 84 and size == 84 + 50 * int.from_bytes(head[80:84], "little")
            ascii_stl = head.lstrip().lower().startswith(b"solid") and b"facet" in head.lower()
            require(binary or ascii_stl, f"{file}: not a printable STL file")
        elif ext == ".glb":
            require(len(head) >= 20 and head[:8] == b"glTF\x02\x00\x00\x00", f"{file}: expected GLB 2.0")
            length, chunk, kind = struct.unpack_from("<II4s", head, 8)
            require(length == size and 0 < chunk <= size - 20 and kind == b"JSON", f"{file}: invalid GLB header")
            source.seek(20)
            scene = json.loads(source.read(chunk))
            require(isinstance(scene, dict) and scene.get("meshes"), f"{file}: missing glTF meshes")
            for resource in [*scene.get("buffers", []), *scene.get("images", [])]:
                uri = resource.get("uri", "")
                require(not uri or str(uri).startswith("data:"), f"{file}: export GLB with embedded resources")
        elif ext == ".zip":
            try:
                with ZipFile(file) as archive:
                    has_stl = any(
                        item.filename.lower().endswith(".stl") and item.file_size > 0
                        and not any(part.startswith((".", "__MACOSX")) for part in item.filename.split("/"))
                        for item in archive.infolist()
                    )
                    require(has_stl, f"{file}: no STL in ZIP")
            except BadZipFile as error:
                raise ValueError(f"{file}: invalid ZIP") from error
        elif ext in IMAGES:
            image_ok = {
                ".webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP",
                ".png": head.startswith(b"\x89PNG\r\n\x1a\n"),
                ".jpg": head.startswith(b"\xff\xd8\xff"),
                ".jpeg": head.startswith(b"\xff\xd8\xff"),
                ".avif": head[4:8] == b"ftyp" and (b"avif" in head[8:64] or b"avis" in head[8:64]),
            }
            require(image_ok[ext], f"{file}: image content does not match its extension")


def asset(folder, value, extensions, *, allow_query=False):
    require(isinstance(value, str) and value, f"{folder}: missing asset path")
    url = urlsplit(value)
    require(not url.scheme and not url.netloc and not url.fragment, f"Invalid asset: {value}")
    require(allow_query or not url.query, f"Unexpected query: {value}")
    parts = url.path.split("/")
    require(all(re.fullmatch(r"[\w-][\w.-]*", part) for part in parts), f"Invalid local asset path: {value}")
    path = folder.joinpath(*parts)
    require(path.resolve().is_relative_to(folder.resolve()), f"{value}: outside product directory")
    require(path.is_file() and path.suffix.lower() in extensions, f"Missing or invalid asset: {path}")
    validate_media(path)


def check_product(slug, folder):
    product = read_json(folder / "product.json")
    for field in ("name", "category", "description"):
        require(text(product, field), f"{slug}: missing {field}")
    for field in ("gallery", "stl", "colors", "details"):
        require(isinstance(product.get(field, []), list), f"{slug}: {field} must be an array")
    asset(folder, product.get("image"), IMAGES)
    for image in product.get("gallery", []):
        asset(folder, image, IMAGES)
    downloads = product.get("stl", [])
    require(downloads, f"{slug}: no STL downloads")
    for entry in downloads:
        require(text(entry, "label"), f"{slug}: missing STL label")
        asset(folder, entry.get("file"), {".stl", ".zip"})
    for entry in product.get("colors", []):
        require(text(entry, "name") and text(entry, "hex") and HEX.fullmatch(entry["hex"]), f"{slug}: invalid paint")
    for entry in product.get("details", []):
        require(text(entry, "label") and text(entry, "value"), f"{slug}: incomplete specification")
    for field, ext in (("glb", ".glb"), ("usdz", ".usdz"), ("viewer", ".html"), ("exhibit", ".html")):
        if product.get(field):
            asset(folder, product[field], {ext}, allow_query=field == "viewer")
    direct_stl = any(entry["file"].lower().endswith(".stl") for entry in downloads)
    require(product.get("viewer") or product.get("glb") or direct_stl, f"{slug}: ZIP needs a GLB preview")
    return {**product, "slug": slug}
