const API_ROOT = "https://api.github.com";
const OWNER = "Georgy-hook";
const REPOSITORY = "fgk-corp";
const BRANCH = "main";

export class GitHubRepository {
  constructor(token) {
    this.token = token;
    this.owner = OWNER;
    this.repository = REPOSITORY;
    this.branch = BRANCH;
  }

  clear() {
    this.token = "";
  }

  async connect() {
    const repository = await this.request(`/repos/${this.owner}/${this.repository}`);

    const canWrite = repository.permissions?.push || repository.permissions?.maintain || repository.permissions?.admin;

    if (!canWrite) {
      throw new Error("У этого аккаунта нет прав на запись в FGK Corp.");
    }

    await this.getRef();
    return repository;
  }

  async request(path, options = {}) {
    if (!this.token) {
      throw new Error("Сеанс с GitHub завершён.");
    }

    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      cache: options.method ? undefined : "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const responseText = response.status === 204 ? "" : await response.text();
    let body = null;

    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = { message: responseText };
      }
    }

    if (!response.ok) {
      const detail = typeof body?.message === "string" ? body.message : response.statusText;
      throw new Error(`GitHub ${response.status}: ${detail}`);
    }

    return body;
  }

  async getRef() {
    const branch = encodeURIComponent(this.branch);
    return this.request(`/repos/${this.owner}/${this.repository}/git/ref/heads/${branch}`);
  }

  async getSnapshot() {
    const ref = await this.getRef();
    const headSha = ref.object.sha;
    const commit = await this.request(`/repos/${this.owner}/${this.repository}/git/commits/${headSha}`);
    const treeSha = commit.tree.sha;
    const tree = await this.request(`/repos/${this.owner}/${this.repository}/git/trees/${treeSha}?recursive=1`);

    if (tree.truncated) {
      throw new Error("В репозитории слишком много файлов для безопасной загрузки каталога.");
    }

    return {
      headSha,
      treeSha,
      files: new Map(tree.tree.map((entry) => [entry.path, entry])),
    };
  }

  async readJsonFile(snapshot, path) {
    const entry = snapshot.files.get(path);

    if (!entry || entry.type !== "blob") {
      return { exists: false, sha: null, value: null };
    }

    const blob = await this.request(`/repos/${this.owner}/${this.repository}/git/blobs/${entry.sha}`);

    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new Error(`Не удалось прочитать файл ${path}.`);
    }

    try {
      const bytes = base64ToBytes(blob.content);
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return { exists: true, sha: entry.sha, value };
    } catch {
      throw new Error(`Файл ${path} не содержит корректный JSON.`);
    }
  }

  async commitFiles(snapshot, changes, onProgress = () => {}) {
    if (changes.length === 0) {
      throw new Error("Нет изменений для публикации.");
    }

    const treeEntries = [];

    for (const [index, change] of changes.entries()) {
      validateRepositoryPath(change.path);
      onProgress(`Загружаю файлы ${index + 1} из ${changes.length}…`);
      const blob = await this.request(`/repos/${this.owner}/${this.repository}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: change.content, encoding: change.encoding }),
      });
      treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    onProgress("Формирую один коммит каталога…");
    const tree = await this.request(`/repos/${this.owner}/${this.repository}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: snapshot.treeSha, tree: treeEntries }),
    });
    const commit = await this.request(`/repos/${this.owner}/${this.repository}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: "Catalog: Publish model changes\n\n- Update model files and product metadata\n- Refresh the catalog index",
        tree: tree.sha,
        parents: [snapshot.headSha],
      }),
    });

    onProgress("Публикую изменения в main…");
    try {
      await this.request(`/repos/${this.owner}/${this.repository}/git/refs/heads/${encodeURIComponent(this.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (/GitHub (?:409|422)/.test(error.message)) {
        throw new Error("Ветка main обновилась во время сохранения. Перезагрузите карточку и повторите попытку.");
      }

      throw error;
    }

    return commit.sha;
  }
}

export function encodeTextToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

export function encodeFileToBase64(file) {
  return file.arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer)));
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function validateRepositoryPath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error("Недопустимый путь к файлу в каталоге.");
  }
}
