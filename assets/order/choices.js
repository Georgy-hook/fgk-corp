import { productCopy } from '../product-copy.js';

const discussFinish = 'Обсудим в переписке';

export function selectedLabels(product, finish, t) {
  const copy = productCopy(product);
  return {
    model: copy.name,
    color:
      copy.colors.find((color) => color.canonicalName === finish)?.name ??
      (finish === discussFinish ? t('discuss') : finish),
  };
}

export function mountChoices(form, t) {
  const products = new Map();
  const { model, color } = form.elements;
  const swatch = form.querySelector('.order-swatch');
  let loaded = false;
  const current = () => products.get(model.value);

  function updateSwatch() {
    const hex = current()?.colors.find((entry) => entry.name === color.value)?.hex;
    swatch.hidden = !/^#[\da-f]{6}$/i.test(hex || '');
    swatch.style.backgroundColor = swatch.hidden ? '' : hex;
  }

  function translate() {
    for (const option of model.options) {
      const product = products.get(option.value);
      option.textContent = product
        ? productCopy(product).name
        : t(loaded ? 'unavailable' : 'loading');
    }
    const product = current();
    const colors = product ? productCopy(product).colors : [];
    for (const option of color.options) {
      option.textContent =
        colors.find((entry) => entry.canonicalName === option.value)?.name ??
        t(product ? 'discuss' : loaded ? 'noColors' : 'chooseFirst');
    }
  }

  function selectModel(slug, finish) {
    model.value = slug;
    const product = current();
    model.disabled = color.disabled = !product;
    color.options.length = 0;
    for (const entry of product?.colors || []) color.add(new Option(entry.name, entry.name));
    if (!color.options.length) color.add(new Option('', product ? discussFinish : ''));
    if (finish && [...color.options].some((option) => option.value === finish))
      color.value = finish;
    translate();
    updateSwatch();
  }

  function add(product) {
    if (!product?.slug || !product.name) return;
    if (!products.has(product.slug)) model.add(new Option(product.name, product.slug));
    products.set(product.slug, {
      ...product,
      colors: (product.colors || []).filter((entry) => entry?.name),
    });
  }

  model.addEventListener('change', () => selectModel(model.value));
  color.addEventListener('change', updateSwatch);
  return {
    current,
    translate,
    load(catalog) {
      loaded = true;
      const slug = model.value;
      const finish = color.value;
      products.clear();
      model.options.length = 0;
      catalog.forEach(add);
      if (!products.size) model.add(new Option('', ''));
      selectModel(products.has(slug) ? slug : model.value, finish);
    },
    select(selection) {
      if (!products.has(selection.slug)) {
        if (!products.size) model.options.length = 0;
        add(selection);
      }
      const choices = products.get(selection.slug).colors;
      if (selection.color && !choices.some((entry) => entry.name === selection.color)) {
        choices.push({ name: selection.color, hex: selection.colorHex });
      }
      selectModel(selection.slug, selection.color);
    },
  };
}
