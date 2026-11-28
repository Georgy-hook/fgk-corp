import { byId, percentage, t } from './copy.js';

const definitions = [
  { control: 'bay', prefix: 'bay', initial: 0, family: 'bay' },
  { control: 'brakeUpper', prefix: 'brake-upper', initial: 100, family: 'brake', suffix: 'Upper' },
  { control: 'brakeLower', prefix: 'brake-lower', initial: 100, family: 'brake', suffix: 'Lower' },
];

export function mountMechanisms(getViewer) {
  const sliders = definitions.map((definition) => ({
    ...definition,
    input: byId(`${definition.prefix}-opening`),
    reading: byId(`${definition.prefix}-reading`),
    partIds: [],
  }));

  function refreshReading({ control, input, reading }) {
    const value = input.valueAsNumber;
    let text = percentage(value);
    if (value === 0) text = t(control === 'bay' ? 'bayClosed' : 'brakeClosed');
    if (value === 100) text = t(control === 'bay' ? 'bayOpen' : 'brakeOpen');
    reading.textContent = text;
    input.setAttribute('aria-valuetext', text);
  }
  for (const slider of sliders) {
    slider.reading.removeAttribute('data-i18n'); // Dynamic range output, not a static caption.
    slider.input.addEventListener('input', () => {
      getViewer()?.setOpening(slider.control, slider.input.valueAsNumber / 100);
      refreshReading(slider);
    });
  }

  return {
    refresh() {
      sliders.forEach(refreshReading);
    },
    enable(parts) {
      for (const slider of sliders) {
        slider.partIds = parts
          .filter(
            ({ articulation, id }) =>
              articulation?.family === slider.family &&
              (!slider.suffix || id.endsWith(slider.suffix)),
          )
          .map(({ id }) => id);
        slider.input.parentElement.hidden = !slider.partIds.length;
      }
      byId('mechanisms').hidden = !sliders.some(({ partIds }) => partIds.length);
    },
    limitTo(part) {
      for (const { input, partIds } of sliders) input.disabled = !!part && !partIds.includes(part);
    },
    preset(view) {
      for (const slider of sliders) {
        slider.input.value = slider.control === 'bay' && view === 'opened' ? 100 : slider.initial;
        refreshReading(slider);
      }
    },
  };
}
