import { onLocaleChange, translateTree } from '../../assets/i18n.js';
import { mountPresentation } from './embed.js';
import { t } from './ui/copy.js';
import { mountCatalogue } from './ui/parts.js';
import { mountInspection } from './ui/inspection.js';
import { mountScene } from './ui/scene.js';
import { mountPalette } from './ui/palette.js';

const catalogue = mountCatalogue();
const inspection = mountInspection(catalogue, () => scene.current());
const scene = mountScene(catalogue, inspection);
const presentation = mountPresentation();
const palette = mountPalette(scene, presentation);

function localize() {
  // Only text and accessibility attributes change; the renderer receives no command.
  translateTree(document, t);
  document.querySelector('meta[name="description"]').content = t('metadata');
  catalogue.refresh();
  palette.refresh();
  inspection.refresh();
  scene.refreshError();
}
localize();
onLocaleChange(localize);
