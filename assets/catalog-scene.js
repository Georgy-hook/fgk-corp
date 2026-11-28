import { asset } from './store/catalog-data.js';
import { byId } from './store/dom.js';
import { createGallery } from './store/gallery.js';
import { createSceneHost } from './store/scene-host.js';
import { t } from './store/messages.js';

export function createStudio({ onColor }) {
  const plate = byId('plate');
  const block = byId('scene-block');
  const trigger = byId('open-viewer');
  const done = byId('close-viewer');
  const dialog = byId('inspection-dialog');
  const compact = matchMedia('(max-width: 900px), (pointer: coarse)');
  const host = createSceneHost(byId('viewer-mount'), { onColor, onClose: requestClose });
  const gallery = createGallery(close);
  let product;
  let display;
  let returnY = 0;

  function close() {
    host.close();
    plate.hidden = false;
    block.hidden = true;
    if (block.parentElement !== dialog) return;
    dialog.close();
    document.documentElement.classList.remove('inspecting');
    byId('gallery').before(block);
    window.scrollTo(0, returnY);
  }
  function start(fromHistory = false) {
    if (!product || !block.hidden) return;
    const isolated = compact.matches && typeof dialog.showModal === 'function';
    if (isolated) {
      returnY = window.scrollY;
      dialog.append(block);
      document.documentElement.classList.add('inspecting');
      if (!fromHistory && history.state?.fgkInspect !== product.slug) {
        history.pushState({ ...history.state, fgkInspect: product.slug }, '');
      }
    }
    done.textContent = t(isolated ? 'done' : 'backViews');
    byId('scene-title').textContent = display.name;
    plate.hidden = !isolated;
    block.hidden = false;
    if (isolated) dialog.showModal();
    done.focus({ preventScroll: true });
    gallery.inspect(true);
    host.open(product, display, isolated);
  }
  function finish() {
    close();
    gallery.inspect(false);
    trigger.focus({ preventScroll: true });
  }
  function requestClose() {
    if (dialog.open && history.state?.fgkInspect === product.slug) history.back();
    finish();
  }
  trigger.addEventListener('click', () => start());
  done.addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  window.addEventListener('popstate', () => {
    if (dialog.open && history.state?.fgkInspect !== product?.slug) finish();
    else if (!dialog.open && product && history.state?.fgkInspect === product.slug) start(true);
  });
  document.addEventListener('keydown', (event) => {
    if (!block.hidden && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      requestClose();
    }
  });
  return {
    setProduct(canonical, translated) {
      close();
      product = canonical;
      display = translated;
      const printable = product.stl.some(
        ({ file }) => asset(product, file) && /\.stl$/i.test(file),
      );
      trigger.hidden = !(
        asset(product, product.viewer) ||
        asset(product, product.glb) ||
        printable
      );
      byId('scene-fallback').hidden = true;
      gallery.setProduct(display);
    },
    refreshLanguage(translated) {
      display = translated;
      done.textContent = t(dialog.open ? 'done' : 'backViews');
      byId('scene-title').textContent = display.name;
      gallery.refreshLanguage(display);
      host.refreshLanguage(display);
    },
    sendColor: host.setPaint,
  };
}
