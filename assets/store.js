import { asset, createStudio } from "./catalog-scene.js";

const $ = (id) => document.getElementById(id);
const catalogRoot = new URL("../catalog/", import.meta.url);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const plural = new Intl.PluralRules("ru");
const colorMemory = new Map();
let products = [];
let current = null;
let color = null;
const studio = createStudio({
  onColor(hex) {
    if (typeof hex !== "string") return;
    const match = current?.colors.find(
      (entry) => entry.hex.toLowerCase() === hex.toLowerCase(),
    );
    if (match && match !== color) chooseColor(match, false);
  },
});

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function normal(value) {
  return String(value || "")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function normalize(source) {
  if (
    !source ||
    typeof source.slug !== "string" ||
    !slugPattern.test(source.slug) ||
    typeof source.name !== "string" ||
    !source.name.trim()
  )
    return null;
  const p = {
    ...source,
    base: new URL(`${source.slug}/`, catalogRoot),
    category: source.category?.trim() || "Без категории",
    description: source.description || "",
    colors: list(source.colors)
      .filter((c) => c?.name && /^#[0-9a-f]{6}$/i.test(c.hex))
      .map(({ name, hex }) => ({ name, hex })),
    details: list(source.details).filter(
      (d) => typeof d?.label === "string" && typeof d.value === "string",
    ),
    stl:
      typeof source.stl === "string"
        ? [{ file: source.stl, label: "Скачать STL" }]
        : list(source.stl).filter((entry) => entry?.file),
  };
  p.search = normal(
    [
      p.name,
      p.slug,
      p.category,
      p.description,
      ...p.details.map((d) => d.value),
    ].join(" "),
  );
  return p;
}
async function load() {
  // Pages generates the combined catalog. A plain source checkout uses the index and product files instead.
  const combined = await fetch(new URL("products.json", catalogRoot));
  if (combined.ok) {
    const data = await combined.json();
    if (!Array.isArray(data)) throw new Error("Некорректный каталог");
    return data.map(normalize).filter(Boolean);
  }
  const index = await fetch(new URL("index.json", catalogRoot));
  if (!index.ok) throw new Error("Нет каталога");
  const slugs = await index.json();
  if (!Array.isArray(slugs)) throw new Error("Некорректный список");
  return (
    await Promise.all(
      slugs
        .filter((s) => typeof s === "string" && slugPattern.test(s))
        .map(async (slug) => {
          const res = await fetch(new URL(`${slug}/product.json`, catalogRoot));
          if (!res.ok) throw new Error("Карточка недоступна");
          return normalize({ ...(await res.json()), slug });
        }),
    )
  ).filter(Boolean);
}
function modelUrl(slug) {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("model", slug);
  return url;
}
function notifyOrder() {
  if (!current) return;
  window.dispatchEvent(
    new CustomEvent("fgk:order-model", {
      detail: {
        slug: current.slug,
        name: current.name,
        color: color?.name || "",
        colorHex: color?.hex || "",
      },
    }),
  );
}
function chooseColor(next, send = true) {
  color = next;
  if (color) colorMemory.set(current.slug, color.hex);
  $("color-reading").textContent = color?.name || "";
  for (const button of $("color-options").children)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.hex === color?.hex),
    );
  studio.sendColor(color, send);
  notifyOrder();
}
function renderColors(p) {
  document.querySelector(".color-section").hidden = !p.colors.length;
  $("color-options").replaceChildren(
    ...p.colors.map((c) => {
      const b = node("button", null, "color-swatch");
      b.type = "button";
      b.title = c.name;
      b.dataset.hex = c.hex;
      b.setAttribute("aria-label", c.name);
      b.style.setProperty("--swatch", c.hex);
      b.addEventListener("click", () => chooseColor(c));
      return b;
    }),
  );
  chooseColor(
    p.colors.find(
      (c) => c.hex === (colorMemory.get(p.slug) || p.selectedColor),
    ) ||
      p.colors[0] ||
      null,
  );
}
function resource(text, href, download = false) {
  const a = node("a", text);
  a.href = href;
  if (download) a.download = "";
  return a;
}
function renderPassport(p) {
  $("model-details").replaceChildren(
    ...p.details.map((d) => {
      const row = node("div");
      row.append(node("dt", d.label), node("dd", d.value));
      return row;
    }),
  );
  const links = p.stl
    .filter((s) => asset(p, s.file))
    .map((s) => resource(s.label || "Скачать STL", asset(p, s.file), true));
  if (asset(p, p.exhibit))
    links.push(resource("Полная экспозиция", asset(p, p.exhibit)));
  $("resources").replaceChildren(...links);
  $("passport").hidden = !links.length && !p.details.length;
}
function select(p) {
  current = p;
  document.title = `${p.name} — FGK Corp`;
  $("model-title").textContent = p.name;
  $("model-category").textContent = p.category;
  $("model-description").textContent = p.description;
  studio.setProduct(p);
  renderPassport(p);
  renderColors(p);
  for (const link of $("catalog-grid").children)
    link.setAttribute(
      "aria-current",
      link.dataset.slug === p.slug ? "page" : "false",
    );
}
function readLocation() {
  const slug = new URL(location.href).searchParams.get("model");
  const match = products.find((p) => p.slug === slug);
  const p = match || products[0];
  const missing = Boolean(slug && !match);
  $("selection-notice").hidden = !missing;
  $("selection-notice").textContent = missing
    ? `Модель по этой ссылке не найдена.${p ? " Ниже показана первая модель каталога." : ""}`
    : "";
  if (p && p !== current) select(p);
}
function card(p) {
  const link = node("a", null, "product-card");
  link.href = modelUrl(p.slug);
  link.dataset.slug = p.slug;
  link.setAttribute("aria-current", p === current ? "page" : "false");
  const imgUrl = asset(p, list(p.gallery)[0]) || asset(p, p.image);
  const thumb = imgUrl ? node("img") : node("span");
  if (imgUrl) {
    thumb.src = imgUrl;
    thumb.alt = "";
    thumb.loading = "lazy";
  }
  const action = node("span", "Открыть ", "card-open");
  const icon = node("span", "↗");
  icon.setAttribute("aria-hidden", "true");
  action.append(icon);
  link.append(
    thumb,
    node("span", p.name, "card-name"),
    node("span", p.category, "card-category"),
    action,
  );
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (location.href !== link.href) history.pushState(null, "", link.href);
    if (p === current) notifyOrder();
    readLocation();
    $("model-title").focus({ preventScroll: true });
    $("model-explorer").scrollIntoView();
  });
  return link;
}
function renderResults() {
  const query = normal($("catalog-search").value);
  const category = $("catalog-category").value;
  const words = query.split(/\s+/).filter(Boolean);
  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      words.every((word) => p.search.includes(word)),
  );
  const active = Boolean(category || query);
  const n = filtered.length;
  const unit = {
    one: "модель",
    few: "модели",
    many: "моделей",
    other: "модели",
  }[plural.select(n)];
  $("catalog-status").textContent = active
    ? `Найдено: ${n} из ${products.length}`
    : `${n} ${unit}`;
  $("reset-filter").hidden = !active;
  $("catalog-empty").hidden = n > 0;
  $("catalog-empty").textContent = products.length
    ? "Совпадений нет. Измените запрос или сбросьте фильтры."
    : "В каталоге пока нет моделей.";
  $("catalog-grid").replaceChildren(...filtered.map(card));
}
function init(all) {
  products = all;
  const categories = [...new Set(all.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  $("catalog-category").replaceChildren(
    new Option("Все категории", ""),
    ...categories.map((c) => new Option(c, c)),
  );
  $("category-field").hidden = categories.length < 2;
  $("catalog-tools").hidden = !all.length;
  $("model-explorer").hidden = !all.length;
  window.dispatchEvent(
    new CustomEvent("fgk:catalog", {
      detail: all.map(({ slug, name, colors }) => ({ slug, name, colors })),
    }),
  );
  readLocation();
  renderResults();
}
$("catalog-search").addEventListener("input", renderResults);
$("catalog-category").addEventListener("change", renderResults);
$("reset-filter").addEventListener("click", () => {
  $("catalog-search").value = "";
  $("catalog-category").value = "";
  renderResults();
  $("catalog-search").focus();
});
$("order-selected").addEventListener("click", notifyOrder);
window.addEventListener("popstate", () => {
  if (products.length) readLocation();
});
load()
  .then(init)
  .catch(() => {
    window.dispatchEvent(new CustomEvent("fgk:catalog", { detail: [] }));
    $("catalog-status").textContent =
      "Не удалось обновить каталог. Доступна базовая карточка.";
  });
