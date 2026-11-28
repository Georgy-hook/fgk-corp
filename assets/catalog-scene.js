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
  const done = $("close-viewer");
  const dialog = $("inspection-dialog");
  const compact = matchMedia("(max-width: 900px), (pointer: coarse)");
  let product, color, frame, mountPoint, cleanup, controller;
  let returnY = 0;
  let revision = 0;
  let shots = [];
  let selected = 0;

  function clearScene() {
    revision += 1;
    controller?.abort();
    controller = null;
    if (frame?.contentWindow) {
      try {
        frame.contentWindow.dispatchEvent(new Event("fgk:viewer-close"));
      } catch {
        // A custom exhibit can navigate away from its original same-origin URL.
      }
    }
    cleanup?.();
    cleanup = null;
    frame = null;
    mountPoint = null;
    mount.replaceChildren();
    block.hidden = true;
    plate.hidden = false;
    if (block.parentElement === dialog) {
      dialog.close();
      document.documentElement.classList.remove("inspecting");
      gallery.before(block);
      window.scrollTo(0, returnY);
    }
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
    const ar = $("ar-link");
    const usdz = asset(product, product.usdz);
    const offerAr = Boolean(usdz && ar.relList.supports?.("ar"));
    $("ar-entry").hidden = !offerAr;
    ar.removeAttribute("href");
    if (offerAr) {
      ar.href = usdz;
      ar.firstElementChild.src = shots[0]?.url ||
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='%231747be' d='m12 2 9 5v10l-9 5-9-5V7zm0 10 9-5M3 7l9 5v10'/%3E%3C/svg%3E";
      ar.setAttribute("aria-label", `${product.name}: посмотреть в своём пространстве`);
      $("ar-finish").textContent = product.slug === "buran-vdnh" ? "USDZ · музейный окрас" : "USDZ · исходный окрас";
    }
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

  async function start(fromHistory = false) {
    clearScene();
    const stamp = revision;
    const isolated = compact.matches && typeof dialog.showModal === "function";
    if (isolated) {
      returnY = window.scrollY;
      dialog.append(block);
      document.documentElement.classList.add("inspecting");
      if (!fromHistory && history.state?.fgkInspect !== product.slug)
        history.pushState({ ...history.state, fgkInspect: product.slug }, "");
    }
    done.textContent = isolated ? "Готово" : "К ракурсам";
    $("scene-title").textContent = product.name;
    plate.hidden = !isolated;
    block.hidden = false;
    if (isolated) dialog.showModal();
    done.focus({ preventScroll: true });
    [...gallery.children].forEach((link) =>
      link.setAttribute("aria-current", "false"),
    );
    const viewerUrl = asset(product, product.viewer);
    if (viewerUrl) {
      frame = document.createElement("iframe");
      frame.title = `Интерактивная модель: ${product.name}`;
      frame.allow = "fullscreen";
      const url = new URL(viewerUrl);
      if (isolated && url.searchParams.has("embed")) url.searchParams.set("inspect", "1");
      frame.src = url.href;
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
      controller = new AbortController();
      mountPoint.textContent = "Открываем модель…";
      mount.append(mountPoint);
      try {
        const { mountViewer } = await import("./viewer.js");
        if (stamp !== revision) return;
        const release = await mountViewer(mountPoint, {
          base: product.base.href,
          signal: controller.signal,
          product: {
            ...product,
            externalColors: !isolated,
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

  function finish() {
    showShot(selected);
    open.focus({ preventScroll: true });
  }
  function requestClose() {
    if (dialog.open && history.state?.fgkInspect === product.slug) history.back();
    finish();
  }
  open.addEventListener("click", () => start());
  done.addEventListener("click", requestClose);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  window.addEventListener("popstate", () => {
    if (dialog.open && history.state?.fgkInspect !== product.slug) finish();
    else if (!dialog.open && product && history.state?.fgkInspect === product.slug) start(true);
  });
  document.addEventListener("keydown", (event) => {
    if (!block.hidden && event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      requestClose();
    }
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
    if (event.data?.type === "fgk:request-close") requestClose();
    if (
      !dialog.open &&
      event.data?.type === "fgk:viewer-size" &&
      Number.isFinite(event.data.height)
    )
      frame.style.height = `${Math.max(250, Math.min(1600, event.data.height))}px`;
  });
  return { setProduct, sendColor };
}
