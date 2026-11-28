const catalog = new URL('../../catalog/', import.meta.url);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const array = (value) => (Array.isArray(value) ? value : []);

export function asset(product, path) {
  if (typeof path !== 'string' || !path.trim()) return null;
  try {
    const url = new URL(path, product.base);
    return url.origin === location.origin && url.pathname.startsWith(product.base.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Presentation (including language) is derived later. Catalog data remains safe to use for orders.
function normalize(source) {
  if (!source || !slugPattern.test(source.slug || '') || !source.name?.trim?.()) return null;
  const downloads = typeof source.stl === 'string' ? [{ file: source.stl }] : array(source.stl);
  return {
    ...source,
    base: new URL(`${source.slug}/`, catalog),
    category: source.category?.trim?.() || '',
    description: source.description || '',
    colors: array(source.colors).filter((entry) => entry?.name && /^#[\da-f]{6}$/i.test(entry.hex)),
    details: array(source.details).filter(
      (entry) => entry?.label && typeof entry.value === 'string',
    ),
    stl: downloads.filter((entry) => entry?.file),
  };
}

async function readJson(file) {
  const response = await fetch(new URL(file, catalog));
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  return response.json();
}

export async function loadCatalog() {
  try {
    const combined = await readJson('products.json');
    if (!Array.isArray(combined)) throw new Error('Invalid catalog feed');
    return combined.map(normalize).filter(Boolean);
  } catch {
    // A plain source checkout has product folders but no generated Pages feed.
    const slugs = await readJson('index.json');
    if (!Array.isArray(slugs)) throw new Error('Invalid catalog index');
    const products = await Promise.all(
      slugs
        .filter((slug) => slugPattern.test(slug))
        .map(async (slug) => {
          const data = await readJson(`${slug}/product.json`);
          return normalize({ ...data, slug });
        }),
    );
    return products.filter(Boolean);
  }
}

export function modelUrl(slug) {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('model', slug);
  return url;
}
