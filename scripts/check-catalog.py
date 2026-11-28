"""Validate catalog folders and build the combined feed used by FGK Corp."""

import argparse
import shutil
from pathlib import Path

from catalog_data import CATALOG, check_product, product_slugs, require, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--output", type=Path, help="Write the combined JSON feed (local server)")
    mode.add_argument("--site-catalog", type=Path, help="Package approved products and both feeds for Pages")
    args = parser.parse_args()
    slugs = product_slugs(CATALOG)
    require(slugs, "The catalog must contain at least one product")
    products = [check_product(slug, CATALOG / slug) for slug in slugs]
    if args.site_catalog:
        target = args.site_catalog.resolve()
        require(not target.is_relative_to(CATALOG) and not target.exists(), "Use a new build directory outside catalog")
        for slug in slugs:
            folder = CATALOG / slug
            require(not any(path.is_symlink() for path in folder.rglob("*")), f"{slug}: symbolic links are not published")
            shutil.copytree(folder, target / slug, ignore=shutil.ignore_patterns(".*", "__pycache__"))
        write_json(target / "index.json", slugs)
        write_json(target / "products.json", products, compact=True)
    elif args.output:
        write_json(args.output, products, compact=True)
    print(f"Catalog verified: {len(slugs)} product(s)")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
