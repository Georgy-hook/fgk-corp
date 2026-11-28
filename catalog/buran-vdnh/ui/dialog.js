import { byId } from './copy.js';

export function mountInspectionDialog(picker, setLayout) {
  const dialog = byId('exhibit-inspection');
  const done = byId('inspect-done');
  const instrument = byId('instrument');
  const toggle = byId('open-model');
  const hero = instrument.parentElement;
  const mast = picker.parentElement;
  const compact = matchMedia('(max-width: 900px), (pointer: coarse)');
  let returnY = 0;

  function openInspection() {
    returnY = window.scrollY;
    dialog.append(instrument);
    done.before(picker);
    setLayout(true);
    document.documentElement.classList.add('inspection-open');
    dialog.showModal();
    done.focus({ preventScroll: true });
  }
  function closeInspection() {
    window.dispatchEvent(new Event('fgk:viewer-close'));
    dialog.close();
    setLayout(false);
    document.documentElement.classList.remove('inspection-open');
    hero.prepend(instrument);
    mast.append(picker);
    toggle.focus({ preventScroll: true });
    window.scrollTo(0, returnY);
  }
  function requestClose() {
    if (history.state?.fgkExhibit) history.back();
    closeInspection();
  }
  toggle.addEventListener(
    'click',
    () => {
      if (
        !dialog.open &&
        compact.matches &&
        typeof dialog.showModal === 'function' &&
        toggle.getAttribute('aria-expanded') === 'false'
      ) {
        openInspection();
        if (!history.state?.fgkExhibit)
          history.pushState({ ...history.state, fgkExhibit: true }, '');
      }
    },
    { capture: true },
  );
  done.addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  window.addEventListener('popstate', () => {
    if (dialog.open && !history.state?.fgkExhibit) closeInspection();
    else if (!dialog.open && history.state?.fgkExhibit) toggle.click();
  });
}
