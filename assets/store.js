const elements = {
  catalogGrid: document.querySelector("#catalog-grid"),
  catalogStatus: document.querySelector("#catalog-status"),
  featuredImage: document.querySelector("#featured-image"),
  featuredTitle: document.querySelector("#featured-title"),
  featuredCategory: document.querySelector("#featured-category"),
  viewerFrame: document.querySelector("#viewer-frame"),
  viewerMount: document.querySelector("#viewer-mount"),
  viewerHint: document.querySelector("#viewer-hint"),
  viewerCaption: document.querySelector("#viewer-caption"),
  modelPoster: document.querySelector("#model-poster"),
  viewerPlaceholder: document.querySelector("#viewer-placeholder"),
  modelTitle: document.querySelector("#model-title"),
  modelCategory: document.querySelector("#model-category"),
  modelDescription: document.querySelector("#model-description"),
  modelDetails: document.querySelector("#model-details"),
  colorSection: document.querySelector(".color-section"),
  colorOptions: document.querySelector("#color-options"),
  colorReading: document.querySelector("#color-reading"),
  downloadList: document.querySelector("#download-list"),
  orderSelected: document.querySelector("#order-selected"),
  fullExhibit: document.querySelector("#full-exhibit"),
  featuredGlow: document.querySelector(".featured-glow"),
};

const catalogUrl = new URL("../catalog/", import.meta.url);
const fallbackImage = new URL("hero.webp", import.meta.url).href;
const selectedColors = new Map();
let currentProduct = null;
let currentColor = null;
let viewerCleanup = null;
let activeViewerContainer = elements.viewerMount;
let viewerRevision = 0;

function productFolder(slug) {
  return new URL(`${encodeURIComponent(slug)}/`, catalogUrl);
}

function resolveProductAsset(product, path) {
  if (typeof path !== "string" || !path.trim()) return null;
  try {
    const asset = new URL(path, product.base);
    return asset.origin === window.location.origin ? asset.href : null;
  } catch {
    return null;
  }
}

function safeHex(value) {
  return typeof value === "string" && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
    ? value
    : null;
}

function normalizeProduct(slug, source) {
  if (!source || typeof source !== "object" || typeof source.name !== "string") return null;
  return {
    ...source,
    slug,
    base: productFolder(slug),
    colors: Array.isArray(source.colors)
      ? source.colors
          .filter((color) => color && typeof color.name === "string" && safeHex(color.hex))
          .map((color) => ({ name: color.name, hex: safeHex(color.hex) }))
      : [],
  };
}

async function loadCatalog() {
  const combinedResponse = await fetch(new URL("products.json", catalogUrl));
  if (combinedResponse.ok) {
    const combined = await combinedResponse.json();
    if (Array.isArray(combined)) {
      return combined
        .filter((product) => typeof product?.slug === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(product.slug))
        .map((product) => normalizeProduct(product.slug, product))
        .filter(Boolean);
    }
  }

  const indexResponse = await fetch(new URL("index.json", catalogUrl));
  if (!indexResponse.ok) throw new Error("Не удалось загрузить каталог моделей.");
  const index = await indexResponse.json();
  if (!Array.isArray(index)) throw new Error("В каталоге пока нет списка моделей.");

  const slugs = index.filter((slug) => typeof slug === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(slug));
  const products = await Promise.all(
    slugs.map(async (slug) => {
      const response = await fetch(new URL(`${encodeURIComponent(slug)}/product.json`, catalogUrl));
      if (!response.ok) return null;
      return normalizeProduct(slug, await response.json());
    }),
  );
  return products.filter(Boolean);
}

function createProductCard(product) {
  const button = document.createElement("button");
  button.className = "product-card";
  button.type = "button";
  button.dataset.slug = product.slug;
  button.setAttribute("aria-current", "false");

  const media = document.createElement("span");
  media.className = "product-card-media";

  const image = document.createElement("img");
  image.src = resolveProductAsset(product, product.image) || fallbackImage;
  image.alt = "";
  image.loading = "lazy";

  const copy = document.createElement("span");
  copy.className = "product-card-copy";

  const category = document.createElement("span");
  category.className = "product-card-category";
  category.textContent = product.category || "3D-модель";

  const name = document.createElement("span");
  name.className = "product-card-name";
  name.textContent = product.name;

  const description = document.createElement("span");
  description.className = "product-card-description";
  description.textContent = product.description || "Открыть модель и выбрать окрас.";

  media.append(image);
  copy.append(category, name, description);
  button.append(media, copy);
  button.addEventListener("click", () => selectProduct(product, true));
  return button;
}

function renderCatalog(products) {
  const ordered = [...products].sort((left, right) => {
    if (left.slug === "buran-vdnh") return -1;
    if (right.slug === "buran-vdnh") return 1;
    return 0;
  });

  elements.catalogGrid.replaceChildren(...ordered.map(createProductCard));
  const plural = new Intl.PluralRules("ru-RU").select(ordered.length);
  const modelWord = { one: "модель", few: "модели", many: "моделей", other: "модели" }[plural];
  elements.catalogStatus.textContent = ordered.length
    ? `${ordered.length} ${modelWord} в каталоге`
    : "В каталоге пока нет моделей.";

  window.dispatchEvent(
    new CustomEvent("fgk:catalog", {
      detail: ordered.map(({ slug, name }) => ({ slug, name })),
    }),
  );

  if (ordered[0]) selectProduct(ordered[0], false);
}

function renderFeatured(product) {
  elements.featuredImage.src = resolveProductAsset(product, product.image) || fallbackImage;
  elements.featuredImage.alt = product.name;
  elements.featuredTitle.textContent = product.name;
  elements.featuredCategory.textContent = product.category || "3D-МОДЕЛЬ";
}

function renderDetails(product) {
  elements.modelDetails.replaceChildren();
  for (const detail of Array.isArray(product.details) ? product.details : []) {
    if (typeof detail?.label !== "string" || typeof detail.value !== "string") continue;
    const row = document.createElement("div");
    row.className = "detail-row";
    const label = document.createElement("dt");
    label.textContent = detail.label;
    const value = document.createElement("dd");
    value.textContent = detail.value;
    row.append(label, value);
    elements.modelDetails.append(row);
  }
}

function renderDownloads(product) {
  elements.downloadList.replaceChildren();
  const downloads = Array.isArray(product.stl)
    ? product.stl
    : typeof product.stl === "string"
      ? [{ file: product.stl, label: "Скачать STL" }]
      : [];

  for (const item of downloads) {
    if (typeof item?.file !== "string") continue;
    const href = resolveProductAsset(product, item.file);
    if (!href) continue;
    const link = document.createElement("a");
    link.className = "download-link";
    link.href = href;
    link.download = "";
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const label = document.createElement("span");
    label.textContent = item.label || "Скачать STL";
    link.append(label);
    elements.downloadList.append(link);
  }
}

function hasDirectSTL(product) {
  const downloads = Array.isArray(product.stl)
    ? product.stl
    : typeof product.stl === "string"
      ? [{ file: product.stl }]
      : [];
  return downloads.some((item) => typeof item?.file === "string" && /\.stl(?:[?#].*)?$/i.test(item.file));
}

function updateColorView(color, sendToViewer = true) {
  currentColor = color || null;
  if (!currentProduct) return;

  if (color) selectedColors.set(currentProduct.slug, color);
  elements.colorReading.textContent = color ? `Выбран окрас: ${color.name}` : "Окрас не выбран.";
  elements.colorOptions.querySelectorAll(".color-swatch").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.hex === color?.hex));
  });
  elements.featuredGlow.style.backgroundColor = color?.hex || "transparent";
  elements.viewerFrame.style.setProperty("--selected-color", color?.hex || "#bd6847");

  if (!sendToViewer || !color) return;
  const detail = { hex: color.hex, name: color.name };
  activeViewerContainer.dispatchEvent(
    new CustomEvent("fgk:viewer-color", { bubbles: true, detail }),
  );
  const frame = elements.viewerMount.querySelector("iframe");
  frame?.contentWindow?.postMessage({ type: "fgk:viewer-color", ...detail }, window.location.origin);
}

function renderColors(product) {
  elements.colorOptions.replaceChildren();
  const colors = product.colors || [];
  elements.colorSection.hidden = colors.length === 0;

  const previouslySelected = selectedColors.get(product.slug);
  const startingColor = colors.find((color) => color.hex === product.selectedColor) ||
    colors.find((color) => color.hex === previouslySelected?.hex) || colors[0] || null;

  for (const color of colors) {
    const button = document.createElement("button");
    button.className = "color-swatch";
    button.type = "button";
    button.dataset.hex = color.hex;
    button.style.setProperty("--swatch-color", color.hex);
    button.title = color.name;
    button.setAttribute("aria-label", `Окрас ${color.name}`);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => updateColorView(color));
    elements.colorOptions.append(button);
  }
  updateColorView(startingColor, false);
}

function addPoster(product) {
  const image = document.createElement("img");
  image.className = "model-poster";
  image.src = resolveProductAsset(product, product.image) || fallbackImage;
  image.alt = `Изображение модели «${product.name}»`;
  image.loading = "lazy";
  elements.viewerMount.replaceChildren(image);
  elements.viewerHint.hidden = true;
}

function addPlaceholder(message) {
  const placeholder = document.createElement("div");
  placeholder.className = "viewer-placeholder";
  const text = document.createElement("p");
  text.textContent = message;
  placeholder.append(text);
  elements.viewerMount.append(placeholder);
}

function clearViewer() {
  viewerRevision += 1;
  viewerCleanup?.();
  viewerCleanup = null;
  activeViewerContainer = elements.viewerMount;
  elements.viewerMount.replaceChildren();
  elements.viewerFrame.style.removeProperty("height");
  elements.viewerFrame.style.removeProperty("min-height");
  return viewerRevision;
}

function openViewer(product) {
  const revision = clearViewer();

  if (typeof product.viewer === "string" && product.viewer) {
    const viewerUrl = resolveProductAsset(product, product.viewer);
    if (!viewerUrl) {
      addPoster(product);
      elements.viewerHint.hidden = true;
      addPlaceholder("3D-просмотр для этой модели пока недоступен.");
      return;
    }
    const frame = document.createElement("iframe");
    frame.title = `Интерактивная 3D-модель «${product.name}»`;
    frame.src = viewerUrl;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "fullscreen";
    frame.addEventListener("load", () => updateColorView(currentColor));
    elements.viewerMount.append(frame);
    elements.viewerHint.hidden = false;
    elements.viewerCaption.textContent = "Вращайте модель мышью или пальцем. Выберите окрас рядом.";
    return;
  }

  if ((typeof product.glb === "string" && product.glb) || hasDirectSTL(product)) {
    const moduleLoader = import("./viewer.js");
    addPoster(product);
    elements.viewerHint.hidden = true;
    addPlaceholder("Загружаем интерактивную модель…");
    const mountPoint = document.createElement("div");
    mountPoint.className = "interactive-viewer";
    elements.viewerMount.append(mountPoint);
    activeViewerContainer = mountPoint;
    elements.viewerCaption.textContent = "Вращайте модель мышью или пальцем.";
    moduleLoader
      .then(async ({ mountViewer }) => {
        if (revision !== viewerRevision || currentProduct?.slug !== product.slug) return;
        const viewerProduct = {
          ...product,
          externalColors: true,
          selectedColor: currentColor?.hex,
        };
        const cleanup = await mountViewer(mountPoint, {
          base: product.base.href,
          product: viewerProduct,
        });
        if (revision !== viewerRevision || currentProduct?.slug !== product.slug) {
          if (typeof cleanup === "function") cleanup();
          return;
        }
        elements.viewerMount.querySelector(".model-poster")?.remove();
        elements.viewerMount.querySelector(".viewer-placeholder")?.remove();
        if (typeof cleanup === "function") viewerCleanup = cleanup;
      })
      .catch(() => {
        if (revision !== viewerRevision || currentProduct?.slug !== product.slug) return;
        elements.viewerMount.querySelector(".viewer-placeholder")?.remove();
        addPlaceholder("Не удалось открыть 3D-модель. Попробуйте обновить страницу.");
        elements.viewerCaption.textContent = "Файлы модели доступны для скачивания.";
      });
    return;
  }

  addPoster(product);
  elements.viewerHint.hidden = true;
  addPlaceholder("3D-просмотр для этой модели скоро появится.");
  elements.viewerCaption.textContent = "Выберите модель, чтобы посмотреть доступные файлы и окрас.";
}

function selectProduct(product, scrollToViewer) {
  currentProduct = product;
  elements.modelTitle.textContent = product.name;
  elements.modelCategory.textContent = product.category || "3D-МОДЕЛЬ · FGK CORP";
  elements.modelDescription.textContent = product.description || "Выберите окрас и оставьте заявку на модель.";
  elements.orderSelected.disabled = false;

  renderFeatured(product);
  renderDetails(product);
  renderDownloads(product);
  renderColors(product);

  if (typeof product.exhibit === "string" && product.exhibit) {
    const exhibitUrl = resolveProductAsset(product, product.exhibit);
    if (exhibitUrl) {
      elements.fullExhibit.href = exhibitUrl;
      elements.fullExhibit.hidden = false;
    } else {
      elements.fullExhibit.hidden = true;
      elements.fullExhibit.removeAttribute("href");
    }
  } else {
    elements.fullExhibit.hidden = true;
    elements.fullExhibit.removeAttribute("href");
  }

  document.querySelectorAll(".product-card").forEach((card) => {
    card.setAttribute("aria-current", String(card.dataset.slug === product.slug));
  });
  openViewer(product);

  if (scrollToViewer) {
    document.querySelector("#model-explorer").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function requestSelectedProduct() {
  if (!currentProduct) return;
  window.dispatchEvent(
    new CustomEvent("fgk:order-model", {
      detail: {
        name: currentProduct.name,
        slug: currentProduct.slug,
        color: currentColor?.name || "",
        colorHex: currentColor?.hex || "",
      },
    }),
  );
  document.querySelector("#order").scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.orderSelected.addEventListener("click", requestSelectedProduct);

elements.viewerMount.addEventListener("fgk:viewer-color", (event) => {
  if (!currentProduct || !event.detail?.hex) return;
  const hex = safeHex(event.detail.hex);
  if (!hex) return;
  const color = currentProduct.colors.find((entry) => entry.hex.toLowerCase() === hex.toLowerCase());
  if (color) updateColorView(color, false);
});

window.addEventListener("message", (event) => {
  const frame = elements.viewerMount.querySelector("iframe");
  if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
  if (event.data?.type === "fgk:viewer-size" && Number.isFinite(event.data.height)) {
    const height = Math.max(360, Math.min(1280, event.data.height));
    frame.style.height = `${height}px`;
    elements.viewerFrame.style.minHeight = `${height}px`;
    return;
  }
  if (event.data?.type === "fgk:viewer-color") {
    const hex = safeHex(event.data.hex);
    const color = currentProduct?.colors.find((entry) => entry.hex.toLowerCase() === hex?.toLowerCase());
    if (color) updateColorView(color, false);
  }
});

loadCatalog()
  .then((products) => {
    if (products.length === 0) {
      elements.catalogStatus.textContent = "В каталоге пока нет моделей.";
      elements.orderSelected.disabled = true;
      window.dispatchEvent(new CustomEvent("fgk:catalog", { detail: [] }));
      return;
    }
    renderCatalog(products);
  })
  .catch((error) => {
    elements.catalogStatus.textContent = error.message || "Не удалось загрузить каталог моделей.";
    elements.orderSelected.disabled = true;
    window.dispatchEvent(new CustomEvent("fgk:catalog", { detail: [] }));
  });
