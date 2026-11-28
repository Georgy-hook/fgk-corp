import { getLocale, translator } from "../assets/i18n.js";
import ru from "./locales/ru.js";
import kk from "./locales/kk.js";
import en from "./locales/en.js";
import be from "./locales/be.js";
import uz from "./locales/uz.js";
import hy from "./locales/hy.js";

export const t = translator({ ru, kk, en, be, uz, hy });
export const msg = (key, vars = {}) => ({ key, vars });

// Keep arguments (including filenames and nested messages) until display time.
// Author text is always a plain string, never a lookup key.
export function display(value) {
  if (typeof value === "number") return value.toLocaleString(getLocale());
  if (typeof value === "string") return value;
  const args = Object.fromEntries(
    Object.entries(value.vars).map(([name, arg]) => [name, display(arg)]),
  );
  return t(value.key, args);
}

export class StudioError extends Error {
  constructor(copy) {
    super(display(copy));
    this.copy = copy;
  }
}

export const errorCopy = (error, fallback) =>
  error instanceof StudioError ? error.copy : msg(fallback);
