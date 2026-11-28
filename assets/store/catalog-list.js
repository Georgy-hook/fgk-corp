import { getLocale } from '../i18n.js';
import { productCopy } from '../product-copy.js';
import { asset, modelUrl } from './catalog-data.js';
import { byId, element, isPlainClick } from './dom.js';
import { t } from './messages.js';

function searchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase(getLocale())
    .replaceAll('ё', 'е')
    .replace(/[‘’ʻʼ`]/g, "'")
    .trim();
}

function searchableProduct(source) {
  const display = productCopy(source);
  const terms = [
    source.slug,
    source.name,
    source.category,
    display.name,
    display.category,
    display.description,
    ...display.details.map(({ value }) => value),
  ];
  return { source, display, text: searchText(terms.join(' ')) };
}

function productCard({ source, display }, selected) {
  const card = element('a', null, 'product-card');
  card.href = modelUrl(source.slug);
  card.dataset.slug = source.slug;
  card.setAttribute('aria-current', selected === source.slug ? 'page' : 'false');
  const imageUrl = asset(source, source.gallery?.[0]) || asset(source, source.image);
  const image = element(imageUrl ? 'img' : 'span');
  if (imageUrl) {
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
  }
  card.append(
    image,
    element('span', display.name, 'card-name'),
    element('span', display.category || t('noCategory'), 'card-category'),
    element('span', t('open'), 'card-open'),
  );
  return card;
}

export function createCatalogList(onChoose) {
  const grid = byId('catalog-grid');
  const search = byId('catalog-search');
  const category = byId('catalog-category');
  const reset = byId('reset-filter');
  let rows = [];
  let selected;

  function render() {
    const words = searchText(search.value).split(/\s+/).filter(Boolean);
    const filtered = rows.filter(
      ({ source, text }) =>
        (!category.value || category.value === source.category) &&
        words.every((word) => text.includes(word)),
    );
    const activeFilter = Boolean(category.value || words.length);
    byId('catalog-status').textContent = t(activeFilter ? 'found' : 'count', {
      count: filtered.length,
      total: rows.length,
    });
    byId('catalog-empty').textContent = t(rows.length ? 'empty' : 'noModels');
    byId('catalog-empty').hidden = filtered.length > 0;
    reset.hidden = !activeFilter;
    const previousFocus = grid.contains(document.activeElement)
      ? document.activeElement.dataset.slug
      : null;
    grid.replaceChildren(...filtered.map((row) => productCard(row, selected)));
    if (previousFocus)
      grid.querySelector(`[data-slug="${previousFocus}"]`)?.focus({ preventScroll: true });
  }
  function setProducts(products) {
    rows = products.map(searchableProduct);
    const choices = new Map(
      rows.map(({ source, display }) => [source.category, display.category || t('noCategory')]),
    );
    const oldValue = category.value;
    const sorted = [...choices].sort((a, b) => a[1].localeCompare(b[1], getLocale()));
    category.replaceChildren(
      new Option(t('allCategories'), ''),
      ...sorted.map(([key, value]) => new Option(value, key)),
    );
    if (choices.has(oldValue)) category.value = oldValue;
    byId('category-field').hidden = choices.size < 2;
    byId('catalog-tools').hidden = !rows.length;
    render();
  }
  grid.addEventListener('click', (event) => {
    const card = event.target.closest('.product-card[data-slug]');
    if (!card || !isPlainClick(event)) return;
    event.preventDefault();
    onChoose(card.dataset.slug);
  });
  search.addEventListener('input', render);
  category.addEventListener('change', render);
  reset.addEventListener('click', () => {
    search.value = '';
    category.value = '';
    render();
    search.focus();
  });
  return {
    setProducts,
    markCurrent(slug) {
      selected = slug;
      for (const card of grid.children)
        card.setAttribute('aria-current', card.dataset.slug === slug ? 'page' : 'false');
    },
  };
}
