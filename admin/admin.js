import { GitHubRepository, encodeFileToBase64, encodeTextToBase64 } from "./repository.js";

const NETLIFY_HOOK_URL = "https://api.netlify.com/api/v1/hooks/6b045ee7b115484854c77c97";
const NETLIFY_SITE_ID = "bab43a9c-baf0-487a-9619-0fe239142141";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MODEL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_STL_FILES = 12;

const elements = {
  accessCard: document.querySelector(".access-card"),
  accessForm: document.querySelector("#access-form"),
  accessToken: document.querySelector("#access-token"),
  accessStatus: document.querySelector("#access-status"),
  workspace: document.querySelector("#workspace"),
  signOut: document.querySelector("#sign-out"),
  connectionLabel: document.querySelector("#connection-label"),
  productSelect: document.querySelector("#product-select"),
  productForm: document.querySelector("#product-form"),
  productName: document.querySelector("#product-name"),
  productSlug: document.querySelector("#product-slug"),
  productCategory: document.querySelector("#product-category"),
  productDescription: document.querySelector("#product-description"),
  coverDrop: document.querySelector("#cover-drop"),
  coverInput: document.querySelector("#cover-file"),
  coverPreview: document.querySelector("#cover-preview"),
  coverPrompt: document.querySelector("#cover-prompt"),
  coverStatus: document.querySelector("#cover-status"),
  stlInput: document.querySelector("#stl-files"),
  stlTitle: document.querySelector("#stl-title"),
  stlList: document.querySelector("#stl-list"),
  glbInput: document.querySelector("#glb-file"),
  glbTitle: document.querySelector("#glb-title"),
  swatches: document.querySelector("#swatches"),
  addSwatch: document.querySelector("#add-swatch"),
  productStatus: document.querySelector("#product-status"),
  publishProduct: document.querySelector("#publish-product"),
  ordersForm: document.querySelector("#orders-form"),
  ordersEmail: document.querySelector("#orders-email"),
  netlifyToken: document.querySelector("#netlify-token"),
  ordersStatus: document.querySelector("#orders-status"),
  saveOrders: document.querySelector("#save-orders"),
  categoryOptions: document.querySelector("#category-options"),
};

const tabButtons = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".panel")];

let repository = null;
let catalogSnapshot = null;
let catalogSlugs = [];
let selectedProduct = null;
let slugWasEdited = false;
let coverPreviewUrl = "";
let catalogSaveInProgress = false;
let netlifySaveInProgress = false;
let netlifyCredential = "";
let netlifyRequestController = null;
let sessionVersion = 0;
let productLoadVersion = 0;

const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

for (const tab of tabButtons) {
  tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
}

elements.accessForm.addEventListener("submit", connectRepository);
elements.signOut.addEventListener("click", signOut);
elements.productSelect.addEventListener("change", loadSelectedProduct);
elements.productForm.addEventListener("submit", publishProduct);
elements.productName.addEventListener("input", updateSuggestedSlug);
elements.productSlug.addEventListener("input", () => {
  slugWasEdited = true;
});
elements.addSwatch.addEventListener("click", () => addSwatch());
elements.coverInput.addEventListener("change", () => showSelectedCover());
elements.stlInput.addEventListener("change", showSelectedStlFiles);
elements.glbInput.addEventListener("change", showSelectedGlbFile);
elements.coverDrop.addEventListener("keydown", activateDropzoneWithKeyboard);
elements.coverDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.coverDrop.classList.add("is-dragging");
});
elements.coverDrop.addEventListener("dragleave", () => elements.coverDrop.classList.remove("is-dragging"));
elements.coverDrop.addEventListener("drop", handleCoverDrop);
elements.ordersForm.addEventListener("submit", updateNetlifyRecipient);

function activatePanel(panelId) {
  for (const tab of tabButtons) {
    const isActive = tab.dataset.panel === panelId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of panels) {
    const isActive = panel.id === panelId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }
}

async function connectRepository(event) {
  event.preventDefault();
  let token = elements.accessToken.value.trim();
  elements.accessToken.value = "";
  elements.accessForm.querySelector("button[type='submit']").disabled = true;
  setStatus(elements.accessStatus, "Проверяю доступ к репозиторию…");
  const activeSession = ++sessionVersion;
  let candidate = null;

  try {
    if (!token.startsWith("github_pat_")) {
      throw new Error("Нужен Fine-grained personal access token GitHub, начинающийся с github_pat_.");
    }

    candidate = new GitHubRepository(token);
    token = "";
    const repoInfo = await candidate.connect();

    if (activeSession !== sessionVersion) {
      candidate.clear();
      return;
    }

    repository = candidate;
    const catalogLoaded = await refreshCatalog("__new__", activeSession);

    if (!catalogLoaded || activeSession !== sessionVersion || repository !== candidate) {
      candidate.clear();
      return;
    }

    elements.accessForm.hidden = true;
    elements.accessCard.classList.add("is-connected");
    elements.workspace.hidden = false;
    elements.connectionLabel.textContent = `Подключено к ${repoInfo.full_name}`;
    setStatus(elements.productStatus, "Выберите модель из каталога или добавьте новую.");
  } catch (error) {
    candidate?.clear();
    repository = null;
    if (activeSession === sessionVersion) {
      setStatus(elements.accessStatus, readableError(error), "error");
    }
  } finally {
    token = "";
    elements.accessForm.querySelector("button[type='submit']").disabled = false;
  }
}

function signOut() {
  if (catalogSaveInProgress) {
    return;
  }

  sessionVersion += 1;
  productLoadVersion += 1;
  repository?.clear();
  repository = null;
  selectedProduct = null;
  catalogSnapshot = null;
  catalogSlugs = [];
  elements.netlifyToken.value = "";
  netlifyCredential = "";

  if (netlifyRequestController) {
    netlifyRequestController.abort();
    netlifyRequestController = null;
  }

  elements.workspace.hidden = true;
  elements.accessCard.classList.remove("is-connected");
  elements.accessForm.hidden = false;
  elements.connectionLabel.textContent = "Подключение к GitHub";
  elements.productSelect.replaceChildren(new Option("Новая модель", "__new__"));
  setStatus(elements.accessStatus, "Сеанс завершён.");
  elements.accessToken.focus();
}

async function refreshCatalog(selection, activeSession = sessionVersion) {
  const activeRepository = repository;

  if (!activeRepository) {
    return false;
  }

  const snapshot = await activeRepository.getSnapshot();

  if (!isCurrentSession(activeRepository, activeSession)) {
    return false;
  }

  const index = await activeRepository.readJsonFile(snapshot, "catalog/index.json");

  if (!isCurrentSession(activeRepository, activeSession)) {
    return false;
  }

  catalogSnapshot = snapshot;
  catalogSlugs = index.exists ? validateCatalogIndex(index.value) : [];

  elements.productSelect.replaceChildren(new Option("Новая модель", "__new__"));

  for (const slug of catalogSlugs) {
    const option = new Option(slug, slug);
    elements.productSelect.add(option);
  }

  const requested = catalogSlugs.includes(selection) ? selection : "__new__";
  elements.productSelect.value = requested;
  await loadSelectedProduct();
  return isCurrentSession(activeRepository, activeSession);
}

function validateCatalogIndex(value) {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string" || !isValidSlug(slug))) {
    throw new Error("catalog/index.json должен содержать список адресов карточек.");
  }

  return [...new Set(value)];
}

async function loadSelectedProduct() {
  const activeLoad = ++productLoadVersion;
  const activeRepository = repository;
  const activeSession = sessionVersion;
  const slug = elements.productSelect.value;
  selectedProduct = null;
  setProductFormDisabled(true);
  elements.publishProduct.disabled = true;
  clearPendingUploads();
  clearStatus(elements.productStatus);

  if (slug === "__new__") {
    if (!isCurrentProductLoad(activeRepository, activeSession, activeLoad)) {
      return;
    }

    resetProductFields();
    setProductFormDisabled(false);
    elements.publishProduct.textContent = "Опубликовать модель";
    elements.publishProduct.disabled = false;
    setStatus(elements.productStatus, "Новая модель будет добавлена в каталог.");
    return;
  }

  try {
    let snapshot = catalogSnapshot;

    if (!snapshot) {
      snapshot = await activeRepository.getSnapshot();

      if (!isCurrentProductLoad(activeRepository, activeSession, activeLoad)) {
        return;
      }

      catalogSnapshot = snapshot;
    }

    const current = await activeRepository.readJsonFile(snapshot, `catalog/${slug}/product.json`);

    if (!isCurrentProductLoad(activeRepository, activeSession, activeLoad)) {
      return;
    }

    if (!current.exists || !isRecord(current.value)) {
      throw new Error(`Для карточки «${slug}» не найден файл catalog/${slug}/product.json.`);
    }

    selectedProduct = {
      slug,
      sha: current.sha,
      document: current.value,
      mediaShas: getProductMediaShas(snapshot, slug),
    };
    fillProductFields(selectedProduct);
    setProductFormDisabled(false);
    elements.publishProduct.textContent = "Сохранить изменения";
    elements.publishProduct.disabled = false;
    setStatus(elements.productStatus, `Открыта карточка «${current.value.name || slug}».`);
  } catch (error) {
    if (!isCurrentProductLoad(activeRepository, activeSession, activeLoad)) {
      return;
    }

    selectedProduct = null;
    setProductFormDisabled(false);
    elements.publishProduct.disabled = false;
    setStatus(elements.productStatus, readableError(error), "error");
  }
}

function getProductMediaShas(snapshot, slug) {
  const prefix = `catalog/${slug}/`;
  const mediaShas = new Map();

  for (const [path, entry] of snapshot.files) {
    if (path.startsWith(prefix) && path !== `${prefix}product.json` && entry.type === "blob") {
      mediaShas.set(path, entry.sha);
    }
  }

  return mediaShas;
}

function resetProductFields() {
  elements.productForm.reset();
  elements.productName.value = "";
  elements.productSlug.value = "";
  elements.productCategory.value = "";
  elements.productDescription.value = "";
  elements.productSlug.disabled = false;
  elements.productCategory.disabled = false;
  elements.swatches.replaceChildren();
  elements.coverInput.value = "";
  elements.stlInput.value = "";
  elements.glbInput.value = "";
  elements.stlTitle.textContent = "Выбрать файлы STL";
  elements.stlList.textContent = "Файл STL обязателен для новой модели.";
  elements.glbTitle.textContent = "Добавить просмотр в браузере";
  elements.coverStatus.textContent = "Изображение показывается в каталоге.";
  elements.coverPreview.hidden = true;
  elements.coverPrompt.hidden = false;
  revokeCoverPreview();
  slugWasEdited = false;
}

function fillProductFields(product) {
  const document = product.document;
  elements.productName.value = typeof document.name === "string" ? document.name : "";
  elements.productSlug.value = product.slug;
  elements.productSlug.disabled = true;
  elements.productCategory.value = typeof document.category === "string" ? document.category : "";
  elements.productDescription.value = typeof document.description === "string" ? document.description : "";
  elements.productCategory.disabled = false;
  elements.swatches.replaceChildren();

  if (Array.isArray(document.colors)) {
    for (const color of document.colors) {
      if (isRecord(color) && typeof color.name === "string" && isValidHex(color.hex)) {
        addSwatch(color.name, color.hex);
      }
    }
  }

  const imagePath = typeof document.image === "string" ? productAssetUrl(product.slug, document.image) : "";

  if (imagePath) {
    revokeCoverPreview();
    elements.coverPreview.src = imagePath;
    elements.coverPreview.hidden = false;
    elements.coverPrompt.hidden = true;
    elements.coverStatus.textContent = "Текущая обложка сохранена. Выберите файл, чтобы заменить.";
  } else {
    elements.coverPreview.hidden = true;
    elements.coverPrompt.hidden = false;
    elements.coverStatus.textContent = "У этой карточки пока нет обложки. Добавьте изображение.";
  }

  const stlCount = Array.isArray(document.stl) ? document.stl.length : 0;
  elements.stlList.textContent = stlCount > 0
    ? `Сохранено STL-файлов: ${stlCount}. Выберите файлы, чтобы заменить комплект.`
    : "STL-файлы пока не добавлены.";
  elements.glbTitle.textContent = document.glb ? "Просмотр модели сохранён. Выберите GLB, чтобы заменить." : "Добавить просмотр в браузере";
  slugWasEdited = true;
}

function updateSuggestedSlug() {
  if (!slugWasEdited && !elements.productSlug.disabled) {
    elements.productSlug.value = slugify(elements.productName.value);
  }
}

function slugify(value) {
  const converted = [...value.toLowerCase()].map((character) => CYRILLIC[character] ?? character).join("");
  return converted
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

function isValidSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function addSwatch(name = "", hex = "#547363") {
  const row = document.createElement("div");
  row.className = "swatch-row";

  const color = document.createElement("input");
  color.type = "color";
  color.value = isValidHex(hex) ? hex : "#547363";
  color.setAttribute("aria-label", "Цвет модели");

  const colorName = document.createElement("input");
  colorName.type = "text";
  colorName.maxLength = 40;
  colorName.placeholder = "Название цвета";
  colorName.value = name;
  colorName.setAttribute("aria-label", "Название цвета");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-swatch";
  remove.textContent = "Удалить";
  remove.addEventListener("click", () => row.remove());

  row.append(color, colorName, remove);
  elements.swatches.append(row);
}

function isValidHex(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function collectSwatches() {
  const rows = [...elements.swatches.querySelectorAll(".swatch-row")];

  if (rows.length > 8) {
    throw new Error("Добавьте не более 8 вариантов окраса.");
  }

  return rows.map((row) => {
    const [color, name] = row.querySelectorAll("input");
    const trimmedName = name.value.trim();

    if (!trimmedName) {
      throw new Error("Укажите название для каждого варианта окраса.");
    }

    return { name: trimmedName, hex: color.value.toLowerCase() };
  });
}

function showSelectedCover() {
  const file = elements.coverInput.files[0];

  if (!file) {
    return;
  }

  if (!isAllowedImage(file)) {
    elements.coverInput.value = "";
    setStatus(elements.productStatus, "Обложка должна быть JPG, PNG, WebP или AVIF.", "error");
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    elements.coverInput.value = "";
    setStatus(elements.productStatus, "Размер изображения должен быть не больше 10 МБ.", "error");
    return;
  }

  if (file.size === 0) {
    elements.coverInput.value = "";
    setStatus(elements.productStatus, "Выбранное изображение пустое.", "error");
    return;
  }

  revokeCoverPreview();
  coverPreviewUrl = URL.createObjectURL(file);
  elements.coverPreview.src = coverPreviewUrl;
  elements.coverPreview.hidden = false;
  elements.coverPrompt.hidden = true;
  elements.coverStatus.textContent = file.name;
}

function isAllowedImage(file) {
  return /\.(jpe?g|png|webp|avif)$/i.test(file.name);
}

function showSelectedStlFiles() {
  const files = [...elements.stlInput.files];
  const error = validateModelFiles(files, true);

  if (error) {
    elements.stlInput.value = "";
    elements.stlTitle.textContent = "Выбрать файлы STL";
    elements.stlList.textContent = error;
    return;
  }

  elements.stlTitle.textContent = files.length ? `Выбрано STL: ${files.length}` : "Выбрать файлы STL";
  elements.stlList.textContent = files.length
    ? files.map((file) => file.name).join(" · ")
    : selectedProduct?.document?.stl?.length
      ? `Сохранено STL-файлов: ${selectedProduct.document.stl.length}.`
      : "Файл STL обязателен для новой модели.";
}

function showSelectedGlbFile() {
  const file = elements.glbInput.files[0];

  if (!file) {
    elements.glbTitle.textContent = selectedProduct?.document?.glb
      ? "Просмотр модели сохранён. Выберите GLB, чтобы заменить."
      : "Добавить просмотр в браузере";
    return;
  }

  const error = validateModelFiles([file], false);

  if (error) {
    elements.glbInput.value = "";
    elements.glbTitle.textContent = "Добавить просмотр в браузере";
    setStatus(elements.productStatus, error, "error");
    return;
  }

  elements.glbTitle.textContent = file.name;
}

function validateModelFiles(files, requireStl) {
  if (files.length === 0 && requireStl) {
    return null;
  }

  if (requireStl && files.length > MAX_STL_FILES) {
    return `Можно добавить не более ${MAX_STL_FILES} STL-файлов за раз.`;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > MAX_UPLOAD_BYTES) {
    return "Общий размер выбранных файлов не должен превышать 50 МБ.";
  }

  for (const file of files) {
    if (file.size === 0) {
      return `Файл «${file.name}» пустой.`;
    }

    if (file.size > MAX_MODEL_FILE_BYTES) {
      return `Файл «${file.name}» больше допустимых 25 МБ.`;
    }

    const isStl = /\.stl$/i.test(file.name);
    const isGlb = /\.glb$/i.test(file.name);

    if (requireStl && !isStl) {
      return `Файл «${file.name}» должен иметь расширение STL.`;
    }

    if (!requireStl && !isGlb) {
      return `Файл «${file.name}» должен иметь расширение GLB.`;
    }
  }

  return null;
}

function activateDropzoneWithKeyboard(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.coverInput.click();
  }
}

function handleCoverDrop(event) {
  event.preventDefault();
  elements.coverDrop.classList.remove("is-dragging");
  const image = [...event.dataTransfer.files].find(isAllowedImage);

  if (!image) {
    setStatus(elements.productStatus, "Перетащите изображение JPG, PNG, WebP или AVIF.", "error");
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(image);
  elements.coverInput.files = transfer.files;
  showSelectedCover();
}

function clearPendingUploads() {
  elements.coverInput.value = "";
  elements.stlInput.value = "";
  elements.glbInput.value = "";
}

function revokeCoverPreview() {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = "";
  }
}

async function publishProduct(event) {
  event.preventDefault();

  if (!repository || catalogSaveInProgress) {
    return;
  }

  const activeRepository = repository;
  const activeSession = sessionVersion;
  const productAtStart = selectedProduct;
  catalogSaveInProgress = true;
  setProductFormDisabled(true);
  elements.publishProduct.disabled = true;
  elements.productSelect.disabled = true;
  elements.signOut.disabled = true;

  try {
    const productInput = collectProductInput();
    setStatus(elements.productStatus, "Читаю актуальную версию каталога…");
    const snapshot = await activeRepository.getSnapshot();
    if (!isCurrentSession(activeRepository, activeSession)) return;
    const latestIndexFile = await activeRepository.readJsonFile(snapshot, "catalog/index.json");
    if (!isCurrentSession(activeRepository, activeSession)) return;
    const latestSlugs = latestIndexFile.exists ? validateCatalogIndex(latestIndexFile.value) : [];
    const productPath = `catalog/${productInput.slug}/product.json`;
    const currentFile = await activeRepository.readJsonFile(snapshot, productPath);
    if (!isCurrentSession(activeRepository, activeSession)) return;
    const filesToCommit = [];
    let productDocument;

    if (productAtStart) {
      if (productAtStart.slug !== productInput.slug) {
        throw new Error("Адрес карточки нельзя изменить после публикации.");
      }

      if (!currentFile.exists || currentFile.sha !== productAtStart.sha) {
        throw new Error("Эту карточку изменили после её загрузки. Перезагрузите страницу и повторите попытку.");
      }
    } else if (currentFile.exists || latestSlugs.includes(productInput.slug)) {
      throw new Error(`Карточка «${productInput.slug}» уже существует. Перезагрузите список моделей.`);
    }

    productDocument = await buildProductDocument(productInput, currentFile, filesToCommit);

    if (!isCurrentSession(activeRepository, activeSession)) return;

    if (productAtStart) {
      for (const change of filesToCommit) {
        if (change.path === productPath) {
          continue;
        }

        const expectedSha = productAtStart.mediaShas.get(change.path) || null;
        const currentSha = snapshot.files.get(change.path)?.sha || null;

        if (currentSha !== expectedSha) {
          throw new Error("Один из файлов модели изменили после её загрузки. Перезагрузите карточку и повторите попытку.");
        }
      }
    }

    filesToCommit.push({
      path: productPath,
      content: encodeTextToBase64(`${JSON.stringify(productDocument, null, 2)}\n`),
      encoding: "base64",
    });

    const updatedIndex = [...latestSlugs];

    if (!updatedIndex.includes(productInput.slug)) {
      updatedIndex.push(productInput.slug);
    }

    filesToCommit.push({
      path: "catalog/index.json",
      content: encodeTextToBase64(`${JSON.stringify(updatedIndex, null, 2)}\n`),
      encoding: "base64",
    });

    const commitSha = await activeRepository.commitFiles(snapshot, filesToCommit, (message) => {
      if (isCurrentSession(activeRepository, activeSession)) {
        setStatus(elements.productStatus, message);
      }
    });

    if (!isCurrentSession(activeRepository, activeSession)) return;

    clearPendingUploads();
    await refreshCatalog(productInput.slug, activeSession);
    if (!isCurrentSession(activeRepository, activeSession)) return;
    setStatus(elements.productStatus, `Изменения опубликованы в коммите ${commitSha.slice(0, 7)}. GitHub Actions обновит сайт.` , "success");
  } catch (error) {
    if (isCurrentSession(activeRepository, activeSession)) {
      setStatus(elements.productStatus, readableError(error), "error");
    }
  } finally {
    catalogSaveInProgress = false;
    setProductFormDisabled(false);
    elements.productSelect.disabled = false;
    elements.signOut.disabled = false;

    if (isCurrentSession(activeRepository, activeSession)) {
      elements.publishProduct.disabled = false;
    }
  }
}

function setProductFormDisabled(disabled) {
  const controls = elements.productForm.querySelectorAll("input, textarea, button");

  for (const control of controls) {
    control.disabled = disabled || (control === elements.productSlug && Boolean(selectedProduct));
  }
}

function collectProductInput() {
  const name = elements.productName.value.trim();
  const slug = elements.productSlug.value.trim().toLowerCase();
  const category = elements.productCategory.value.trim();
  const description = elements.productDescription.value.trim();
  const cover = elements.coverInput.files[0] || null;
  const stlFiles = [...elements.stlInput.files];
  const glb = elements.glbInput.files[0] || null;

  if (!name) {
    throw new Error("Укажите название модели.");
  }

  if (!isValidSlug(slug)) {
    throw new Error("Адрес карточки может содержать латинские буквы, цифры и дефисы.");
  }

  if (!category) {
    throw new Error("Укажите категорию модели.");
  }

  if (!description) {
    throw new Error("Добавьте описание модели.");
  }

  if (!selectedProduct && !cover) {
    throw new Error("Добавьте изображение обложки.");
  }

  if (!selectedProduct && stlFiles.length === 0) {
    throw new Error("Добавьте хотя бы один файл STL.");
  }

  if (cover && !isAllowedImage(cover)) {
    throw new Error("Обложка должна быть JPG, PNG, WebP или AVIF.");
  }

  if (cover && (cover.size === 0 || cover.size > MAX_IMAGE_BYTES)) {
    throw new Error(cover.size === 0 ? "Выбранное изображение пустое." : "Размер изображения должен быть не больше 10 МБ.");
  }

  const stlError = validateModelFiles(stlFiles, true);

  if (stlError) {
    throw new Error(stlError);
  }

  if (glb) {
    const glbError = validateModelFiles([glb], false);

    if (glbError) {
      throw new Error(glbError);
    }
  }

  const totalBytes = [cover, ...stlFiles, glb].filter(Boolean).reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Общий размер новых файлов не должен превышать 50 МБ.");
  }

  return { name, slug, category, description, cover, stlFiles, glb, colors: collectSwatches() };
}

async function buildProductDocument(input, currentFile, filesToCommit) {
  const current = currentFile.exists && isRecord(currentFile.value) ? currentFile.value : {};
  const product = { ...current, name: input.name, category: input.category, description: input.description, colors: input.colors };
  const productRoot = `catalog/${input.slug}/`;

  if (input.cover) {
    const imageExtension = fileExtension(input.cover.name);
    const relativePath = `assets/cover.${imageExtension}`;
    filesToCommit.push({
      path: `${productRoot}${relativePath}`,
      content: await encodeFileToBase64(input.cover),
      encoding: "base64",
    });
    product.image = relativePath;
  } else if (!product.image && selectedProduct?.document?.image) {
    product.image = selectedProduct.document.image;
  }

  if (input.stlFiles.length) {
    product.stl = [];

    for (const [index, file] of input.stlFiles.entries()) {
      const filename = safeFilename(file.name);
      const relativePath = `files/${String(index + 1).padStart(2, "0")}-${filename}`;
      filesToCommit.push({
        path: `${productRoot}${relativePath}`,
        content: await encodeFileToBase64(file),
        encoding: "base64",
      });
      const label = file.name.replace(/\.stl$/i, "").trim() || `STL модель ${index + 1}`;
      product.stl.push({ file: relativePath, label });
    }
  }

  if (input.glb) {
    const relativePath = "files/preview.glb";
    filesToCommit.push({
      path: `${productRoot}${relativePath}`,
      content: await encodeFileToBase64(input.glb),
      encoding: "base64",
    });
    product.glb = relativePath;
  }

  return product;
}

function fileExtension(filename) {
  return filename.split(".").at(-1).toLowerCase();
}

function safeFilename(filename) {
  const extension = fileExtension(filename);
  const basename = filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${basename || "model"}.${extension}`;
}

function productAssetUrl(slug, relativePath) {
  if (relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    return "";
  }

  const safePath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `../catalog/${encodeURIComponent(slug)}/${safePath}`;
}

async function updateNetlifyRecipient(event) {
  event.preventDefault();

  if (!repository || netlifySaveInProgress) {
    return;
  }

  const email = elements.ordersEmail.value.trim();
  netlifyCredential = elements.netlifyToken.value.trim();
  elements.netlifyToken.value = "";

  if (!email || !elements.ordersEmail.checkValidity()) {
    setStatus(elements.ordersStatus, "Укажите корректный адрес электронной почты.", "error");
    netlifyCredential = "";
    return;
  }

  if (!netlifyCredential) {
    setStatus(elements.ordersStatus, "Введите временный Netlify personal access token.", "error");
    return;
  }

  netlifySaveInProgress = true;
  elements.saveOrders.disabled = true;
  netlifyRequestController = new AbortController();
  setStatus(elements.ordersStatus, "Обновляю адрес в Netlify Forms…");

  try {
    const response = await fetch(NETLIFY_HOOK_URL, {
      method: "PUT",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: netlifyRequestController.signal,
      headers: {
        Authorization: `Bearer ${netlifyCredential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        site_id: NETLIFY_SITE_ID,
        type: "email",
        event: "submission_created",
        data: { email },
      }),
    });
    const responseText = await response.text();
    const responseData = responseText ? parseResponse(responseText) : null;

    if (!response.ok) {
      throw new Error(`Netlify ${response.status}: ${responseData?.message || response.statusText}`);
    }

    elements.ordersEmail.value = "";
    setStatus(elements.ordersStatus, `Адрес получателя обновлён: ${maskEmail(email)}. Netlify может прислать письмо для подтверждения.`, "success");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus(elements.ordersStatus, "Запрос к Netlify отменён.");
    } else {
      setStatus(elements.ordersStatus, readableError(error), "error");
    }
  } finally {
    netlifyCredential = "";
    elements.netlifyToken.value = "";
    elements.saveOrders.disabled = false;
    netlifySaveInProgress = false;
    netlifyRequestController = null;
  }
}

function parseResponse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value.slice(0, 300) };
  }
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function clearStatus(element) {
  setStatus(element, "");
}

function readableError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Не удалось выполнить запрос. Проверьте подключение и повторите попытку.";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCurrentSession(activeRepository, activeSession) {
  return activeRepository !== null && repository === activeRepository && sessionVersion === activeSession;
}

function isCurrentProductLoad(activeRepository, activeSession, activeLoad) {
  return isCurrentSession(activeRepository, activeSession) && productLoadVersion === activeLoad;
}
