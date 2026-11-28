import { $, node, caption, message } from "./dom.js";
import { msg, display, errorCopy } from "./copy.js";
import {
  groups,
  attach,
  releasePreview,
  imageUrl,
  previewNote,
  readiness,
  slugify,
} from "./product.js";
function smallButton(label, fn) {
  const btn = node("button", "×", "icon");
  btn.type = "button";
  caption(btn, label, "title");
  caption(btn, label, "aria-label");
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
    const title = node("strong");
    title.id = `title-${key}`;
    const note = node("p", "", "error");
    note.setAttribute("role", "status");
    note.id = `error-${key}`;
    label.append(title, node("small", msg(`${key}Hint`)), input);
    list.id = `list-${key}`;
    wrap.append(label, list, note);
    $("upload-groups").append(wrap);
    function select(files) {
      if (isBusy() || !files.length) return;
      try {
        attach(current(), key, [...files]);
        message(note, "");
        renderUploads();
        changed();
      } catch (e) {
        message(note, errorCopy(e, "saveFailed"), true);
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
      const old = key === "cover" ? d.base?.image : key === "glb" ? d.base?.glb : null;
      const action =
        g.limit !== 1 ? "addFiles" : d[key].length || old ? "replaceFile" : "chooseFile";
      caption($(`title-${key}`), msg(action, { group: msg(key) }));
      if (old && !d[key].length) list.append(node("li", msg("inRecord", { name: old })));
      d[key].forEach((item, i) => {
        const name = item.file?.name ?? item.ref?.label ?? item.ref;
        const li = node("li");
        li.append(node("span", msg(item.file ? "newFile" : "inRecord", { name })));
        const remove = smallButton(msg("removeFile", { name }), () => {
          if (!item.file && !window.confirm(display(msg("confirmRemove", { name })))) return;
          d[key].splice(i, 1);
          if (key === "cover") releasePreview(d);
          renderUploads();
          changed();
          $(`file-${key}`).focus();
        });
        li.append(remove);
        list.append(li);
      });
      if (old && d[key].length) list.append(node("li", msg("willReplace", { name: old })));
    }
  }
  function renderPairs(key) {
    const isColor = key === "colors",
      pairs = current()[key],
      parent = $(key);
    parent.replaceChildren();
    if (!pairs.length) parent.append(node("small", isColor ? msg("noColors") : msg("noDetails")));
    pairs.forEach((pair, i) => {
      const row = node("div", "", "pair");
      const inputs = isColor
        ? [
            ["hex", msg("color"), "color"],
            ["name", msg("colorName"), "text"],
          ]
        : [
            ["label", msg("parameter"), "text"],
            ["value", msg("value"), "text"],
          ];
      for (const [prop, label, type] of inputs) {
        const field = node("input");
        field.type = type;
        field.value = pair[prop];
        caption(field, label, "placeholder");
        caption(field, msg("numbered", { label, number: i + 1 }), "aria-label");
        field.maxLength = isColor ? 60 : 160;
        field.addEventListener("input", () => {
          pair[prop] = field.value;
          changed();
        });
        row.append(field);
      }
      row.append(
        smallButton(msg(isColor ? "removeColor" : "removeDetail", { number: i + 1 }), () => {
          pairs.splice(i, 1);
          renderPairs(key);
          changed();
          $(isColor ? "add-color" : "add-detail").focus();
        }),
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
        key === "colors" ? { name: "", hex: "#5c7084" } : { label: "", value: "" },
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
    caption($("record-kind"), d.base ? msg("modelCard") : msg("adding"));
    caption($("editor-title"), d.name.trim() || msg("newModel"));
    caption($("record-state"), d.dirty || !d.base ? msg("draft") : msg("inCatalog"));
    caption($("proof-category"), d.category.trim() || msg("noCategory"));
    caption($("proof-name"), d.name.trim() || msg("modelName"));
    caption($("proof-info"), msg("proofInfo", { count: d.downloads.length, note: previewNote(d) }));
    const errors = readiness(d, existing());
    $("readiness").replaceChildren();
    if (!errors.length) $("readiness").append(node("li", msg("ready"), "ok"));
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
    for (const key of Object.keys(groups)) message($(`error-${key}`), "");
    renderUploads();
    renderPairs("colors");
    renderPairs("details");
    summary();
    $("result").hidden = !d.result;
    if (d.result) {
      caption($("commit-link"), msg("commit", { sha: d.result.slice(0, 7) }));
      $("commit-link").href =
        `https://github.com/Georgy-hook/fgk-corp/commit/${encodeURIComponent(d.result)}`;
    }
  }
  return { render, summary };
}
