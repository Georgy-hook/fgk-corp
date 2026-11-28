import { validSlug, buildDocument } from "./product.js";
const indexPath = "catalog/index.json";
function slugsOf(value) {
  if (
    !Array.isArray(value) ||
    !value.every(validSlug) ||
    new Set(value).size !== value.length
  )
    throw new Error(
      "Проверьте catalog/index.json: адреса должны быть допустимыми и уникальными.",
    );
  return value;
}
async function getPublic(path) {
  const res = await fetch(`../catalog/${path}`, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!res.ok)
    throw new Error(
      "Не удалось прочитать публичный каталог. Проверьте сеть и повторите.",
    );
  return res.json();
}
export async function publicProduct(slug) {
  if (!validSlug(slug)) throw new Error("Недопустимый адрес карточки.");
  return getPublic(`${slug}/product.json`);
}
export async function publicCatalog() {
  // Pages supplies one assembled document. A plain local checkout has only the index.
  try {
    const bundle = await getPublic("products.json");
    slugsOf(bundle.map((p) => p.slug));
    return bundle;
  } catch {
    const slugs = slugsOf(await getPublic("index.json"));
    const items = [];
    for (let i = 0; i < slugs.length; i += 8) {
      const batch = slugs.slice(i, i + 8).map(async (slug) => {
        try {
          return { ...(await publicProduct(slug)), slug };
        } catch {
          return { slug };
        }
      });
      items.push(...(await Promise.all(batch)));
    }
    return items;
  }
}
export async function indexAt(repo, snapshot) {
  const index = await repo.readJsonFile(snapshot, indexPath);
  const ordered = index.exists ? slugsOf(index.value) : [];
  const extra = [];
  for (const [path, entry] of snapshot.files) {
    const parts = path.split("/");
    if (
      parts.length === 3 &&
      parts[0] === "catalog" &&
      validSlug(parts[1]) &&
      parts[2] === "product.json" &&
      entry.type === "blob"
    )
      extra.push(parts[1]);
  }
  return { ordered, all: [...new Set([...ordered, ...extra.sort()])] };
}
export async function readProduct(repo, snapshot, slug) {
  const file = await repo.readJsonFile(
    snapshot,
    `catalog/${slug}/product.json`,
  );
  if (
    !file.exists ||
    !file.value ||
    typeof file.value !== "object" ||
    Array.isArray(file.value)
  )
    throw new Error("В выбранной папке main нет карточки product.json.");
  return file;
}
export function trackMedia(draft, snapshot) {
  const base = draft.base;
  if (!base || draft.mediaVersion) return;
  const paths = [
    base.image,
    base.glb,
    ...(base.gallery ?? []),
    ...(base.stl ?? []).map((x) => x.file),
  ].filter(Boolean);
  draft.mediaVersion = new Map(
    paths.map((path) => [
      path,
      snapshot.files.get(`catalog/${draft.slug}/${path}`)?.sha,
    ]),
  );
}
export async function publish(repo, d, progress) {
  progress("Проверяем карточку в текущей версии main…");
  const snapshot = await repo.getSnapshot();
  const { ordered, all } = await indexAt(repo, snapshot);
  const root = `catalog/${d.slug}/`,
    path = `${root}product.json`;
  const current = await repo.readJsonFile(snapshot, path);
  if (d.base) {
    // Before signing in we have published metadata, not a Git SHA. Compare the complete base document.
    if (
      !current.exists ||
      (d.sha
        ? d.sha !== current.sha
        : JSON.stringify(current.value) !== JSON.stringify(d.base))
    )
      throw new Error(
        "Карточка изменилась в main. Черновик сохранён. Сверьте изменения и перечитайте версию из main.",
      );
  } else if (
    current.exists ||
    all.includes(d.slug) ||
    [...snapshot.files.keys()].some((p) => p.startsWith(root))
  ) {
    throw new Error(
      "Адрес или папка в main уже заняты. Выберите другой адрес.",
    );
  }
  const { value, assets } = buildDocument(d, new Set(snapshot.files.keys()));
  // When switching an existing reference, also protect edits to the file itself.
  const retained = new Set([
    value.image,
    value.glb,
    ...(value.gallery ?? []),
    ...value.stl.map((x) => x.file),
  ]);
  const newPaths = new Set(assets.map((asset) => asset.path));
  for (const ref of [
    ...retained,
    value.viewer?.split("?")[0],
    value.exhibit,
  ].filter(Boolean)) {
    if (!newPaths.has(root + ref) && !snapshot.files.has(root + ref))
      throw new Error(
        "В main не хватает файла текущей карточки. Проверьте комплект до публикации.",
      );
  }
  for (const [ref, sha] of d.mediaVersion ?? []) {
    if (!retained.has(ref) && snapshot.files.get(root + ref)?.sha !== sha)
      throw new Error(
        "Один из заменяемых файлов изменился в main. Перечитайте версию карточки.",
      );
  }
  const changes = [...assets];
  const json = (p, doc) => ({
    path: p,
    content: JSON.stringify(doc, null, 2) + "\n",
  });
  changes.push(json(path, value));
  // Leave editorial ordering untouched on edits; discovered folders are included by the build.
  if (!d.base) changes.push(json(indexPath, [...ordered, d.slug]));
  const sha = await repo.commitFiles(snapshot, changes, progress);
  return { sha, value };
}
