import { mountLanguagePicker } from '../../assets/language-picker.js';
import { byId } from './ui/copy.js';
import { mountInspectionDialog } from './ui/dialog.js';

export function mountPresentation() {
  const params = new URLSearchParams(location.search);
  const embedded = window.parent !== window && params.get('embed') === '1';
  function setInspectionLayout(isolated) {
    byId('instrument').classList.toggle('inspection-layout', isolated);
    byId('model-tools').open = !isolated;
  }
  if (!embedded) {
    const picker = byId('exhibit-language');
    mountLanguagePicker(picker);
    mountInspectionDialog(picker, setInspectionLayout);
  } else {
    document.documentElement.classList.add('exhibit-embedded');
    if (params.has('inspect')) {
      setInspectionLayout(true);
    } else {
      new ResizeObserver(() => {
        const height = Math.ceil(document.body.getBoundingClientRect().height);
        window.parent.postMessage({ type: 'fgk:viewer-size', height }, location.origin);
      }).observe(document.body);
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        window.parent.postMessage({ type: 'fgk:request-close' }, location.origin);
      }
    });
  }
  return { embedded };
}
