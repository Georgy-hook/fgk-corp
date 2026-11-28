import { GitHubRepository } from "./repository.js";
import { indexAt } from "./catalog.js";
import { $, message } from "./editor.js";

// Credentials never enter editor state. A closed dialog also invalidates an in-flight connection.
export function createAccess({ connected, disconnected }) {
  let candidate = null,
    repo = null;
  const dialog = $("access-dialog"),
    form = $("access-form"),
    token = $("access-token"),
    submit = form.querySelector("button[type=submit]");
  function resetForm() {
    token.value = "";
    candidate?.clear();
    candidate = null;
    submit.disabled = false;
  }
  function close() {
    resetForm();
    dialog.close();
  }
  function open() {
    message($("access-status"), "");
    const separate = window.top !== window.self || window.opener !== null;
    form.hidden = separate;
    $("access-separate").hidden = !separate;
    dialog.showModal();
    if (separate) $("access-separate").querySelector("a").focus();
    else token.focus();
  }
  function signOut() {
    resetForm();
    repo?.clear();
    repo = null;
    disconnected();
  }
  dialog.addEventListener("cancel", resetForm);
  $("access-close").onclick = close;
  $("session").onclick = () => (repo ? signOut() : open());
  window.addEventListener("pagehide", () => {
    if (dialog.open) close();
    signOut();
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (candidate || window.top !== window.self || window.opener !== null) return;
    if (!token.value.trim().startsWith("github_pat_")) {
      token.value = "";
      message(
        $("access-status"),
        "Нужен fine-grained token с префиксом github_pat_.",
        true,
      );
      return;
    }
    const client = new GitHubRepository(token.value.trim());
    candidate = client;
    token.value = "";
    submit.disabled = true;
    message($("access-status"), "Проверяем доступ к fgk-corp…");
    try {
      await client.connect();
      if (candidate !== client) return;
      const snapshot = await client.getSnapshot();
      if (candidate !== client) return;
      const index = await indexAt(client, snapshot);
      if (candidate !== client) return;
      candidate = null;
      repo = client;
      close();
      connected(client, snapshot, index.all);
    } catch (e) {
      client.clear();
      if (candidate === client) {
        resetForm();
        message(
          $("access-status"),
          e.message || "Не удалось подключиться к GitHub.",
          true,
        );
        token.focus();
      }
    }
  };
  return { open, client: () => repo };
}
