// Raycast only visible exhibit surfaces; the UI owns the selected part.
export function picker(T, canvas, camera, scene, parts, owners, select) {
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  return function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      (2 * (event.clientX - rect.left)) / rect.width - 1,
      1 - (2 * (event.clientY - rect.top)) / rect.height,
    );
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    ray.setFromCamera(pointer, camera);
    const surfaces = [];
    for (const part of parts.values()) {
      if (part.node.visible) surfaces.push(...part.surfaces);
    }
    const hit = ray.intersectObjects(surfaces, false)[0];
    if (hit) select(owners.get(hit.object));
  };
}

export function bindCameraKeys(
  canvas,
  signal,
  { T, camera, orbit, placeCamera, dirty, settle, zoom, reset },
) {
  canvas.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const key = event.key;
      if (key === 'Home') reset();
      else if (key === '+' || key === '=') zoom(1.2);
      else if (key === '-') zoom(1 / 1.2);
      else if (key.startsWith('Arrow')) {
        orbit.stop();
        settle();
        const theta =
          orbit.getAzimuthalAngle() +
          (key === 'ArrowRight' ? 0.13 : key === 'ArrowLeft' ? -0.13 : 0);
        const phi = Math.min(
          orbit.maxPolarAngle,
          Math.max(
            orbit.minPolarAngle,
            orbit.getPolarAngle() + (key === 'ArrowUp' ? -0.13 : key === 'ArrowDown' ? 0.13 : 0),
          ),
        );
        const eye = new T.Vector3().setFromSphericalCoords(1, phi, theta);
        placeCamera(orbit.target, eye, camera.position.distanceTo(orbit.target));
        dirty();
      } else return;
      event.preventDefault();
    },
    { signal },
  );
}
