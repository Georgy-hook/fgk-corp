// A draft contains only product data. Existing references stay intact unless the editor removes them.
export const validSlug = (value) =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const translit = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
export function slugify(text) {
  return [...text.toLowerCase()]
    .map((c) => translit[c] ?? c)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}
export function imageUrl(slug, path) {
  if (
    !validSlug(slug) ||
    typeof path !== "string" ||
    !path
      .split("/")
      .every(
        (part) =>
          /^[\p{L}\p{N}_.-]+$/u.test(part) && ![".", ".."].includes(part),
      )
  )
    return "";
  return `../catalog/${slug}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export const groups = {
  cover: {
    title: "Обложка",
    hint: "JPG, PNG, WebP, AVIF · до 10 МБ",
    accept: ".jpg,.jpeg,.png,.webp,.avif",
    limit: 1,
    mb: 10,
  },
  gallery: {
    title: "Галерея",
    hint: "Несколько изображений · до 10 МБ каждое",
    accept: ".jpg,.jpeg,.png,.webp,.avif",
    limit: 24,
    mb: 10,
  },
  downloads: {
    title: "Файлы для печати",
    hint: "До 64 STL или ZIP, по 70 МиБ на файл",
    accept: ".stl,.zip",
    limit: 64,
    mb: 70,
  },
  glb: {
    title: "3D-просмотр",
    hint: "Самодостаточная сборка GLB, до 70 МиБ",
    accept: ".glb",
    limit: 1,
    mb: 70,
  },
};
export function draftFrom(slug = "", base = null, sha = null) {
  const p = structuredClone(base ?? {});
  const text = (value) => typeof value === "string";
  const rows = (key, valid) =>
    !(key in p) || (Array.isArray(p[key]) && p[key].every(valid));
  if (
    typeof p !== "object" ||
    Array.isArray(p) ||
    [
      "name",
      "category",
      "description",
      "image",
      "viewer",
      "exhibit",
      "glb",
    ].some((key) => key in p && !text(p[key])) ||
    !rows("gallery", text) ||
    !rows("stl", (x) => text(x?.file) && text(x?.label)) ||
    !rows("colors", (x) => text(x?.name) && text(x?.hex)) ||
    !rows("details", (x) => text(x?.label) && text(x?.value))
  )
    throw new Error(
      "Формат полей product.json не поддерживается. Карточка не открыта для записи.",
    );
  return {
    slug,
    base,
    sha,
    name: p.name ?? "",
    category: p.category ?? "",
    description: p.description ?? "",
    slugEdited: !!base,
    dirty: false,
    colors: p.colors ?? [],
    details: p.details ?? [],
    cover: [],
    gallery: (p.gallery ?? []).map((ref) => ({ ref })),
    downloads: (p.stl ?? []).map((ref) => ({ ref })),
    glb: [],
    proofUrl: "",
    result: null,
  };
}
export function filesOf(d) {
  return Object.keys(groups).flatMap((k) =>
    d[k].map((x) => x.file).filter(Boolean),
  );
}
export function attach(d, key, newFiles) {
  const g = groups[key];
  if (!newFiles.length) return;
  if ((g.limit === 1 ? 0 : d[key].length) + newFiles.length > g.limit)
    throw new Error(`В поле «${g.title}» допустимо файлов: ${g.limit}.`);
  for (const file of newFiles) {
    if (
      !g.accept.split(",").some((ext) => file.name.toLowerCase().endsWith(ext))
    )
      throw new Error(`«${file.name}»: нужен файл ${g.accept}.`);
    if (!file.size || file.size > g.mb * 1024 ** 2)
      throw new Error(`«${file.name}»: нужен непустой файл до ${g.mb} МБ.`);
    if (g.limit !== 1 && d[key].some((x) => x.file?.name === file.name))
      throw new Error(`«${file.name}» уже выбран.`);
  }
  const items = newFiles.map((file) => ({ file }));
  const next = g.limit === 1 ? items : [...d[key], ...items];
  if (
    filesOf({ ...d, [key]: next }).reduce((n, f) => n + f.size, 0) >
    128 * 1024 ** 2
  )
    throw new Error("Общий размер новых файлов превышает 128 МиБ.");
  d[key] = next;
  if (key === "cover") {
    releasePreview(d);
    d.proofUrl = URL.createObjectURL(newFiles[0]);
  }
}
export function releasePreview(d) {
  if (d.proofUrl) URL.revokeObjectURL(d.proofUrl);
  d.proofUrl = "";
}
export function readiness(d, existing) {
  const errors = [];
  if (!d.name.trim()) errors.push(["Введите название.", "product-name"]);
  if (!validSlug(d.slug))
    errors.push(["Задайте адрес: латиница, цифры и дефисы.", "product-slug"]);
  else if (!d.base && existing.has(d.slug))
    errors.push(["Адрес уже занят. Выберите другой.", "product-slug"]);
  if (!d.category.trim())
    errors.push(["Укажите категорию.", "product-category"]);
  if (!d.description.trim())
    errors.push(["Добавьте описание.", "product-description"]);
  if (!d.cover.length && !d.base?.image)
    errors.push(["Добавьте обложку.", "file-cover"]);
  if (!d.downloads.length)
    errors.push(["Добавьте STL или ZIP для скачивания.", "file-downloads"]);
  if (
    d.downloads.length &&
    !d.base?.viewer &&
    !d.base?.glb &&
    !d.glb.length &&
    !d.downloads.some((x) => /\.stl$/i.test(x.file?.name ?? x.ref.file))
  )
    errors.push([
      "Для архива ZIP нужен GLB или отдельный STL для 3D-просмотра.",
      "file-glb",
    ]);
  if (d.colors.some((c) => !c.name.trim() || !/^#[0-9a-f]{6}$/i.test(c.hex)))
    errors.push(["Укажите названия и цвета всех окрасов.", "colors"]);
  if (d.details.some((c) => !c.label.trim() || !c.value.trim()))
    errors.push(["Заполните обе части каждой характеристики.", "details"]);
  return errors;
}
export function previewNote(d) {
  if (d.base?.viewer) return "Сохранена авторская 3D-сцена.";
  if (d.glb.length || d.base?.glb) return "Предпросмотр: модель GLB.";
  if (d.downloads.some((x) => /\.stl$/i.test(x.file?.name ?? x.ref.file)))
    return d.downloads.length > 1
      ? "Предпросмотр отдельной детали. Для сборки добавьте GLB."
      : "Предпросмотр: отдельный STL.";
  return "3D-просмотр не выбран.";
}
export function buildDocument(d, occupied) {
  const value = {
    ...d.base,
    name: d.name.trim(),
    category: d.category.trim(),
    description: d.description.trim(),
  };
  const assets = [];
  // Never overwrite a published blob, including media referenced by another field or a custom viewer.
  function stage(item, dir) {
    const file = item.file,
      ext = file.name.split(".").at(-1).toLowerCase(),
      name = slugify(file.name.slice(0, -ext.length - 1)) || "model";
    const stem = `${dir}/${name}`;
    let path = `${stem}.${ext}`;
    for (let n = 2; occupied.has(`catalog/${d.slug}/${path}`); n++)
      path = `${stem}-${n}.${ext}`;
    occupied.add(`catalog/${d.slug}/${path}`);
    assets.push({ path: `catalog/${d.slug}/${path}`, file });
    return path;
  }
  if (d.cover.length) value.image = stage(d.cover[0], "assets");
  if (d.glb.length) value.glb = stage(d.glb[0], "files");
  if (d.gallery.length || d.base?.gallery)
    value.gallery = d.gallery.map((x) => (x.file ? stage(x, "assets") : x.ref));
  value.stl = d.downloads.map((x) =>
    x.file ? { file: stage(x, "files"), label: x.file.name } : x.ref,
  );
  if (d.colors.length || d.base?.colors)
    value.colors = d.colors.map((x) => ({ ...x, name: x.name.trim() }));
  if (d.details.length || d.base?.details)
    value.details = d.details.map((x) => ({
      ...x,
      label: x.label.trim(),
      value: x.value.trim(),
    }));
  return { value, assets };
}
