export const byId = (id) => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function link(label, href, download = false) {
  const anchor = element('a', label);
  anchor.href = href;
  if (download) anchor.download = '';
  return anchor;
}

export function isPlainClick(event) {
  return event.button === 0 && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
}
