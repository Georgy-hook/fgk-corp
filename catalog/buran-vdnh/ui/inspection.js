import { byId, t } from './copy.js';
import { mountMechanisms } from './mechanisms.js';

export function mountInspection(catalogue, getViewer) {
  const { parts } = catalogue;
  const state = { selected: null, isolated: false, exploded: false, underside: false };
  const mechanisms = mountMechanisms(getViewer);
  let notice = null;

  function updateNotice() {
    if (!notice) return;
    byId('notice').textContent = t(notice.key, notice.label ? { label: t(notice.label) } : {});
  }
  function announce(key, label) {
    notice = { key, label };
    updateNotice();
  }
  function render() {
    byId('assembled').setAttribute('aria-pressed', String(!state.exploded && !state.underside));
    byId('exploded').setAttribute('aria-pressed', String(state.exploded));
    byId('underside').setAttribute('aria-pressed', String(state.underside));
    mechanisms.limitTo(state.isolated && state.selected);
    catalogue.show(state.selected, state.isolated);
  }
  function choose(id, fromScene = false) {
    const viewer = getViewer();
    if (state.underside && viewer?.isSupport(id)) {
      state.underside = false;
      viewer.inspectBottom(false);
    }
    state.selected = parts.has(id) ? id : null;
    if (!state.selected) state.isolated = false;
    viewer?.select(state.selected, state.isolated);
    render();
    if (fromScene && state.selected) announce('selectedPart', id);
  }
  function mode(exploded) {
    const viewer = getViewer();
    if (state.underside) viewer?.inspectBottom(false);
    if (state.underside || state.isolated) viewer?.select(state.selected, false);
    state.underside = false;
    state.isolated = false;
    state.exploded = exploded;
    viewer?.explode(exploded);
    render();
  }
  function reset() {
    Object.assign(state, { selected: null, isolated: false, exploded: false, underside: false });
    mechanisms.preset('home');
    getViewer()?.reset();
    render();
    announce('resetNotice');
  }
  function enable(enabled) {
    for (const id of ['isolate', 'assembled', 'exploded', 'underside', 'shot'])
      byId(id).disabled = !enabled;
    byId('gesture').hidden = !enabled;
    if (enabled) mechanisms.enable(window.BURAN.parts);
    else byId('mechanisms').hidden = true;
  }

  byId('parts').addEventListener('change', ({ target }) => choose(target.value));
  byId('shot').addEventListener('change', ({ target }) => {
    const name = target.value.slice(2);
    if (!getViewer()?.setView(name)) return;
    announce('viewNotice', target.selectedOptions[0].dataset.i18n);
    target.value = '';
    Object.assign(state, {
      selected: null,
      isolated: false,
      exploded: false,
      underside: name === 'underside',
    });
    mechanisms.preset(name);
    render();
    byId('model').focus({ preventScroll: true });
  });
  byId('underside').addEventListener('click', () => {
    const viewer = getViewer();
    if (!viewer) return;
    Object.assign(state, {
      selected: null,
      isolated: false,
      exploded: false,
      underside: !state.underside,
    });
    viewer.inspectBottom(state.underside);
    render();
    announce(state.underside ? 'bottomNotice' : 'standNotice');
  });
  byId('isolate').addEventListener('click', () => {
    const viewer = getViewer();
    if (!viewer || !state.selected) return;
    state.isolated = !state.isolated;
    viewer.select(state.selected, state.isolated);
    render();
  });
  byId('assembled').addEventListener('click', () => mode(false));
  byId('exploded').addEventListener('click', () => mode(true));
  for (const button of document.querySelectorAll('[data-command]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.command;
      if (action === 'reset') reset();
      else getViewer()?.zoom(action === 'in' ? 1.25 : 0.8);
    });
  }

  return {
    pick: (id) => choose(id, true),
    reset,
    ready(viewer, savedView) {
      enable(true);
      if (savedView) viewer.restoreView(savedView);
      else viewer.select(state.selected, state.isolated);
      render();
    },
    unavailable() {
      enable(false);
      byId('model-tools').hidden = !parts.size;
    },
    refresh() {
      mechanisms.refresh();
      render();
      updateNotice();
    },
  };
}
