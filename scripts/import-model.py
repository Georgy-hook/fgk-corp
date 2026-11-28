"""Import one product from a folder of print files and images. Never publish or replace a product."""

import argparse
import shutil
import tempfile
from pathlib import Path

from catalog_data import CATALOG, HEX, IMAGES, SLUG, check_product, require, write_json


def paint(value):
    name, _, color = value.rpartition("=")
    if not name.strip() or not HEX.fullmatch(color):
        raise argparse.ArgumentTypeError("Use --color 'Название=#rrggbb'")
    return {"name": name.strip(), "hex": color.lower()}


def import_product(args, catalog):
    require(SLUG.fullmatch(args.slug), "--slug: use lower-case letters, numbers and hyphens")
    target = catalog / args.slug
    require(not target.exists() and not target.is_symlink(), f"Product already exists: {target}")
    files = sorted((f for f in args.folder.iterdir() if f.is_file() and not f.is_symlink() and not f.name.startswith(".")),
                   key=lambda f: (f.name.casefold(), f.name))
    images = [f for f in files if f.suffix.lower() in IMAGES]
    downloads = [f for f in files if f.suffix.lower() in {".zip", ".stl"}]
    previews = [f for f in files if f.suffix.lower() == ".glb"]
    require(images, "Add a cover: WebP, JPG, PNG or AVIF")
    if args.cover:
        covers = [f for f in images if f.name == args.cover]
    else:
        covers = images if len(images) == 1 else [f for f in images if f.stem.lower() == "cover"]
    require(len(covers) == 1, "Name one image cover.webp (or use --cover FILENAME)")
    require(downloads, "Add at least one STL or ZIP containing STL files")
    require(len(previews) <= 1, "Use one assembled GLB file for the preview")
    require(previews or any(f.suffix.lower() == ".stl" for f in downloads), "ZIP kits need a GLB preview")

    with tempfile.TemporaryDirectory(prefix=".fgk-import-", dir=catalog) as temp:
        staged = Path(temp) / args.slug
        staged.mkdir()

        def take(file, stem):
            require(file.stat().st_size <= 100 * 1024 * 1024, f"{file.name} exceeds the GitHub file limit")
            relative = f"{stem}{file.suffix.lower()}"
            dest = staged / relative
            dest.parent.mkdir(exist_ok=True)
            shutil.copyfile(file, dest)
            return relative

        product = {
            "name": args.name.strip(), "category": args.category.strip(), "description": args.description.strip(),
            "image": take(covers[0], "assets/cover"), "colors": args.color,
            "gallery": [take(f, f"assets/view-{i:02}") for i, f in enumerate((f for f in images if f != covers[0]), 1)],
            "stl": [{"file": take(f, f"files/{i:02}"), "label": f.name} for i, f in enumerate(downloads, 1)],
        }
        if previews:
            product["glb"] = take(previews[0], "files/preview")
        write_json(staged / "product.json", product)
        check_product(args.slug, staged)
        require(not target.exists(), f"Product already exists: {target}")
        staged.rename(target)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path, help="Folder containing images, STL/ZIP, and optionally one GLB")
    for field in ("slug", "name", "category", "description"):
        parser.add_argument(f"--{field}", required=True)
    parser.add_argument("--cover", help="Filename of the cover among the images in the folder")
    parser.add_argument("--color", action="append", type=paint, default=[], help="Repeatable: 'Name=#rrggbb'")
    args = parser.parse_args()
    try:
        folder = import_product(args, CATALOG)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Created {folder}. Check the files, then commit that folder. No index edit needed.")


if __name__ == "__main__":
    main()
