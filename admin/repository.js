import { msg, StudioError } from "./copy.js";

const ROOT = "https://api.github.com/repos/Georgy-hook/fgk-corp";
const PRODUCT = /^catalog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/product\.json$/;
const INDEX = "catalog/index.json";
const MEDIA =
  /^(?:assets|files)\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.(?:avif|png|jpe?g|webp|stl|zip|glb)$/i;

function gitSha(value) {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new StudioError(msg("noSha"));
  return value;
}

function checkBatch(changes) {
  const documents = changes.filter(({ path }) => PRODUCT.test(path));
  if (documents.length !== 1) throw new StudioError(msg("singleRecord"));
  const [, slug] = documents[0].path.match(PRODUCT);
  const prefix = `catalog/${slug}/`;
  const paths = new Set();
  for (const { path } of changes) {
    const media = path.startsWith(prefix) && MEDIA.test(path.slice(prefix.length));
    if ((!media && path !== INDEX && path !== documents[0].path) || paths.has(path)) {
      throw new StudioError(msg("badBatch"));
    }
    paths.add(path);
  }
  return slug;
}

function githubError(response) {
  const status = response.status;
  let message;
  if (response.headers.get("x-ratelimit-remaining") === "0" || status === 429) {
    message = msg("ghLimit");
  } else if (status === 401) {
    message = msg("ghToken");
  } else if (status === 403 || status === 404) {
    message = msg("ghScope");
  } else {
    message = msg("ghRequest");
  }
  const error = new StudioError(msg("ghError", { code: String(status), reason: message }));
  error.status = status;
  return error;
}

export class GitHubRepository {
  #token;
  #session = new AbortController();
  #json = new Map();

  constructor(token) {
    this.#token = token;
  }

  clear() {
    this.#token = "";
    this.#session.abort();
    this.#json.clear();
  }

  // Only fixed, repository-relative API routes reach this credentialled client.
  async #request(route, method = "GET", body = null) {
    if (!this.#token) throw new StudioError(msg("ghEnded"));
    const request = new AbortController();
    const abort = () => request.abort();
    this.#session.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, method === "POST" ? 120000 : 30000);
    try {
      const response = await fetch(ROOT + route, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.#token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: request.signal,
      });
      if (!response.ok) throw githubError(response);
      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      throw new StudioError(this.#token ? msg("ghNetwork") : msg("sessionEnded"));
    } finally {
      clearTimeout(timer);
      this.#session.signal.removeEventListener("abort", abort);
    }
  }

  async connect() {
    const repo = await this.#request("");
    if (!repo.permissions?.push && !repo.permissions?.maintain && !repo.permissions?.admin) {
      throw new StudioError(msg("noWrite"));
    }
    return repo;
  }

  getRef() {
    return this.#request("/git/ref/heads/main");
  }

  async getSnapshot() {
    const headSha = gitSha((await this.getRef()).object.sha);
    const treeSha = gitSha((await this.#request(`/git/commits/${headSha}`)).tree.sha);
    const treeAt = (sha, recursive = false) =>
      this.#request(`/git/trees/${gitSha(sha)}${recursive ? "?recursive=1" : ""}`);
    const root = await treeAt(treeSha);
    const catalog = root.tree.find((e) => e.path === "catalog" && e.type === "tree");
    const files = new Map();
    if (catalog) {
      const listing = await treeAt(catalog.sha, true);
      if (!listing.truncated) {
        for (const entry of listing.tree) files.set(`catalog/${entry.path}`, entry);
      } else {
        // GitHub caps a recursive tree response at 7 MB. Never use a partial snapshot.
        const queue = [{ prefix: "catalog/", sha: catalog.sha }];
        while (queue.length) {
          const { prefix, sha } = queue.pop();
          const branch = await treeAt(sha);
          if (branch.truncated) throw new StudioError(msg("truncated"));
          for (const entry of branch.tree) {
            const path = prefix + entry.path;
            files.set(path, entry);
            if (entry.type === "tree") queue.push({ prefix: `${path}/`, sha: entry.sha });
          }
        }
      }
    }
    return { headSha, treeSha, files };
  }

  async readJsonFile(snapshot, path) {
    if (path !== INDEX && !PRODUCT.test(path)) throw new StudioError(msg("notProduct"));
    const entry = snapshot.files.get(path);
    if (!entry || entry.type !== "blob") return { exists: false, sha: null, value: null };
    const sha = gitSha(entry.sha);
    if (!this.#json.has(sha)) {
      if (entry.size > 2 * 1024 * 1024) throw new StudioError(msg("largeJson", { path }));
      const blob = await this.#request(`/git/blobs/${sha}`);
      if (blob.encoding !== "base64") throw new StudioError(msg("readError", { path }));
      this.#json.set(sha, JSON.parse(decodeText(blob.content)));
    }
    return { exists: true, sha, value: structuredClone(this.#json.get(sha)) };
  }

  async commitFiles(snapshot, changes, onProgress = () => {}) {
    const slug = checkBatch(changes);
    const baseTree = gitSha(snapshot.treeSha);
    const parent = gitSha(snapshot.headSha);
    const entries = [];
    for (const [index, change] of changes.entries()) {
      const entry = { path: change.path, mode: "100644", type: "blob" };
      onProgress(msg("progress", { done: index + 1, total: changes.length }));
      if (change.path.endsWith(".json")) {
        entry.content = change.encoding === "base64" ? decodeText(change.content) : change.content;
        JSON.parse(entry.content);
      } else {
        const content = change.file ? await encodeFileToBase64(change.file) : change.content;
        const blob = await this.#request("/git/blobs", "POST", { content, encoding: "base64" });
        entry.sha = gitSha(blob.sha);
      }
      entries.push(entry);
    }
    onProgress(msg("committing"));
    const tree = await this.#request("/git/trees", "POST", { base_tree: baseTree, tree: entries });
    const commit = await this.#request("/git/commits", "POST", {
      message: `Catalog: ${slug}`,
      tree: gitSha(tree.sha),
      parents: [parent],
    });
    const sha = gitSha(commit.sha);
    try {
      await this.#request("/git/refs/heads/main", "PATCH", { sha, force: false });
    } catch (error) {
      if ([409, 422].includes(error.status)) {
        throw new StudioError(msg("refFailed"));
      }
      if (error.status) throw error;
      // A lost response is not proof the ref was unchanged. Do not retry a write automatically.
      const latest = await this.getRef().catch(() => null);
      if (latest?.object.sha !== sha)
        throw new StudioError(msg("refUnknown", { sha: sha.slice(0, 7) }));
    }
    return sha;
  }
}

function decodeText(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeTextToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

export async function encodeFileToBase64(file) {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

function bytesToBase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
