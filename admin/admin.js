import {
  publicCatalog,
  publicProduct,
  readProduct,
  trackMedia,
  publish,
} from "./catalog.js";
import {
  draftFrom,
  releasePreview,
  imageUrl,
  readiness,
  filesOf,
} from "./product.js";
import { checkUploads } from "./file-check.js";
import { createEditor, $, node, message } from "./editor.js";
import { createAccess } from "./access.js";

const drafts = new Map();
let records = new Map(),
  mainOrder = null;
let activeKey = "",
  draftNumber = 0,
  selection = 0,
  publicVersion = 0,
  pageSize = 50,
  busy = false;
const current = () => drafts.get(activeKey);
const known = () => new Set(mainOrder ?? records.keys());
const status = (text, error = false) =>
  message($("product-status"), text, error);
const editor = createEditor({
  current,
  existing: known,
  isBusy: () => busy,
  changed,
});
const access = createAccess({ connected, disconnected });

function titleFor(key) {
  return (
    drafts.get(key)?.name ||
    records.get(key)?.name ||
    (key.startsWith("@") ? "Новая модель" : key)
  );
}
function library() {
  const list = $("library-list");
  list.replaceChildren();
  const draftKeys = [...drafts.keys()].filter(
    (k) => k.startsWith("@") && (k === activeKey || drafts.get(k).dirty),
  );
  const keys = [
    ...new Set([
      ...draftKeys,
      ...(mainOrder ?? records.keys()),
      ...[...drafts.keys()].filter(
        (k) => !k.startsWith("@") && drafts.get(k).dirty,
      ),
    ]),
  ];
  $("count").textContent = String((mainOrder ?? [...records.keys()]).length);
  const q = $("search").value.trim().toLocaleLowerCase("ru");
  const found = keys.filter((k) =>
    [titleFor(k), drafts.get(k)?.slug ?? k, records.get(k)?.category ?? ""]
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(q),
  );
  if (!found.length)
    list.append(
      node(
        "p",
        q ? "Ничего не найдено. Измените запрос." : "Пока нет моделей.",
        "muted",
      ),
    );
  for (const key of found.slice(0, pageSize)) {
    const d = drafts.get(key),
      p = records.get(key),
      label = titleFor(key),
      url = d?.proofUrl || imageUrl(key, p?.image ?? d?.base?.image);
    const btn = node("button", "", "record");
    btn.disabled = busy;
    btn.setAttribute("aria-current", String(key === activeKey));
    const icon = url ? node("img") : node("span", "◇", "mini");
    if (url) {
      icon.src = url;
      icon.alt = "";
      icon.loading = "lazy";
      icon.addEventListener(
        "error",
        () => icon.replaceWith(node("span", "◇", "mini")),
        { once: true },
      );
    }
    const caption = node("span");
    caption.append(
      node("strong", label),
      node(
        "small",
        d?.dirty || key.startsWith("@")
          ? "Черновик"
          : p?.category || "Карточка модели",
      ),
    );
    btn.append(icon, caption);
    btn.onclick = () => select(key);
    list.append(btn);
  }
  if (found.length > pageSize) {
    const more = node(
      "button",
      `Ещё модели (${found.length - pageSize})`,
      "link",
    );
    more.onclick = () => {
      pageSize += 50;
      library();
    };
    list.append(more);
  }
}
function controls() {
  const client = access.client();
  $("editor-fields").disabled = busy;
  $("session").disabled = busy;
  $("new-product").disabled = busy;
  $("session").textContent = client ? "Выйти из GitHub" : "Подключить GitHub";
  $("mode").textContent = client ? "Подключено к main" : "Без подключения";
  $("publish-product").disabled =
    busy || Boolean(current()?.base && !current().dirty);
  $("publish-product").textContent = busy
    ? "Публикуем…"
    : !client
      ? "Продолжить с GitHub"
      : current()?.base
        ? "Опубликовать изменения"
        : "Опубликовать модель";
  $("reload-product").hidden = !client || !current()?.base;
  $("reload-product").disabled = busy;
  $("discard").hidden = !current()?.dirty;
  $("discard").disabled = busy;
}
function changed() {
  ++selection; // An outstanding library read must not displace typing in the current draft.
  if ($("library-status").textContent === "Открываем карточку…")
    message($("library-status"), "");
  current().dirty = true;
  current().result = null;
  $("result").hidden = true;
  status("");
  editor.summary();
  controls();
  library();
}
function show(key, focus = false) {
  const old = drafts.get(activeKey);
  if (old && !old.base && !old.dirty && key !== activeKey) {
    releasePreview(old);
    drafts.delete(activeKey);
  }
  activeKey = key;
  editor.render();
  controls();
  library();
  status(
    current().result
      ? "Коммит записан в main. Публикация сайта выполняется отдельно в GitHub Pages."
      : "",
  );
  if (focus) $("editor").focus();
}
function createNew(focus = true) {
  if (busy) return;
  ++selection;
  $("search").value = "";
  pageSize = 50;
  const key = `@${++draftNumber}`;
  drafts.set(key, draftFrom());
  show(key);
  if (focus) $("product-name").focus();
}
async function select(key, focus = true) {
  if (busy) return;
  const request = ++selection;
  if (drafts.has(key)) {
    message($("library-status"), "");
    show(key, focus);
    return;
  }
  message($("library-status"), "Открываем карточку…");
  try {
    const repo = access.client();
    const snapshot = repo ? await repo.getSnapshot() : null;
    const file = repo
      ? await readProduct(repo, snapshot, key)
      : { value: await publicProduct(key), sha: null };
    if (request !== selection || repo !== access.client()) return;
    const draft = draftFrom(key, file.value, file.sha);
    if (snapshot) trackMedia(draft, snapshot);
    drafts.set(key, draft);
    records.set(key, { ...file.value, slug: key });
    show(key, focus);
  } catch (e) {
    if (request === selection)
      message(
        $("library-status"),
        e.message || "Не удалось открыть карточку.",
        true,
      );
    return;
  } finally {
    if (request === selection && drafts.has(key))
      message($("library-status"), "");
  }
}
function categories() {
  const values = [
    ...new Set([...records.values()].map((p) => p.category).filter(Boolean)),
  ].sort();
  $("categories").replaceChildren(...values.map((v) => new Option(v, v)));
}
async function loadPublic() {
  const request = ++publicVersion;
  if (access.client()) return;
  message($("library-status"), "Загружаем опубликованный каталог…");
  $("retry-library").hidden = true;
  try {
    const items = await publicCatalog();
    if (request !== publicVersion) return;
    records = new Map(items.map((p) => [p.slug, p]));
    categories();
    message($("library-status"), "");
    library();
    editor.summary();
    if (
      items.length &&
      selection === 1 &&
      document.activeElement === document.body
    )
      await select(items[0].slug, false);
  } catch (e) {
    if (request === publicVersion) {
      message(
        $("library-status"),
        "Каталог не загружен. Новую модель можно готовить без сети.",
        true,
      );
      $("retry-library").hidden = false;
    }
  }
}
async function connected(repo, snapshot, slugs) {
  ++publicVersion;
  ++selection;
  mainOrder = slugs;
  for (const draft of drafts.values()) trackMedia(draft, snapshot);
  controls();
  library();
  editor.summary();
  message($("library-status"), "");
  $("retry-library").hidden = true;
  status(
    "Подключение готово. Проверьте карточку и подтвердите публикацию кнопкой ниже.",
  );
  // The public bundle covers existing titles; hydrate newly discovered cards in small batches.
  const missing = slugs.filter((slug) => !records.get(slug)?.name);
  for (let i = 0; i < missing.length && repo === access.client(); i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (slug) => {
        try {
          const file = await readProduct(repo, snapshot, slug);
          if (repo === access.client())
            records.set(slug, { ...file.value, slug });
        } catch {
          /* A broken entry remains individually openable for diagnostics. */
        }
      }),
    );
    if (repo === access.client()) {
      library();
      categories();
    }
  }
}
function disconnected() {
  ++selection;
  mainOrder = null;
  if (!activeKey) return;
  controls();
  library();
  editor.summary();
  status("Сеанс завершён. Черновики и файлы остаются в этой вкладке.");
}
async function reload() {
  const repo = access.client(),
    d = current();
  if (!repo || !d.base || busy) return;
  if (
    d.dirty &&
    !window.confirm(
      "Заменить этот черновик версией из main? Его правки и выбранные файлы будут сброшены.",
    )
  )
    return;
  const request = ++selection;
  status("Читаем актуальную версию…");
  try {
    const snapshot = await repo.getSnapshot();
    const file = await readProduct(repo, snapshot, d.slug);
    if (request !== selection || repo !== access.client()) return;
    const fresh = draftFrom(d.slug, file.value, file.sha);
    trackMedia(fresh, snapshot);
    releasePreview(d);
    drafts.set(activeKey, fresh);
    records.set(activeKey, { ...file.value, slug: d.slug });
    show(activeKey, true);
    status("Загружена актуальная версия из main.");
  } catch (e) {
    if (request === selection) status(e.message, true);
  }
}
async function save(event) {
  event.preventDefault();
  if (busy) return;
  const d = current();
  const errors = readiness(d, known());
  if (errors.length) {
    const [text, id] = errors[0];
    status(text, true);
    const field = $(id);
    (field.querySelector("input") ?? field).focus();
    return;
  }
  ++selection;
  busy = true;
  controls();
  library();
  try {
    status("Проверяем новые файлы…");
    await checkUploads(filesOf(d));
    const repo = access.client();
    if (!repo) {
      status("Файлы готовы. Подключите ключ для записи.");
      access.open();
      return;
    }
    const { sha, value } = await publish(repo, d, status);
    const saved = draftFrom(d.slug, value);
    saved.result = sha;
    // Pages may not have deployed the new cover yet.
    saved.proofUrl = d.proofUrl;
    drafts.delete(activeKey);
    drafts.set(d.slug, saved);
    records.set(d.slug, { ...value, slug: d.slug });
    if (!mainOrder.includes(d.slug)) mainOrder.push(d.slug);
    show(d.slug);
    categories();
  } catch (e) {
    status(
      `${e.message || "Не удалось записать изменения."} Черновик не сброшен.`,
      true,
    );
  } finally {
    busy = false;
    controls();
    library();
  }
}
$("new-product").onclick = () => createNew();
$("search").oninput = () => {
  pageSize = 50;
  library();
};
$("retry-library").onclick = loadPublic;
$("reload-product").onclick = reload;
$("discard").onclick = () => {
  const d = current();
  if (
    busy ||
    !window.confirm(
      "Сбросить правки и выбранные файлы этого черновика? Опубликованные файлы не изменятся.",
    )
  )
    return;
  ++selection;
  releasePreview(d);
  if (!d.base) {
    drafts.delete(activeKey);
    createNew();
  } else {
    drafts.set(activeKey, draftFrom(d.slug, d.base, d.sha));
    show(activeKey, true);
  }
};
$("product-form").onsubmit = save;
$("product-form").addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    e.target.matches("input:not([type=file]):not([type=color])")
  )
    e.preventDefault();
});
$("orders-open").onclick = () => $("orders-dialog").showModal();
$("orders-close").onclick = () => $("orders-dialog").close();
window.addEventListener("beforeunload", (e) => {
  if (busy || [...drafts.values()].some((d) => d.dirty)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Avoid accidental browser navigation to a dropped model outside a file field.
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
createNew(false);
loadPublic();
