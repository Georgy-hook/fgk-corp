"""Check the static catalog and referenced files before publishing."""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
HEX = re.compile(r"#[0-9a-fA-F]{6}")
IMAGES = {".avif", ".jpg", ".jpeg", ".png", ".webp"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def check_file(folder, value, extensions, *, allow_query=False):
    require(isinstance(value, str) and value, f"{folder.name}: missing asset path")
    url = urlsplit(value)
    require(not url.scheme and not url.netloc and not url.fragment, f"Invalid asset: {value}")
    require(allow_query or not url.query, f"Unexpected query: {value}")
    path = Path(url.path)
    require(
        not path.is_absolute() and all(re.fullmatch(r"[\w.-]+", part) and part != ".." for part in path.parts),
        f"Invalid path: {value}",
    )
    file = (folder / path).resolve()
    require(file.is_relative_to(folder.resolve()), f"Asset points outside its product folder: {value}")
    require(file.suffix.lower() in extensions and file.is_file(), f"Missing or invalid asset: {file}")
    require(file.stat().st_size > 0, f"Empty asset: {file}")


def check_product(slug):
    folder = CATALOG / slug
    product = read_json(folder / "product.json")
    for field in ("name", "category", "description"):
        require(isinstance(product.get(field), str) and product[field].strip(), f"{slug}: missing {field}")

    check_file(folder, product.get("image"), IMAGES)
    for image in product.get("gallery", []):
        check_file(folder, image, IMAGES)

    stl_files = product.get("stl", [])
    require(stl_files, f"{slug}: no STL files")
    for entry in stl_files:
        require(isinstance(entry.get("label"), str) and entry["label"].strip(), f"{slug}: missing STL label")
        check_file(folder, entry.get("file"), {".stl", ".zip"})

    for color in product.get("colors", []):
        require(isinstance(color.get("name"), str) and color["name"].strip(), f"{slug}: missing color name")
        require(HEX.fullmatch(color.get("hex", "")), f"{slug}: invalid color")

    if product.get("glb"):
        check_file(folder, product["glb"], {".glb"})
    if product.get("viewer"):
        check_file(folder, product["viewer"], {".html"}, allow_query=True)
    if product.get("exhibit"):
        check_file(folder, product["exhibit"], {".html"})

    viewable_stl = any(entry["file"].lower().endswith(".stl") for entry in stl_files)
    require(product.get("viewer") or product.get("glb") or viewable_stl, f"{slug}: no 3D preview")
    return {**product, "slug": slug}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write the combined catalog used by the storefront")
    args = parser.parse_args()
    slugs = read_json(CATALOG / "index.json")
    require(isinstance(slugs, list) and slugs, "The catalog index must contain a product")
    require(all(isinstance(slug, str) and SLUG.fullmatch(slug) for slug in slugs), "Invalid product slug")
    require(len(set(slugs)) == len(slugs), "Duplicate product slug")
    products = [check_product(slug) for slug in slugs]
    if args.output:
        args.output.write_text(json.dumps(products, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Catalog verified: {len(slugs)} product(s)")


if __name__ == "__main__":
    main()
