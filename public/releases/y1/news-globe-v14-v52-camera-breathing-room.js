(function (root) {
  'use strict';

  // Geometry is independent of Cesium/DOM so the same flight calculations can
  // be tested without a GPU. Distances are from the ellipsoid's centre.
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const magnitude = v => Math.hypot(v.x, v.y, v.z);
  const finiteVector = v => v && [v.x, v.y, v.z].every(Number.isFinite);
  function unit(v) {
    const length = finiteVector(v) ? magnitude(v) : 0;
    if (length < 1e-12) throw new RangeError('A nonzero finite camera direction is required');
    return scale(v, 1 / length);
  }
  function perpendicular(v) {
    const axes = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
    axes.sort((a, b) => Math.abs(dot(a, v)) - Math.abs(dot(b, v)));
    return unit(cross(v, axes[0]));
  }
  function tangent(v, normal) {
    const projected = add(v, scale(normal, -dot(v, normal)));
    return magnitude(projected) > 1e-9 ? unit(projected) : perpendicular(normal);
  }
  function rotate(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
  }
  function makeArc(from, to, fromUp, toUp) {
    from = unit(from); to = unit(to);
    const normal = cross(from, to), length = magnitude(normal);
    const angle = Math.atan2(length, clamp(dot(from, to), -1, 1));
    const axis = length > 1e-12 ? scale(normal, 1 / length) : perpendicular(from);
    const up = tangent(fromUp, from), endUp = tangent(toUp, to);
    const transported = rotate(up, axis, angle);
    const roll = Math.atan2(dot(to, cross(transported, endUp)), dot(transported, endUp));
    return { angle, sample(t) {
      t = clamp(t, 0, 1);
      const radial = t === 1 ? to : unit(rotate(from, axis, angle * t));
      return { radial, up: tangent(rotate(rotate(up, axis, angle * t), radial, roll * t), radial) };
    } };
  }
  function fitSphere(radius, width, height, fov) {
    if (![radius, width, height, fov].every(Number.isFinite) || radius <= 0 || width <= 0 || height <= 0 || fov <= 0 || fov >= Math.PI) return null;
    // Cesium PerspectiveFrustum.fov is horizontal in landscape, vertical in portrait.
    const aspect = width / height, wideTan = Math.tan(fov / 2);
    const tanX = aspect >= 1 ? wideTan : wideTan * aspect;
    const tanY = aspect >= 1 ? wideTan / aspect : wideTan;
    const margin = Math.min(Math.min(width, height) * .2, Math.max(12, Math.min(width, height) * .07));
    const safeTan = Math.min(tanX * (1 - 2 * margin / width), tanY * (1 - 2 * margin / height));
    const distance = radius / Math.sin(Math.atan(safeTan));
    return { distance, margin, aspect, tanX, tanY };
  }
  function resolution(width, height, dpr) {
    if (!(width > 0 && height > 0)) return 1;
    return Math.min(Math.max(1, Number(dpr) || 1), 2.2, Math.sqrt(4194304 / (width * height)));
  }
  const Geometry = Object.freeze({ dot, scale, add, cross, magnitude, unit, tangent, makeArc, fitSphere, resolution });
  root.NG52CameraGeometry = Geometry;

  const G = root.NG14, C = root.Cesium;
  if (!G || !C || G.__v52SafeCamera) return;
  G.__v52SafeCamera = true;

  class GlobeCameraController {
    constructor(viewer) {
      this.viewer = viewer;
      this.camera = viewer.camera;
      this.scene = viewer.scene;
      this.ellipsoid = this.scene.globe.ellipsoid;
      // Enclose WGS84, terrain and the existing atmosphere/highlight heights.
      this.radius = this.ellipsoid.maximumRadius * 1.025;
      this.originals = Object.fromEntries(['setView', 'flyTo', 'flyToBoundingSphere', 'cancelFlight', 'completeFlight'].map(k => [k, this.camera[k]]));
      this.flight = null;
      this.pose = null;
      this.destroyed = false;
      this.dirty = true;
      this.disposers = [];
      this.frame = this.scene.canvas.closest?.('.map-frame');
      this.frameStyle = this.frame ? { maxWidth: this.frame.style.maxWidth, marginInline: this.frame.style.marginInline } : null;
      this.input = this.scene.screenSpaceCameraController;
      this.inputDefaults = Object.fromEntries(['enableTranslate', 'enableTilt', 'enableLook', 'minimumZoomDistance', 'enableInputs'].map(k => [k, this.input[k]]));
      // Rotate and zoom remain available. Off-centre panning/tilting cannot
      // satisfy the full-globe invariant, so constrain those gestures only.
      this.input.enableTranslate = false;
      this.input.enableTilt = false;
      this.input.enableLook = false;
      this.camera.flyTo = options => this.flyTo(options || {});
      this.camera.flyToBoundingSphere = (sphere, options) => this.flyToSphere(sphere, options || {});
      this.camera.setView = options => this.setView(options || {});
      this.camera.cancelFlight = () => this.cancel();
      this.camera.completeFlight = () => this.complete();
      this.disposers.push(this.scene.preUpdate.addEventListener(() => this.update()));
      this.disposers.push(this.scene.postUpdate.addEventListener(() => {
        // Also guard after Cesium's input/controllers have updated the camera.
        if (!this.destroyed && this.fit) {
          if (this.flight && this.pose) this.apply(this.pose);
          else this.constrainCurrent();
        }
      }));
      const markDirty = () => { this.dirty = true; this.scene.requestRender(); };
      for (const [target, event] of [[root, 'resize'], [root, 'orientationchange'], [root, 'pageshow'], [root.visualViewport, 'resize']]) {
        if (!target?.addEventListener) continue;
        target.addEventListener(event, markDirty, { passive: true });
        this.disposers.push(() => target.removeEventListener(event, markDirty));
      }
      if (root.ResizeObserver) {
        this.observer = new root.ResizeObserver(markDirty);
        this.observer.observe(this.frame || this.scene.canvas);
      }
      this.syncViewport();
      this.constrainCurrent();
    }

    toCartesian(v) { return new C.Cartesian3(v.x, v.y, v.z); }
    now() { return root.performance.now(); }
    validSerial(serial) { return serial === undefined || serial === G.navSerial; }

    targetFromCartesian(destination) {
      if (!finiteVector(destination) || magnitude(destination) < 1) return null;
      const cart = this.ellipsoid.cartesianToCartographic(destination);
      if (!cart) return null;
      // Use the same altitude as existing V52 event markers. This puts their
      // actual Cartesian position on the view axis, including at high latitudes.
      const marker = C.Cartesian3.fromRadians(cart.longitude, cart.latitude, 30000, this.ellipsoid);
      const radial = unit(marker);
      const east = { x: -Math.sin(cart.longitude), y: Math.cos(cart.longitude), z: 0 };
      return { radial, up: unit(cross(radial, east)) };
    }

    syncViewport() {
      const canvas = this.scene.canvas;
      if (this.frame && this.dirty) {
        // Keep the existing 16:9 CSS. A short landscape viewport may need a
        // narrower frame so the globe also fits above the browser's lower edge.
        const viewportHeight = root.visualViewport?.height || root.innerHeight;
        const maxWidth = Math.max(1, viewportHeight - this.frame.offsetTop - 12) * 16 / 9;
        const value = `${Math.floor(maxWidth)}px`;
        if (this.frame.style.maxWidth !== value) this.frame.style.maxWidth = value;
        this.frame.style.marginInline = 'auto';
      }
      // Preserve fractional CSS pixels (e.g. 344 × 193.5 at 16:9).
      // clientHeight rounds them and otherwise subtly distorts the projection.
      const rect = canvas.getBoundingClientRect?.();
      const width = rect?.width ?? canvas.clientWidth, height = rect?.height ?? canvas.clientHeight;
      if (!(width > 0 && height > 0)) return false; // hidden/tab restoration
      const dpr = root.devicePixelRatio || 1;
      if (!this.dirty && width === this.width && height === this.height && dpr === this.dpr && this.fov === this.camera.frustum.fov) return false;
      this.width = width; this.height = height; this.dpr = dpr;
      this.fov = this.camera.frustum.fov;
      const oldDistance = this.fit?.distance;
      this.fit = fitSphere(this.radius, width, height, this.fov);
      if (!this.fit) return false;
      if (oldDistance && this.pose) {
        const ratio = this.fit.distance / oldDistance;
        this.pose = { ...this.pose, distance: this.pose.distance * ratio };
        if (this.flight) {
          this.flight.from = { ...this.flight.from, distance: this.flight.from.distance * ratio };
          this.flight.distance *= ratio;
        }
      }
      this.viewer.useBrowserRecommendedResolution = true; // apply DPR once
      this.viewer.resolutionScale = resolution(width, height, dpr);
      this.viewer.resize();
      this.camera.frustum.aspectRatio = width / height;
      this.input.minimumZoomDistance = this.fit.distance - this.ellipsoid.minimumRadius;
      this.dirty = false;
      return true;
    }

    apply(pose) {
      if (!this.fit) return;
      const distance = Math.max(pose.distance, this.fit.distance);
      this.pose = { radial: pose.radial, up: pose.up, distance };
      // Camera.setView converts direction/up through heading/pitch/roll. Near
      // nadir/poles that conversion introduces avoidable projection drift.
      // Use Cesium's public orthonormal camera basis directly in world space.
      if (!C.Matrix4.equals(this.camera.transform, C.Matrix4.IDENTITY)) this.camera.lookAtTransform(C.Matrix4.IDENTITY);
      C.Cartesian3.clone(this.toCartesian(scale(pose.radial, distance)), this.camera.position);
      C.Cartesian3.clone(this.toCartesian(scale(pose.radial, -1)), this.camera.direction);
      C.Cartesian3.clone(this.toCartesian(tangent(pose.up, pose.radial)), this.camera.up);
      C.Cartesian3.cross(this.camera.direction, this.camera.up, this.camera.right);
      this.scene.requestRender();
    }

    constrainCurrent() {
      if (!this.fit) return;
      const position = this.camera.positionWC;
      if (!finiteVector(position) || magnitude(position) < 1) return;
      const radial = unit(position), distance = Math.max(magnitude(position), this.fit.distance);
      this.apply({ radial, up: tangent(this.camera.upWC, radial), distance });
    }

    cancel() {
      const old = this.flight;
      this.flight = null;
      this.originals.cancelFlight.call(this.camera);
      if (old && !old.settled) {
        this.input.enableInputs = old.enableInputs;
        old.settled = true; old.options.cancel?.();
      }
    }

    complete() {
      const flight = this.flight;
      if (!flight) return;
      if (!this.validSerial(flight.serial)) { this.cancel(); return; }
      this.apply({ ...flight.target, distance: Math.max(flight.distance, this.fit.distance) });
      this.finish(flight);
    }

    finish(flight) {
      if (this.flight !== flight || flight.settled) return;
      this.flight = null;
      flight.settled = true;
      this.input.enableInputs = flight.enableInputs;
      if (this.validSerial(flight.serial)) flight.options.complete?.();
      else flight.options.cancel?.();
    }

    start(target, distance, options) {
      const serial = options.ngSerial ?? this.callSerial ?? G.navSerial;
      if (this.destroyed || !target || !this.validSerial(serial)) { options.cancel?.(); return; }
      this.cancel();
      this.syncViewport();
      this.constrainCurrent();
      if (!this.pose || !this.fit) { options.cancel?.(); return; }
      const duration = root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : Math.max(0, Number(options.duration ?? 1.2)) * 1000;
      const flight = { target, distance: Math.max(distance || 0, this.fit.distance), serial, options, start: this.now(), duration, from: this.pose, arc: makeArc(this.pose.radial, target.radial, this.pose.up, target.up), enableInputs: this.input.enableInputs, settled: false };
      this.flight = flight;
      this.input.enableInputs = false;
      if (!duration) this.complete();
      this.scene.requestRender();
    }

    flyTo(options) {
      let destination = options.destination;
      if (destination instanceof C.Rectangle) destination = this.camera.getRectangleCameraCoordinates(destination);
      this.start(this.targetFromCartesian(destination), finiteVector(destination) ? magnitude(destination) : 0, options);
    }

    flyToSphere(sphere, options) {
      if (!sphere || !finiteVector(sphere.center)) { options.cancel?.(); return; }
      // A global bounding sphere can have its centre at the origin; keep the
      // current viewing hemisphere rather than inventing longitude/latitude.
      const target = magnitude(sphere.center) > 1 ? this.targetFromCartesian(sphere.center) : (this.pose || this.targetFromCartesian(this.camera.positionWC));
      this.start(target, magnitude(sphere.center) + Math.max(0, Number(options.offset?.range) || sphere.radius * 2), options);
    }

    setView(options) {
      if (!options.destination) { this.originals.setView.call(this.camera, options); this.constrainCurrent(); return; }
      this.flyTo({ ...options, duration: 0 });
    }

    update() {
      if (this.destroyed) return;
      const changed = this.syncViewport(), flight = this.flight;
      if (flight) {
        if (!this.validSerial(flight.serial)) { this.cancel(); this.constrainCurrent(); return; }
        const progress = clamp((this.now() - flight.start) / flight.duration, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        const orientation = flight.arc.sample(eased);
        const distance = flight.from.distance + (flight.distance - flight.from.distance) * eased;
        this.apply({ ...orientation, distance });
        if (progress >= 1) this.finish(flight);
      } else if (changed) {
        // Preserve the target direction across resize; recompute its safe scale.
        if (this.pose) this.apply(this.pose);
        else this.constrainCurrent();
      } else {
        // Preserve user rotation, but keep the whole globe centred and visible.
        const position = this.camera.positionWC;
        if (this.pose && finiteVector(position)) {
          const radial = unit(position), direction = unit(this.camera.directionWC);
          if (magnitude(position) < this.fit.distance - .01 || dot(direction, scale(radial, -1)) < 1 - 1e-12) this.constrainCurrent();
          else this.pose = { radial, up: tangent(this.camera.upWC, radial), distance: magnitude(position) };
        }
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.cancel(); this.destroyed = true;
      this.observer?.disconnect();
      for (const dispose of this.disposers) dispose();
      for (const [key, value] of Object.entries(this.originals)) this.camera[key] = value;
      Object.assign(this.input, this.inputDefaults);
      if (this.frame) Object.assign(this.frame.style, this.frameStyle);
    }
  }

  G.attachCameraController = viewer => {
    if (G.cameraController?.viewer === viewer) return G.cameraController;
    G.cameraController?.destroy();
    const controller = new GlobeCameraController(viewer);
    G.cameraController = controller;
    return controller;
  };
  // Called before asynchronous scene work starts. Cancelling a flight resolves
  // its existing cancel callback; legacy serial checks can then finish normally.
  for (const name of ['focus', 'overview']) {
    const previous = G[name];
    G[name] = function (...args) { G.cameraController?.cancel(); return previous.apply(this, args); };
  }
  for (const name of ['flyPoint', 'flyCountry', 'flyArea', 'countryStage']) {
    const previous = G[name];
    if (!previous) continue;
    G[name] = function (...args) {
      const serial = args[name === 'flyPoint' ? 1 : 2], controller = G.cameraController;
      if (serial !== undefined && serial !== G.navSerial) return false;
      if (!controller) return previous.apply(this, args);
      const saved = controller.callSerial;
      controller.callSerial = serial;
      try { return previous.apply(this, args); } finally { controller.callSerial = saved; }
    };
  }
  root.NG52CameraController = GlobeCameraController;
})(typeof window === 'undefined' ? globalThis : window);
