import { display, t } from "./copy.js";
import { localizedUrl, onLocaleChange, translateTree } from "../assets/i18n.js";

export const $ = (id) => document.getElementById(id);
const bindings = new WeakMap();

function apply(el, attr, value) {
  if (attr === "textContent") el.textContent = display(value);
  else el.setAttribute(attr, display(value));
}

export function caption(el, value, attr = "textContent") {
  if (typeof value === "object") {
    if (!bindings.has(el)) bindings.set(el, new Map());
    bindings.get(el).set(attr, value);
    el.dataset.studioCopy = "";
  } else {
    bindings.get(el)?.delete(attr);
  }
  apply(el, attr, value);
}

export function node(tag, text = "", className = "") {
  const el = document.createElement(tag);
  if (text) caption(el, text);
  if (className) el.className = className;
  return el;
}

export function message(el, text, error = false) {
  caption(el, text);
  el.classList.toggle("error", error);
}

export function localizeStudio() {
  function refresh() {
    translateTree(document, t);
    for (const el of document.querySelectorAll("[data-studio-copy]")) {
      for (const [attr, value] of bindings.get(el) ?? []) apply(el, attr, value);
    }
    for (const a of document.querySelectorAll("[data-studio-link]")) {
      a.href = localizedUrl(a.dataset.studioLink);
    }
  }
  refresh();
  onLocaleChange(refresh);
}
