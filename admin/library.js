import { getLocale } from "../assets/i18n.js";
import { msg, display } from "./copy.js";
import { $, caption, node } from "./dom.js";
import { imageUrl } from "./product.js";

export function createLibrary({ drafts, select, isBusy }) {
  const records = new Map();
  let mainOrder = null;
  let pageSize = 50;

  function titleFor(key) {
    return (
      drafts.get(key)?.name ||
      records.get(key)?.name ||
      (key.startsWith("@") ? msg("newModel") : key)
    );
  }
  function render() {
    const list = $("library-list");
    list.replaceChildren();
    const draftKeys = [...drafts.keys()].filter(
      (k) => k.startsWith("@") && (k === drafts.activeKey || drafts.get(k).dirty),
    );
    const keys = [
      ...new Set([
        ...draftKeys,
        ...(mainOrder ?? records.keys()),
        ...[...drafts.keys()].filter((k) => !k.startsWith("@") && drafts.get(k).dirty),
      ]),
    ];
    caption($("count"), msg("count", { count: mainOrder?.length ?? records.size }));
    const q = $("search").value.trim().toLocaleLowerCase(getLocale());
    const found = keys.filter((k) =>
      [display(titleFor(k)), drafts.get(k)?.slug ?? k, records.get(k)?.category ?? ""]
        .join(" ")
        .toLocaleLowerCase(getLocale())
        .includes(q),
    );
    if (!found.length) list.append(node("p", q ? msg("noneFound") : msg("emptyLibrary"), "muted"));
    for (const key of found.slice(0, pageSize)) {
      const d = drafts.get(key),
        p = records.get(key),
        label = titleFor(key),
        url = d?.proofUrl || imageUrl(key, p?.image ?? d?.base?.image);
      const btn = node("button", "", "record");
      btn.disabled = isBusy();
      btn.setAttribute("aria-current", String(key === drafts.activeKey));
      const icon = url ? node("img") : node("span", "◇", "mini");
      if (url) {
        icon.src = url;
        icon.alt = "";
        icon.loading = "lazy";
        icon.addEventListener("error", () => icon.replaceWith(node("span", "◇", "mini")), {
          once: true,
        });
      }
      const caption = node("span");
      caption.append(
        node("strong", label),
        node(
          "small",
          d?.dirty || key.startsWith("@") ? msg("draft") : p?.category || msg("modelCard"),
        ),
      );
      btn.append(icon, caption);
      btn.onclick = () => select(key);
      list.append(btn);
    }
    if (found.length > pageSize) {
      const more = node("button", msg("more", { count: found.length - pageSize }), "link");
      more.onclick = () => {
        pageSize += 50;
        render();
      };
      list.append(more);
    }
  }
  function categories() {
    const values = [
      ...new Set([...records.values()].map((p) => p.category).filter(Boolean)),
    ].sort();
    $("categories").replaceChildren(...values.map((v) => new Option(v, v)));
  }

  $("search").oninput = () => {
    pageSize = 50;
    render();
  };
  function clearSearch() {
    $("search").value = "";
    pageSize = 50;
  }
  function load(items) {
    records.clear();
    for (const item of items) records.set(item.slug, item);
    categories();
  }
  function record(slug, value) {
    records.set(slug, { ...value, slug });
  }
  return {
    render,
    categories,
    clearSearch,
    load,
    record,
    known: () => new Set(mainOrder ?? records.keys()),
    named: (slug) => Boolean(records.get(slug)?.name),
    order: (slugs) => {
      mainOrder = slugs;
    },
    include: (slug) => {
      if (mainOrder && !mainOrder.includes(slug)) mainOrder.push(slug);
    },
  };
}
