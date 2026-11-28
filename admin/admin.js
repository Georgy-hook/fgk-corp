import { publicCatalog, publicProduct, readProduct, trackMedia, publish } from "./catalog.js";
import { draftFrom, readiness, filesOf } from "./product.js";
import { checkUploads } from "./file-check.js";
import { createEditor } from "./editor.js";
import { $, caption, message, localizeStudio } from "./dom.js";
import { msg, display, errorCopy } from "./copy.js";
import { createDrafts } from "./drafts.js";
import { createLibrary } from "./library.js";
import { mountLanguagePicker } from "../assets/language-picker.js";
import { createAccess } from "./access.js";

const drafts = createDrafts();
const current = drafts.current;
let selection = 0;
let publicVersion = 0;
let busy = false;
let opening = false;
const library = createLibrary({ drafts, select, isBusy: () => busy });
const status = (text, error = false) => message($("product-status"), text, error);
const editor = createEditor({
  current,
  existing: library.known,
  isBusy: () => busy,
  changed,
});
const access = createAccess({ connected, disconnected });

function controls() {
  const client = access.client();
  $("editor-fields").disabled = busy;
  $("session").disabled = busy;
  $("new-product").disabled = busy;
  caption($("session"), client ? msg("signOut") : msg("connectGitHub"));
  caption($("mode"), client ? msg("connected") : msg("offline"));
  $("publish-product").disabled = busy || Boolean(current()?.base && !current().dirty);
  caption(
    $("publish-product"),
    busy
      ? msg("publishing")
      : !client
        ? msg("continueGitHub")
        : current()?.base
          ? msg("publishEdits")
          : msg("publishModel"),
  );
  $("reload-product").hidden = !client || !current()?.base;
  $("reload-product").disabled = busy;
  $("discard").hidden = !current()?.dirty;
  $("discard").disabled = busy;
}
function changed() {
  ++selection; // An outstanding library read must not displace typing in the current draft.
  if (opening) {
    opening = false;
    message($("library-status"), "");
  }
  current().dirty = true;
  current().result = null;
  $("result").hidden = true;
  status("");
  editor.summary();
  controls();
  library.render();
}
function show(key, focus = false) {
  drafts.select(key);
  editor.render();
  controls();
  library.render();
  status(current().result ? msg("saved") : "");
  if (focus) $("editor").focus();
}
function createNew(focus = true) {
  if (busy) return;
  ++selection;
  opening = false;
  message($("library-status"), "");
  library.clearSearch();
  show(drafts.create());
  if (focus) $("product-name").focus();
}
async function select(key, focus = true) {
  if (busy) return;
  const request = ++selection;
  opening = !drafts.has(key);
  if (!opening) {
    message($("library-status"), "");
    show(key, focus);
    return;
  }
  message($("library-status"), msg("opening"));
  try {
    const repo = access.client();
    const snapshot = repo ? await repo.getSnapshot() : null;
    const file = repo
      ? await readProduct(repo, snapshot, key)
      : { value: await publicProduct(key), sha: null };
    if (request !== selection || repo !== access.client()) return;
    const draft = draftFrom(key, file.value, file.sha);
    if (snapshot) trackMedia(draft, snapshot);
    drafts.put(key, draft);
    library.record(key, file.value);
    show(key, focus);
  } catch (e) {
    if (request === selection) message($("library-status"), errorCopy(e, "openFailed"), true);
    return;
  } finally {
    if (request === selection) {
      opening = false;
      if (drafts.has(key)) message($("library-status"), "");
    }
  }
}
async function loadPublic() {
  const request = ++publicVersion;
  if (access.client()) return;
  message($("library-status"), msg("loading"));
  $("retry-library").hidden = true;
  try {
    const items = await publicCatalog();
    if (request !== publicVersion) return;
    library.load(items);
    message($("library-status"), "");
    library.render();
    editor.summary();
    if (items.length && selection === 1 && document.activeElement === document.body)
      await select(items[0].slug, false);
  } catch (e) {
    if (request === publicVersion) {
      message($("library-status"), msg("loadFailed"), true);
      $("retry-library").hidden = false;
    }
  }
}
async function connected(repo, snapshot, slugs) {
  ++publicVersion;
  ++selection;
  library.order(slugs);
  for (const draft of drafts.values()) trackMedia(draft, snapshot);
  controls();
  library.render();
  editor.summary();
  message($("library-status"), "");
  $("retry-library").hidden = true;
  status(msg("connectedHelp"));
  // The public bundle covers existing titles; hydrate newly discovered cards in small batches.
  const missing = slugs.filter((slug) => !library.named(slug));
  for (let i = 0; i < missing.length && repo === access.client(); i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (slug) => {
        try {
          const file = await readProduct(repo, snapshot, slug);
          if (repo === access.client()) library.record(slug, file.value);
        } catch {
          /* A broken entry remains individually openable for diagnostics. */
        }
      }),
    );
    if (repo === access.client()) {
      library.render();
      library.categories();
    }
  }
}
function disconnected() {
  ++selection;
  library.order(null);
  if (!drafts.activeKey) return;
  controls();
  library.render();
  editor.summary();
  status(msg("signedOut"));
}
async function reload() {
  const repo = access.client(),
    d = current();
  if (!repo || !d.base || busy) return;
  if (d.dirty && !window.confirm(display(msg("confirmReload")))) return;
  const request = ++selection;
  status(msg("reloading"));
  try {
    const snapshot = await repo.getSnapshot();
    const file = await readProduct(repo, snapshot, d.slug);
    if (request !== selection || repo !== access.client()) return;
    const fresh = draftFrom(d.slug, file.value, file.sha);
    trackMedia(fresh, snapshot);
    drafts.put(drafts.activeKey, fresh);
    library.record(drafts.activeKey, file.value);
    show(drafts.activeKey, true);
    status(msg("reloaded"));
  } catch (e) {
    if (request === selection) status(errorCopy(e, "openFailed"), true);
  }
}
async function save(event) {
  event.preventDefault();
  if (busy) return;
  const d = current();
  const errors = readiness(d, library.known());
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
  library.render();
  try {
    status(msg("checkingFiles"));
    await checkUploads(filesOf(d));
    const repo = access.client();
    if (!repo) {
      status(msg("filesReady"));
      access.open();
      return;
    }
    const { sha, value } = await publish(repo, d, status);
    drafts.saved(d, sha, value);
    library.record(d.slug, value);
    library.include(d.slug);
    show(d.slug);
    library.categories();
  } catch (e) {
    status(msg("draftKept", { error: errorCopy(e, "saveFailed") }), true);
  } finally {
    busy = false;
    controls();
    library.render();
  }
}
$("new-product").onclick = () => createNew();
$("retry-library").onclick = loadPublic;
$("reload-product").onclick = reload;
$("discard").onclick = () => {
  const d = current();
  if (busy || !window.confirm(display(msg("confirmDiscard")))) return;
  ++selection;
  if (!d.base) {
    drafts.remove(drafts.activeKey);
    createNew();
  } else {
    drafts.put(drafts.activeKey, draftFrom(d.slug, d.base, d.sha));
    show(drafts.activeKey, true);
  }
};
$("product-form").onsubmit = save;
$("product-form").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("input:not([type=file]):not([type=color])"))
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
window.addEventListener("pagehide", drafts.releaseAll);
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  drafts.restorePreviews();
  editor.summary();
  library.render();
});
mountLanguagePicker($("studio-language"));
localizeStudio();
createNew(false);
loadPublic();
