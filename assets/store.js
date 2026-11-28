import { localizedUrl, onLocaleChange, translateTree } from './i18n.js';
import { mountLanguagePicker } from './language-picker.js';
import { loadCatalog, modelUrl } from './store/catalog-data.js';
import { createCatalogList } from './store/catalog-list.js';
import { createProductPanel } from './store/product-panel.js';
import { byId } from './store/dom.js';
import { t } from './store/messages.js';
import { markCurrentSection } from './store/wayfinding.js';

const panel = createProductPanel();
const list = createCatalogList(navigateToProduct);
let products = [];
let current;
let ready = false;
let failed = false;

function applyRoute() {
  const slug = new URL(location.href).searchParams.get('model');
  const match = products.find((product) => product.slug === slug);
  const notice = byId('selection-notice');
  notice.hidden = !slug || Boolean(match);
  notice.textContent = notice.hidden
    ? ''
    : [t('missing'), products.length ? t('firstShown') : ''].join(' ').trim();
  const next = match || products[0];
  if (next && next !== current) {
    current = next;
    panel.select(next);
    list.markCurrent(next.slug);
  }
}

function navigateToProduct(slug) {
  const url = modelUrl(slug);
  if (url.href !== location.href) history.pushState(null, '', url);
  if (current?.slug === slug) panel.notifyOrder();
  applyRoute();
  byId('model-title').focus({ preventScroll: true });
  byId('model-explorer').scrollIntoView();
}

function localize() {
  // The order form and the exhibit own their copy; never walk or replace another component's DOM.
  translateTree(document.querySelector('header'), t);
  translateTree(document.querySelector('footer'), t);
  translateTree(document.querySelector('.skip-link'), t);
  translateTree(byId('model-explorer'), t);
  translateTree(byId('catalog'), t);
  translateTree(document.querySelector('.order-intro'), t);
  byId('studio-link').href = localizedUrl('admin/');
  document.querySelector('meta[name="description"]').content = t('intro');
  if (!current) document.title = t('homeTitle');
  if (ready) {
    list.setProducts(products);
    panel.refreshLanguage();
    applyRoute();
  }
  if (failed) byId('catalog-status').textContent = t('loadError');
}

mountLanguagePicker(byId('site-language'));
mountLanguagePicker(byId('scene-language'));
localize();
markCurrentSection(document.querySelector('.masthead nav'));
onLocaleChange(localize);
window.addEventListener('popstate', () => {
  if (ready) applyRoute();
});

try {
  products = await loadCatalog();
  ready = true;
  byId('model-explorer').hidden = !products.length;
  window.dispatchEvent(new CustomEvent('fgk:catalog', { detail: products }));
  list.setProducts(products);
  applyRoute();
} catch {
  failed = true;
  window.dispatchEvent(new CustomEvent('fgk:catalog', { detail: [] }));
  byId('catalog-status').textContent = t('loadError');
}
