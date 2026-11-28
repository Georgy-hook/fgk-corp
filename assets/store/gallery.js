import { asset } from './catalog-data.js';
import { byId, element, isPlainClick } from './dom.js';
import { t } from './messages.js';

const exhibitViews = new Map([
  ['assets/cockpit.webp', 'cockpit'],
  ['assets/fin.webp', 'fin'],
  ['assets/gear.webp', 'gear'],
]);

export function createGallery(onChoose) {
  const strip = byId('gallery');
  const poster = byId('model-poster');
  const plate = byId('plate');
  let product;
  let photos = [];
  let selected = 0;
  let inspecting = false;

  function caption({ file }, index) {
    if (!index) return t('overview');
    const key = product.slug === 'buran-vdnh' && exhibitViews.get(file);
    return key ? t(key) : t('shot', { n: index + 1 });
  }

  function show() {
    if (!product) return;
    const photo = photos[selected];
    const name = photo ? caption(photo, selected) : t('noPhoto');
    if (photo) {
      if (poster.src !== photo.url) poster.src = photo.url;
      poster.alt = `${product.name}: ${name}`;
    } else poster.removeAttribute('src');
    poster.hidden = !photo;
    byId('shot-name').textContent = name;
    const fmt = (n) => String(n).padStart(2, '0');
    byId('shot-index').textContent = photo ? `${fmt(selected + 1)} / ${fmt(photos.length)}` : '';
    plate.toggleAttribute(
      'data-buran-overview',
      product.slug === 'buran-vdnh' && photo?.file === 'assets/hero.webp',
    );
    plate.toggleAttribute(
      'data-buran-detail',
      product.slug === 'buran-vdnh' && exhibitViews.has(photo?.file),
    );
    [...strip.children].forEach((link, i) => {
      link.lastElementChild.textContent = caption(photos[i], i);
      link.setAttribute('aria-current', String(!inspecting && i === selected));
    });
    configureAR();
  }

  function configureAR() {
    const link = byId('ar-link');
    const usdz = asset(product, product.usdz);
    const supported = Boolean(usdz && link.relList.supports?.('ar'));
    byId('ar-entry').hidden = !supported;
    if (!supported) {
      link.removeAttribute('href');
      return;
    }
    link.href = usdz;
    link.firstElementChild.src =
      photos[0]?.url || new URL('../icons/box.svg', import.meta.url).href;
    link.setAttribute('aria-label', t('arLabel', { name: product.name }));
    byId('ar-finish').textContent = t(product.slug === 'buran-vdnh' ? 'museumAR' : 'originalAR');
  }

  strip.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-shot]');
    if (!isPlainClick(event) || !link) return;
    event.preventDefault();
    onChoose();
    selected = Number(link.dataset.shot);
    inspecting = false;
    show();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      poster.animate?.([{ opacity: 0.55 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    }
  });

  return {
    setProduct(next) {
      product = next;
      selected = 0;
      photos = [...new Set([product.image, ...(product.gallery || [])])]
        .map((file) => ({ file, url: asset(product, file) }))
        .filter(({ url }) => url);
      strip.replaceChildren(
        ...photos.map(({ url }, i) => {
          const link = element('a');
          link.href = url;
          link.dataset.shot = i;
          const image = element('img');
          image.src = url;
          image.alt = '';
          image.loading = 'lazy';
          link.append(image, element('span'));
          return link;
        }),
      );
      strip.hidden = photos.length < 2;
      inspecting = false;
      show();
    },
    refreshLanguage(next) {
      product = next;
      show();
    },
    inspect(value) {
      inspecting = value;
      show();
    },
  };
}
