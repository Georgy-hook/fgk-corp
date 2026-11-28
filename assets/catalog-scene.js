// The plate and gallery are lightweight. The renderer is mounted only by the explicit 3D action.
export function asset(product, path) {
  if (typeof path !== "string" || !path.trim()) return null;
  try {
    const url = new URL(path, product.base);
    return url.origin === location.origin &&
      url.pathname.startsWith(product.base.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const $ = (id) => document.getElementById(id);
const pad = (number) => String(number).padStart(2, "0");
const buranCaptions = {
  "assets/cockpit.webp": "Кабина",
  "assets/fin.webp": "Киль",
  "assets/gear.webp": "Шасси",
};

export function createStudio({ onColor }) {
  const plate = $("plate");
  const block = $("scene-block");
  const gallery = $("gallery");
  const mount = $("viewer-mount");
  const open = $("open-viewer");
  let product, color, frame, mountPoint, cleanup;
  let revision = 0;
  let shots = [];
  let selected = 0;

  function clearScene() {
    revision += 1;
    cleanup?.();
    cleanup = null;
    frame = null;
    mountPoint = null;
    mount.replaceChildren();
    block.hidden = true;
    plate.hidden = false;
  }

  function showShot(index) {
    clearScene();
    selected = index;
    const shot = shots[index];
    const poster = $("model-poster");
    if (shot) {
      poster.src = shot.url;
      poster.alt = `${product.name}: ${shot.name.toLocaleLowerCase("ru")}`;
    } else poster.removeAttribute("src");
    poster.hidden = !shot;
    $("shot-name").textContent = shot?.name || "Нет изображения";
    $("shot-index").textContent = shot
      ? `${pad(index + 1)} / ${pad(shots.length)}`
      : "";
    plate.toggleAttribute(
      "data-buran-overview",
      product.slug === "buran-vdnh" && shot?.path === "assets/hero.webp",
    );
    [...gallery.children].forEach((link, i) =>
      link.setAttribute("aria-current", String(i === index)),
    );
  }

  function setProduct(next) {
    product = next;
    color = null;
    const paths = [
      product.image,
      ...(Array.isArray(product.gallery) ? product.gallery : []),
    ];
    shots = [...new Set(paths)]
      .map((path, index) => ({
        path,
        url: asset(product, path),
        name: !index
          ? "Общий вид"
          : (product.slug === "buran-vdnh" && buranCaptions[path]) ||
            `Ракурс ${index + 1}`,
      }))
      .filter((shot) => shot.url);
    gallery.replaceChildren(
      ...shots.map((shot, i) => {
        const link = document.createElement("a");
        link.href = shot.url;
        const image = document.createElement("img");
        image.src = shot.url;
        image.alt = "";
        image.loading = "lazy";
        const name = document.createElement("span");
        name.textContent = shot.name;
        link.append(image, name);
        link.addEventListener("click", (event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
          event.preventDefault();
          showShot(i);
        });
        return link;
      }),
    );
    gallery.hidden = shots.length < 2;
    const hasScene =
      asset(product, product.viewer) ||
      asset(product, product.glb) ||
      product.stl.some(
        ({ file }) => asset(product, file) && /\.stl$/i.test(file),
      );
    open.hidden = !hasScene;
    $("scene-fallback").hidden = true;
    showShot(0);
  }

  function sendColor(next, forward = true) {
    color = next;
    if (!color || !forward) return;
    // External paint goes to the mounted renderer only; it need not bubble back to the store.
    mountPoint?.dispatchEvent(
      new CustomEvent("fgk:viewer-color", { detail: color }),
    );
    frame?.contentWindow?.postMessage(
      { type: "fgk:viewer-color", ...color },
      location.origin,
    );
  }

  async function start() {
    clearScene();
    const stamp = revision;
    plate.hidden = true;
    block.hidden = false;
    $("close-viewer").focus({ preventScroll: true });
    [...gallery.children].forEach((link) =>
      link.setAttribute("aria-current", "false"),
    );
    const viewerUrl = asset(product, product.viewer);
    if (viewerUrl) {
      frame = document.createElement("iframe");
      frame.title = `Интерактивная модель: ${product.name}`;
      frame.allow = "fullscreen";
      frame.src = viewerUrl;
      frame.addEventListener(
        "load",
        () => {
          if (stamp !== revision) return;
          sendColor(color);
          // The existing same-origin exhibit has a poster gate of its own. One user action opens both.
          const gate = frame.contentDocument?.getElementById("open-model");
          if (gate && gate.getAttribute("aria-expanded") === "false")
            gate.click();
        },
        { once: true },
      );
      mount.append(frame);
    } else {
      mountPoint = document.createElement("div");
      mountPoint.textContent = "Открываем модель…";
      mount.append(mountPoint);
      try {
        const { mountViewer } = await import("./viewer.js");
        if (stamp !== revision) return;
        const release = await mountViewer(mountPoint, {
          base: product.base.href,
          product: {
            ...product,
            externalColors: true,
            selectedColor: color?.hex,
          },
        });
        if (stamp !== revision) release?.();
        else cleanup = release;
      } catch {
        if (stamp === revision)
          mount.textContent =
            "3D-просмотр не открылся. Вернитесь к ракурсам или скачайте файлы из паспорта модели.";
      }
    }
  }

  open.addEventListener("click", start);
  $("close-viewer").addEventListener("click", () => {
    showShot(selected);
    open.focus();
  });
  mount.addEventListener("fgk:viewer-color", (event) =>
    onColor(event.detail?.hex),
  );
  window.addEventListener("message", (event) => {
    if (
      !frame ||
      event.origin !== location.origin ||
      event.source !== frame.contentWindow
    )
      return;
    if (event.data?.type === "fgk:viewer-color") onColor(event.data.hex);
    if (
      event.data?.type === "fgk:viewer-size" &&
      Number.isFinite(event.data.height)
    )
      frame.style.height = `${Math.max(250, Math.min(1600, event.data.height))}px`;
  });
  return { setProduct, sendColor };
}
