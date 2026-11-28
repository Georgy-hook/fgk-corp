// Keep navigation in step with the reader. Do not change the URL or move focus while scrolling.
export function markCurrentSection(nav) {
  if (!nav || !('IntersectionObserver' in window)) return;
  const anchors = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = anchors.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) visible.add(target.id);
        else visible.delete(target.id);
      }
      const first = sections.find(({ id }) => visible.has(id));
      for (const anchor of anchors) {
        if (anchor.hash.slice(1) === first?.id) anchor.setAttribute('aria-current', 'location');
        else anchor.removeAttribute('aria-current');
      }
    },
    { rootMargin: '-4% 0px -52% 0px' },
  );
  sections.forEach((section) => observer.observe(section));
  window.addEventListener(
    'pagehide',
    (event) => {
      if (!event.persisted) observer.disconnect();
    },
    { once: true },
  );
}
