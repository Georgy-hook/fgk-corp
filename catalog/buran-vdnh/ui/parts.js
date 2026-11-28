import { byId, label, measure, t } from './copy.js';

// The translation boundary is the stable geometry ID, never a translated option label.
const noteFamilies = {
  BayDoorStarboard: 'BayDoorPort',
  WingStarboard: 'WingPort',
  BrakePortUpper: 'BrakePortLower',
  BrakeStarboardLower: 'BrakePortLower',
  BrakeStarboardUpper: 'BrakePortLower',
  BogiePort: 'GearFront',
  BogieStarboard: 'GearFront',
};
const groupKeys = {
  Фюзеляж: 'groupHull',
  Оперение: 'groupFoil',
  'Шасси и стенд': 'groupStand',
};

function enableAR(path) {
  if (path !== 'files/Buran.usdz') return;
  const ar = byId('quick-look');
  if (ar.relList.supports?.('ar')) {
    ar.href = path;
    byId('ar-option').hidden = false;
  } else {
    const download = byId('usdz-download');
    download.href = path;
    download.hidden = false;
  }
}

export function mountCatalogue() {
  const parts = new Map();
  const groups = new Map();
  const select = byId('parts');
  let dimensions;

  function refresh() {
    for (const [key, group] of groups) group.label = t(key);
    if (!dimensions) return;
    byId('scale').textContent = dimensions.scale;
    byId('size').textContent = measure(dimensions.dimensions);
    byId('orbiter').textContent = measure(dimensions.orbiter);
    byId('printer').textContent = measure(dimensions.printer);
  }

  function populate(data) {
    if (!data?.parts?.length || parts.size) return;
    dimensions = data;
    for (const item of data.parts) {
      parts.set(item.id, item);
      const key = groupKeys[item.group] || 'navDetails';
      if (!groups.has(key)) {
        const group = document.createElement('optgroup');
        groups.set(key, group);
        select.append(group);
      }
      const option = new Option(t(item.id), item.id);
      option.dataset.i18n = item.id;
      groups.get(key).append(option);
    }
    refresh();
    if (data === window.BURAN_CATALOG) enableAR(data.quickLook);
  }

  function show(id, isolated) {
    const item = parts.get(id);
    byId('part-card').hidden = !item;
    select.value = item?.id || '';
    if (!item) return;
    label(byId('part-name'), id);
    label(byId('part-note'), `note${noteFamilies[id] || id}`);
    const sizes = [
      ['assembledSize', measure(item.size)],
      ['printedSize', measure(item.printSize)],
    ];
    byId('part-size').textContent = sizes
      .filter(([, size]) => size)
      .map(([key, size]) => t(key, { size }))
      .join(' ');
    label(byId('isolate'), isolated ? 'restoreOthers' : 'isolate');
    byId('isolate').setAttribute('aria-pressed', String(isolated));
    const download = byId('part-download');
    download.hidden = !/^files\/stl\/[^/\\?#]+\.stl$/iu.test(item.stl);
    if (download.hidden) download.removeAttribute('href');
    else download.href = item.stl;
  }

  populate(window.BURAN_CATALOG);
  return { parts, populate, show, refresh };
}
