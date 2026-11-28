import {
  groups,
  attach,
  releasePreview,
  imageUrl,
  previewNote,
  readiness,
  slugify,
} from "./product.js";
export const $ = (id) => document.getElementById(id);
export function node(tag, text = "", className = "") {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function message(el, text, error = false) {
  el.textContent = text;
  el.classList.toggle("error", error);
}
function smallButton(label, fn) {
  const btn = node("button", "×", "icon");
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", fn);
  return btn;
}
export function createEditor({ current, existing, changed, isBusy }) {
  const fields = ["name", "slug", "category", "description"];
  for (const field of fields) {
    $(`product-${field}`).addEventListener("input", (e) => {
      const d = current();
      d[field] = e.target.value;
      if (field === "slug") d.slugEdited = !!d.slug;
      if (field === "name" && !d.slugEdited) {
        d.slug = slugify(d.name);
        $("product-slug").value = d.slug;
      }
      changed();
    });
  }
  for (const [key, g] of Object.entries(groups)) {
    const wrap = node("div", "", "upload"),
      label = node("label", "", "drop"),
      list = node("ul", "", "attachments");
    const input = node("input");
    input.type = "file";
    input.id = `file-${key}`;
    input.multiple = g.limit !== 1;
    input.accept = g.accept;
    const title = node("strong", g.title);
    title.id = `title-${key}`;
    const note = node("p", "", "error");
    note.setAttribute("role", "status");
    note.id = `error-${key}`;
    label.append(title, node("small", g.hint), input);
    list.id = `list-${key}`;
    wrap.append(label, list, note);
    $("upload-groups").append(wrap);
    function select(files) {
      if (isBusy() || !files.length) return;
      try {
        attach(current(), key, [...files]);
        note.textContent = "";
        renderUploads();
        changed();
      } catch (e) {
        note.textContent = e.message;
      }
    }
    input.addEventListener("change", () => {
      select(input.files);
      input.value = "";
    });
    label.addEventListener("dragover", (e) => {
      e.preventDefault();
      label.classList.add("drag");
    });
    label.addEventListener("dragleave", () => label.classList.remove("drag"));
    label.addEventListener("drop", (e) => {
      e.preventDefault();
      label.classList.remove("drag");
      select(e.dataTransfer.files);
    });
  }
  function renderUploads() {
    const d = current();
    for (const [key, g] of Object.entries(groups)) {
      const list = $(`list-${key}`);
      list.replaceChildren();
      const old =
        key === "cover" ? d.base?.image : key === "glb" ? d.base?.glb : null;
      $(`title-${key}`).textContent =
        (g.limit === 1
          ? d[key].length || old
            ? "Заменить: "
            : "Выбрать: "
          : "Добавить: ") + g.title.toLowerCase();
      if (old && !d[key].length) list.append(node("li", `В карточке: ${old}`));
      d[key].forEach((item, i) => {
        const name = item.file?.name ?? item.ref?.label ?? item.ref;
        const li = node("li");
        li.append(
          node("span", item.file ? `Новый: ${name}` : `В карточке: ${name}`),
        );
        const remove = smallButton(`Убрать «${name}» из карточки`, () => {
          if (
            !item.file &&
            !window.confirm(
              `Убрать «${name}» из карточки? Сам файл останется в репозитории.`,
            )
          )
            return;
          d[key].splice(i, 1);
          if (key === "cover") releasePreview(d);
          renderUploads();
          changed();
          $(`file-${key}`).focus();
        });
        li.append(remove);
        list.append(li);
      });
      if (old && d[key].length)
        list.append(
          node("li", `Будет заменён: ${old}. Уберите новый файл для отмены.`),
        );
    }
  }
  function renderPairs(key) {
    const isColor = key === "colors",
      pairs = current()[key],
      parent = $(key);
    parent.replaceChildren();
    if (!pairs.length)
      parent.append(
        node(
          "small",
          isColor ? "Окрасы не заданы." : "Характеристики не заданы.",
        ),
      );
    pairs.forEach((pair, i) => {
      const row = node("div", "", "pair");
      const inputs = isColor
        ? [
            ["hex", "Цвет", "color"],
            ["name", "Название окраса", "text"],
          ]
        : [
            ["label", "Параметр", "text"],
            ["value", "Значение", "text"],
          ];
      for (const [prop, label, type] of inputs) {
        const field = node("input");
        field.type = type;
        field.value = pair[prop];
        field.placeholder = label;
        field.setAttribute("aria-label", `${label} ${i + 1}`);
        field.maxLength = isColor ? 60 : 160;
        field.addEventListener("input", () => {
          pair[prop] = field.value;
          changed();
        });
        row.append(field);
      }
      row.append(
        smallButton(
          `Убрать ${isColor ? "окрас" : "характеристику"} ${i + 1}`,
          () => {
            pairs.splice(i, 1);
            renderPairs(key);
            changed();
            $(isColor ? "add-color" : "add-detail").focus();
          },
        ),
      );
      parent.append(row);
    });
  }
  for (const [id, key] of [
    ["add-color", "colors"],
    ["add-detail", "details"],
  ])
    $(id).onclick = () => {
      current()[key].push(
        key === "colors"
          ? { name: "", hex: "#5c7084" }
          : { label: "", value: "" },
      );
      renderPairs(key);
      changed();
      $(key).lastElementChild.querySelector("input[type=text]").focus();
    };
  function summary() {
    const d = current();
    const url = d.proofUrl || imageUrl(d.slug, d.base?.image);
    const img = $("cover-preview");
    if (url && img.getAttribute("src") !== url) img.src = url;
    if (!url) img.removeAttribute("src");
    img.hidden = !url;
    $("cover-empty").hidden = !!url;
    $("record-kind").textContent = d.base
      ? "Карточка модели"
      : "Добавление в каталог";
    $("editor-title").textContent = d.name.trim() || "Новая модель";
    $("record-state").textContent =
      d.dirty || !d.base ? "Черновик" : "В каталоге";
    $("proof-category").textContent = d.category.trim() || "Без категории";
    $("proof-name").textContent = d.name.trim() || "Название модели";
    $("proof-info").textContent =
      `Файлов для печати: ${d.downloads.length}. ${previewNote(d)}`;
    const errors = readiness(d, existing());
    $("readiness").replaceChildren();
    if (!errors.length)
      $("readiness").append(
        node(
          "li",
          "Поля заполнены, обложка и файлы для печати на месте.",
          "ok",
        ),
      );
    for (const [text, id] of errors) {
      const li = node("li");
      const a = node("a", text);
      a.href = `#${id}`;
      a.onclick = (e) => {
        e.preventDefault();
        const el = $(id);
        (el.querySelector("input") ?? el).focus();
      };
      li.append(a);
      $("readiness").append(li);
    }
    return errors;
  }
  function render() {
    const d = current();
    for (const field of fields) $(`product-${field}`).value = d[field];
    $("product-slug").readOnly = !!d.base;
    for (const key of Object.keys(groups)) $(`error-${key}`).textContent = "";
    renderUploads();
    renderPairs("colors");
    renderPairs("details");
    summary();
    $("result").hidden = !d.result;
    if (d.result) {
      $("commit-link").textContent = `Коммит ${d.result.slice(0, 7)} ↗`;
      $("commit-link").href =
        `https://github.com/Georgy-hook/fgk-corp/commit/${encodeURIComponent(d.result)}`;
    }
  }
  return { render, summary };
}
