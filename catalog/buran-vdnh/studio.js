/* Studio and framing math for the exhibition. All positions are in metres. */
(() => {
  'use strict';

  // An asymmetric photographic set, in linear radiance. The virtual softboxes
  // exist only in reflections: nothing is ever drawn into the transparent sky.
  function lightTent(T) {
    const w = 256;
    const h = 128;
    const pixels = new Float32Array(w * h * 4);
    const normal = new T.Vector3();
    const axis = new T.Vector3(1, 0, 0);
    function strip(direction, length, width, power) {
      const aim = new T.Vector3(...direction).normalize();
      const across = new T.Vector3().crossVectors(aim, axis).normalize();
      const along = new T.Vector3().crossVectors(across, aim);
      return { aim, across, along, length, width, power };
    }
    const boxes = [
      strip([-0.18, 0.88, 0.43], 1.6, 0.26, 4.5), // silk running along the fuselage
      strip([0.36, 0.48, -0.82], 0.96, 0.29, 3.4), // far-side rim
      strip([-0.85, 0.12, 0.51], 0.46, 0.66, 1.9), // reflection in the windshield
      strip([-0.28, -0.73, 0.64], 1.25, 0.74, 0.72), // bounce card below the near wing
    ];
    for (let row = 0; row < h; row++) {
      const lat = ((row + 0.5) / h - 0.5) * Math.PI;
      for (let col = 0; col < w; col++) {
        const lon = ((col + 0.5) / w - 0.5) * Math.PI * 2;
        normal.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        const base = 0.09 + 0.14 * Math.max(0, -normal.y); // neutral floor bounce
        let radiance = 0;
        for (const b of boxes) {
          const facing = normal.dot(b.aim);
          if (facing <= 0) continue;
          const x = normal.dot(b.along) / (facing * b.length);
          const y = normal.dot(b.across) / (facing * b.width);
          radiance += b.power * Math.exp(-(x ** 4 + y ** 4));
        }
        const i = 4 * (row * w + col);
        pixels[i] = base + radiance;
        pixels[i + 1] = base + radiance * 0.99;
        pixels[i + 2] = base * 1.09 + radiance * 0.98;
        pixels[i + 3] = 1;
      }
    }
    const texture = new T.DataTexture(pixels, w, h, T.RGBAFormat, T.FloatType);
    texture.mapping = T.EquirectangularReflectionMapping;
    texture.colorSpace = T.LinearSRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  // Convex footprint of the part actually touching the floor. Only the penumbra
  // and a short ambient shadow are painted, never the bounding rectangle.
  function footprint(points) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
    function chain(vertices) {
      const result = [];
      for (const c of vertices) {
        while (result.length > 1) {
          const [a, b] = result.slice(-2);
          if ((b.x - a.x) * (c.z - a.z) > (b.z - a.z) * (c.x - a.x)) break;
          result.pop();
        }
        result.push(c);
      }
      return result.slice(0, -1);
    }
    return chain(sorted).concat(chain(sorted.reverse()));
  }

  function contactCard(T) {
    const mask = document.createElement('canvas');
    const ctx = mask.getContext('2d');
    // Mesh defaults to an unlit MeshBasicMaterial even in the slim local bundle.
    const card = new T.Mesh(new T.PlaneGeometry(1, 1));
    const material = card.material;
    material.transparent = true;
    material.depthWrite = false;
    material.toneMapped = false;
    material.color.set(0x222832);
    card.rotation.x = -Math.PI / 2;
    let previous = null;
    function place(part, offset) {
      card.visible = !!part;
      if (!part) return;
      const center = part.bounds.getCenter(new T.Vector3());
      card.position.set(
        center.x + offset.x,
        part.bounds.min.y + offset.y - 0.0001,
        center.z + offset.z,
      );
      if (previous === part) return;
      previous = part;
      const size = part.bounds.getSize(new T.Vector3());
      const padding = Math.max(size.x, size.z) * 0.2;
      const w = size.x + 2 * padding;
      const h = size.z + 2 * padding;
      card.scale.set(w, h, 1);
      const density = 512 / Math.max(w, h);
      mask.width = Math.ceil(w * density);
      mask.height = Math.ceil(h * density);
      const polygon = footprint(part.points);
      // Draw the polygon itself off-canvas: only its blurred shadow is retained.
      ctx.beginPath();
      for (const [i, p] of polygon.entries()) {
        const x = (0.5 + (p.x - center.x) / w) * mask.width - 1024;
        const y = (0.5 + (p.z - center.z) / h) * mask.height;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      for (const [blur, dx, dz, alpha] of [[23, 6, 4, 0.23], [6, 1, 1, 0.34]]) {
        ctx.shadowOffsetX = 1024 + dx;
        ctx.shadowOffsetY = dz;
        ctx.shadowColor = `rgba(255,255,255,${alpha})`;
        ctx.shadowBlur = blur;
        ctx.fill();
      }
      material.map?.dispose();
      material.map = new T.CanvasTexture(mask);
      material.needsUpdate = true;
    }
    return { card, place };
  }

  function illuminate(T, renderer, scene) {
    scene.environment = lightTent(T);
    scene.environmentIntensity = 0.78;
    const dome = new T.HemisphereLight(0xf8fbff, 0xd9d7d4, 0.48);
    const key = new T.DirectionalLight(0xfffaf4, 1.85);
    const edge = new T.DirectionalLight(0xf2f6ff, 0.74);
    // A low, oblique inspection lamp makes the relief legible on dark resin.
    // It is off in the museum pose and in the original photographic crops.
    const lower = new T.DirectionalLight(0xf4f7ff, 2.2);
    const lowerDirection = new T.Vector3(-0.45, -0.68, 0.73).normalize();
    const keyDirection = new T.Vector3(-0.44, 1.1, -0.7).normalize();
    const edgeDirection = new T.Vector3(0.9, 0.5, 0.06).normalize();
    const contact = contactCard(T);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.00018;
    key.shadow.radius = 3.5;
    key.shadow.intensity = 0.72;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    scene.add(dome, key, key.target, edge, edge.target, lower, lower.target, contact.card);

    return function place(bounds, radius, part, offset, inspectUnderside) {
      // Keep illumination registered to the assembly, not to a camera crop.
      const center = bounds.getCenter(new T.Vector3());
      contact.place(part, offset);
      key.target.position.copy(center);
      edge.target.position.copy(center);
      edge.position.copy(center).addScaledVector(edgeDirection, radius * 4);
      lower.visible = !!inspectUnderside;
      lower.target.position.copy(center);
      lower.position.copy(center).addScaledVector(lowerDirection, radius * 4);
      key.position.copy(center).addScaledVector(keyDirection, radius * 4);
      const half = radius * 1.05;
      Object.assign(key.shadow.camera, {
        left: -half,
        right: half,
        top: half,
        bottom: -half,
        near: radius * 2.8,
        far: radius * 5.2,
      });
      key.shadow.normalBias = radius * 0.0007;
      key.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
    };
  }

  // Preserve a compact set of actual surface points, not empty corners of a
  // wing's rectangular box. This keeps a long, swept silhouette large on screen.
  function supportPoints(T, surfaces) {
    const axes = [];
    for (let a = 0; a < 8; a++) {
      for (const rise of [-1, 0, 1]) {
        axes.push(new T.Vector3(Math.cos((a * Math.PI) / 4), rise, Math.sin((a * Math.PI) / 4)));
      }
    }
    axes.push(new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0));
    const best = axes.map(() => -Infinity);
    const points = axes.map(() => new T.Vector3());
    const p = new T.Vector3();
    for (const mesh of surfaces) {
      const attr = mesh.geometry.attributes.position;
      const step = Math.max(1, Math.ceil(attr.count / 5000));
      for (let i = 0; i < attr.count; i += step) {
        p.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld);
        axes.forEach((axis, j) => {
          const dot = p.dot(axis);
          if (dot > best[j]) {
            best[j] = dot;
            points[j].copy(p);
          }
        });
      }
    }
    return points;
  }

  // The catalogue gives the hinge in the assembled WORLD frame. Apply the same
  // rigid motion to the node and to the cached framing cloud; never rotate the
  // printable mesh about its own (often distant) glTF origin.
  function hingeFor(T, part, spec) {
    if (!spec) return null;
    const triple = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (!triple(spec.axis) || !triple(spec.pivot) || !Number.isFinite(spec.angle)) {
      throw new Error(`Не заданы параметры оси детали ${part.id}.`);
    }
    const axis = new T.Vector3(...spec.axis);
    if (!axis.lengthSq()) throw new Error(`Нулевая ось детали ${part.id}.`);
    axis.normalize();
    const pivot = new T.Vector3(...spec.pivot);
    const rest = part.node.quaternion.clone();
    const turn = rest.clone();
    const shift = new T.Vector3();
    const matrix = part.node.matrix.clone();
    const bounds = part.bounds.clone();
    const cloud = part.points.map((p) => p.clone());
    return {
      control: spec.family === 'bay' ? 'bay' : part.id.endsWith('Upper') ? 'brakeUpper' : 'brakeLower',
      set(travel) {
        turn.setFromAxisAngle(axis, (Math.PI / 180) * spec.angle * travel);
        shift.copy(pivot).sub(pivot.clone().applyQuaternion(turn));
        matrix.makeRotationFromQuaternion(turn).setPosition(shift);
        part.anchor.copy(part.origin).applyMatrix4(matrix);
        part.node.quaternion.copy(turn).multiply(rest);
        part.poseBounds = travel ? bounds.copy(part.bounds).applyMatrix4(matrix) : null;
        part.posePoints = travel ? cloud : null;
        if (travel) cloud.forEach((p, i) => p.copy(part.points[i]).applyMatrix4(matrix));
      },
    };
  }

  function framing(T, parts, aspect, fov, eye, visible, amount) {
    const cloud = [];
    const bounds = new T.Box3();
    const shown = Array.from(parts.values()).filter(visible);
    for (const part of shown) {
      const delta = part.delta.clone().multiplyScalar(amount);
      bounds.union((part.poseBounds || part.bounds).clone().translate(delta));
      for (const point of part.posePoints || part.points) cloud.push(point.clone().add(delta));
    }
    // The isolated base is broad, almost rectangular and only millimetres deep.
    // Include all rim corners so its narrow rear lip never disappears off-screen.
    if (shown.length === 1 && shown[0].id === 'Plinth') {
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) cloud.push(new T.Vector3(x, y, z));
        }
      }
    }
    const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), eye).normalize();
    const up = new T.Vector3().crossVectors(eye, right);
    // The projected limits depend on depth. Intersect the four sloping sides of
    // the camera frustum with the actual support cloud; the closest fit balances
    // opposing margins without treating empty corners of the wing box as matter.
    const slope = Math.tan((fov * Math.PI) / 360);
    const kx = slope * aspect * 0.91;
    const ky = slope * 0.87;
    const depth = bounds.getCenter(new T.Vector3()).dot(eye);
    let left = Infinity;
    let rightmost = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    for (const p of cloud) {
      const z = p.dot(eye) - depth;
      const x = p.dot(right);
      const y = p.dot(up);
      left = Math.min(left, x - kx * z);
      rightmost = Math.max(rightmost, x + kx * z);
      bottom = Math.min(bottom, y - ky * z);
      top = Math.max(top, y + ky * z);
    }
    const center = right
      .clone()
      .multiplyScalar((left + rightmost) / 2)
      .addScaledVector(up, (bottom + top) / 2)
      .addScaledVector(eye, depth);
    const radius = Math.max(0.00001, bounds.getSize(new T.Vector3()).length() / 2);
    const distance = Math.max(
      radius * 0.42,
      (rightmost - left) / (2 * kx),
      (top - bottom) / (2 * ky),
    );
    return { center, distance, bounds, radius };
  }

  window.BuranStudio = Object.freeze({ illuminate, supportPoints, hingeFor, framing });
})();
