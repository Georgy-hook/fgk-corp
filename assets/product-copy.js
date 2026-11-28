import { getLocale } from './i18n.js';

function text(translated, original) {
  return typeof translated === 'string' && translated.trim() ? translated : original;
}

// Only presentation fields have translations. Collection entries are keyed by the
// source color name, specification label or download path, never by array index.
export function productCopy(product, locale = getLocale()) {
  const copy = product.i18n?.[locale] || {};
  return {
    ...product,
    canonicalName: product.name,
    name: text(copy.name, product.name),
    description: text(copy.description, product.description),
    category: text(copy.category, product.category),
    colors: (product.colors || []).map((color) => ({
      ...color,
      canonicalName: color.name,
      name: text(copy.colors?.[color.name], color.name),
    })),
    details: (product.details || []).map((detail) => {
      const entry = copy.details?.[detail.label];
      return {
        ...detail,
        label: text(entry?.label, detail.label),
        value: text(entry?.value, detail.value),
      };
    }),
    stl: Array.isArray(product.stl)
      ? product.stl.map((download) => ({
          ...download,
          label: text(copy.stl?.[download.file], download.label),
        }))
      : product.stl,
  };
}
