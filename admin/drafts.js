import { draftFrom, releasePreview } from "./product.js";

// Each draft owns its cover URL. Replacing/removing a draft always disposes of
// its preview; switching between dirty drafts does not.
export function createDrafts() {
  const drafts = new Map();
  let activeKey = "";
  let sequence = 0;
  const current = () => drafts.get(activeKey);

  function remove(key) {
    const draft = drafts.get(key);
    if (draft) releasePreview(draft);
    drafts.delete(key);
  }

  function put(key, draft) {
    if (draft !== drafts.get(key)) remove(key);
    drafts.set(key, draft);
  }

  function select(key) {
    const previous = current();
    if (activeKey !== key && previous && !previous.base && !previous.dirty) remove(activeKey);
    activeKey = key;
  }

  function create() {
    const key = `@${++sequence}`;
    put(key, draftFrom());
    return key;
  }

  function saved(draft, sha, value) {
    const fresh = draftFrom(draft.slug, value);
    fresh.result = sha;
    // Transfer the preview, as Pages may still be deploying this cover.
    fresh.proofUrl = draft.proofUrl;
    draft.proofUrl = "";
    remove(activeKey);
    put(draft.slug, fresh);
    select(draft.slug);
  }

  function releaseAll() {
    for (const d of drafts.values()) releasePreview(d);
  }

  function restorePreviews() {
    for (const d of drafts.values()) {
      const file = d.cover[0]?.file;
      if (file && !d.proofUrl) d.proofUrl = URL.createObjectURL(file);
    }
  }

  return {
    get activeKey() {
      return activeKey;
    },
    current,
    get: (key) => drafts.get(key),
    has: (key) => drafts.has(key),
    keys: () => drafts.keys(),
    values: () => drafts.values(),
    select,
    create,
    put,
    remove,
    saved,
    releaseAll,
    restorePreviews,
  };
}
