import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Use the SAME Cesium 1.145.0 bundle as V52. See V52_CAMERA_QA.md for setup.
const require = createRequire(import.meta.url);
const bundle = process.env.CESIUM_TEST_BUNDLE;
if (!bundle) throw new Error('Set CESIUM_TEST_BUNDLE to Cesium 1.145.0 Build/CesiumUnminified/index.cjs; no mocked camera is used.');
const C = require(bundle);
assert.equal(C.VERSION, '1.145.0');
const source = fs.readFileSync(new URL('../public/releases/y1/news-globe-v14-v52-camera-breathing-room.js', import.meta.url), 'utf8');
const locations = [
  { name: '北京 / 亚洲', lon: 116.4074, lat: 39.9042 },
  { name: '基辅 / 欧洲', lon: 30.5234, lat: 50.4501 },
  { name: '纽约 / 北美洲', lon: -74.006, lat: 40.7128 },
  { name: '圣保罗 / 南美洲', lon: -46.6333, lat: -23.5505 },
  { name: '纳坦兹地区 / 中东', lon: 51.73, lat: 33.72 },
  { name: '斐济 / 日界线西侧', lon: 179.8, lat: -16.5 },
  { name: '日界线东侧', lon: -179.8, lat: -16.5 },
  { name: '斯瓦尔巴 / 高纬度', lon: 15.6469, lat: 78.2232 },
];

function fixture(width = 1280, height = 720) {
  let time = 0;
  const rootEvents = new EventTarget(), viewportEvents = new EventTarget();
  const canvas = { clientWidth: width, clientHeight: height, closest: () => null };
  const scene = {
    canvas, drawingBufferWidth: width, drawingBufferHeight: height,
    mapProjection: new C.GeographicProjection(), ellipsoid: C.Ellipsoid.WGS84,
    globe: { ellipsoid: C.Ellipsoid.WGS84 }, mode: C.SceneMode.SCENE3D,
    preUpdate: new C.Event(), postUpdate: new C.Event(), requestRender() {},
    screenSpaceCameraController: { enableInputs: true, enableTranslate: true, enableTilt: true, enableLook: true, minimumZoomDistance: 1 },
  };
  const camera = new C.Camera(scene);
  camera.setView({ destination: C.Cartesian3.fromDegrees(95, 22, 16000000) });
  const G = { navSerial: 0, focus(i) { this.navSerial++; this.current = i; }, overview() { this.navSerial++; } };
  const viewer = { camera, scene, resizeCount: 0, resize() {
    this.resizeCount++;
    canvas.width = Math.floor(canvas.clientWidth * this.resolutionScale);
    canvas.height = Math.floor(canvas.clientHeight * this.resolutionScale);
    scene.drawingBufferWidth = canvas.width; scene.drawingBufferHeight = canvas.height;
  } };
  const root = { NG14: G, Cesium: C, performance: { now: () => time }, devicePixelRatio: 1, innerHeight: 900,
    addEventListener: rootEvents.addEventListener.bind(rootEvents), removeEventListener: rootEvents.removeEventListener.bind(rootEvents),
    visualViewport: { height: 900, addEventListener: viewportEvents.addEventListener.bind(viewportEvents), removeEventListener: viewportEvents.removeEventListener.bind(viewportEvents) },
    matchMedia: () => ({ matches: false }),
  };
  vm.runInNewContext(source, { window: root });
  const controller = G.attachCameraController(viewer);
  const tick = ms => { time += ms; scene.preUpdate.raiseEvent(scene); scene.postUpdate.raiseEvent(scene); };
  const fly = (loc, options = {}) => camera.flyTo({ destination: C.Cartesian3.fromDegrees(loc.lon, loc.lat, 170000), duration: 1, ngSerial: G.navSerial, ...options });
  return { root, G, viewer, scene, canvas, camera, controller, tick, fly, viewportEvents, rootEvents, geometry: root.NG52CameraGeometry };
}

function assertWholeGlobe(f) {
  const { camera, controller } = f;
  const volume = camera.frustum.computeCullingVolume(camera.positionWC, camera.directionWC, camera.upWC);
  assert.equal(volume.computeVisibility(new C.BoundingSphere(C.Cartesian3.ZERO, controller.radius)), C.Intersect.INSIDE, 'entire WGS84/atmosphere envelope must be inside all six planes');
  assert.ok(Number.isFinite(camera.positionCartographic.height));
  assert.ok(Math.abs(C.Cartesian3.dot(camera.directionWC, camera.upWC)) < 1e-8, 'orientation must stay orthogonal');
  // Independent plane distance assertion with the specified pixel margin.
  const p = project(f, C.Cartesian3.ZERO);
  const distance = C.Cartesian3.magnitude(camera.positionWC);
  const diskTan = Math.tan(Math.asin(controller.radius / distance));
  const ry = f.canvas.clientHeight / 2 * diskTan / Math.tan(camera.frustum.fovy / 2);
  assert.ok(p.y - ry >= controller.fit.margin - .001, 'top safe margin');
  assert.ok(p.y + ry <= f.canvas.clientHeight - controller.fit.margin + .001, `bottom safe margin: y=${p.y}, radius=${ry}, height=${f.canvas.clientHeight}, margin=${controller.fit.margin}, direction=${C.Cartesian3.dot(camera.directionWC, C.Cartesian3.normalize(C.Cartesian3.negate(camera.positionWC,new C.Cartesian3()),new C.Cartesian3()))}`);
}
function project(f, position) {
  const vp = C.Matrix4.multiply(f.camera.frustum.projectionMatrix, f.camera.viewMatrix, new C.Matrix4());
  const clip = C.Matrix4.multiplyByVector(vp, C.Cartesian4.fromElements(position.x, position.y, position.z, 1), new C.Cartesian4());
  return { x: (clip.x / clip.w + 1) * f.canvas.clientWidth / 2, y: (1 - clip.y / clip.w) * f.canvas.clientHeight / 2 };
}
function assertCentred(f, loc) {
  const p = project(f, C.Cartesian3.fromDegrees(loc.lon, loc.lat, 30000));
  assert.ok(Math.hypot(p.x - f.canvas.clientWidth / 2, p.y - f.canvas.clientHeight / 2) < .01, `${loc.name}: marker projection must be within 0.01 CSS px of centre`);
}

for (const [width, height] of [[344, 193.5], [374, 210.375], [550, 309.375], [1280, 720]]) {
  test(`8 event coordinates, all flight frames stay inside ${width}×${height}`, () => {
    const f = fixture(width, height);
    let completed = 0;
    for (const loc of locations) {
      f.G.focus(completed);
      f.fly(loc, { complete() { completed++; } });
      for (let i = 0; i < 61; i++) { f.tick(1000 / 60); assertWholeGlobe(f); }
      assertCentred(f, loc);
      assert.equal(f.controller.flight, null);
    }
    assert.equal(completed, 8);
    f.controller.destroy();
  });
}

test('fractional 16:9 CSS size determines aspect despite rounded canvas client dimensions', () => {
  const f = fixture(344, 194);
  f.canvas.getBoundingClientRect = () => ({ width: 344, height: 193.5 });
  f.rootEvents.dispatchEvent(new Event('resize'));
  f.tick(16);
  assert.equal(f.camera.frustum.aspectRatio, 16 / 9);
  assert.equal(f.controller.height, 193.5);
  f.fly(locations[7], { duration: 0 });
  assertCentred(f, locations[7]);
  const volume = f.camera.frustum.computeCullingVolume(f.camera.positionWC, f.camera.directionWC, f.camera.upWC);
  assert.equal(volume.computeVisibility(new C.BoundingSphere(C.Cartesian3.ZERO, f.controller.radius)), C.Intersect.INSIDE);
});

test('date line follows the short arc, with stable exact-pole and antipodal flights', () => {
  const f = fixture();
  f.fly(locations[5], { duration: 0 });
  f.fly(locations[6]);
  assert.ok(f.controller.flight.arc.angle < C.Math.toRadians(.5));
  for (let i = 0; i < 60; i++) { f.tick(17); assertWholeGlobe(f); assert.ok(f.camera.positionWC.x < 0); }
  for (const loc of [{ lon: 0, lat: 90 }, { lon: 0, lat: -90 }, { lon: 0, lat: 0 }, { lon: 180, lat: 0 }]) {
    f.fly(loc);
    for (let i = 0; i < 60; i++) { f.tick(17); assertWholeGlobe(f); }
    assertCentred(f, loc);
  }
});

test('rapid prev/next cancels each earlier camera once and rejects late stale requests', () => {
  const f = fixture(); let complete = 0, cancel = 0;
  for (let i = 0; i < 40; i++) {
    f.G.focus(i % 2);
    f.fly(locations[i % 8], { complete() { complete++; }, cancel() { cancel++; } });
    f.tick(12); assertWholeGlobe(f);
  }
  let staleCancelled = 0;
  const latest = f.controller.flight;
  f.fly(locations[0], { ngSerial: f.G.navSerial - 1, cancel() { staleCancelled++; } });
  assert.equal(f.controller.flight, latest, 'stale request must not cancel the latest flight');
  f.tick(1100);
  assert.equal(cancel, 39); assert.equal(complete, 1); assert.equal(staleCancelled, 1);
  assertCentred(f, locations[39 % 8]);
  f.G.overview();
  f.tick(1100); assert.equal(complete, 1);
});

test('resize during flight retains its destination and updates frustum, DPR and safe scale', () => {
  const f = fixture(); let complete = 0;
  f.fly(locations[7], { complete() { complete++; } }); f.tick(100);
  for (const [w, h, dpr] of [[344, 193.5, 3], [550, 309.375, 2], [374, 210.375, 3], [1280, 720, 1], [360, 720, 2]]) {
    f.canvas.clientWidth = w; f.canvas.clientHeight = h; f.root.devicePixelRatio = dpr;
    f.viewportEvents.dispatchEvent(new Event('resize'));
    f.tick(50);
    assert.equal(f.camera.frustum.aspectRatio, w / h);
    assert.equal(f.viewer.useBrowserRecommendedResolution, true);
    assert.ok(f.viewer.resolutionScale <= 2.2);
    assertWholeGlobe(f);
  }
  f.tick(1000);
  assert.equal(complete, 1); assertCentred(f, locations[7]);
  const position = C.Cartesian3.clone(f.camera.positionWC);
  f.canvas.clientWidth = 0; f.canvas.clientHeight = 0; f.tick(17);
  assert.ok(C.Cartesian3.distance(position, f.camera.positionWC) < .01);
  f.canvas.clientWidth = 344; f.canvas.clientHeight = 193.5; f.rootEvents.dispatchEvent(new Event('pageshow'));
  f.tick(17); assertWholeGlobe(f); assertCentred(f, locations[7]);
});

test('bounding-sphere and direct setView paths preserve callbacks and avoid partial globe', () => {
  const f = fixture(); let completed = 0;
  const loc = locations[4];
  f.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(loc.lon, loc.lat), 1), { offset: new C.HeadingPitchRange(0, -Math.PI / 2, 50000), duration: 1, complete() { completed++; } });
  f.camera.completeFlight();
  assert.equal(completed, 1); assertWholeGlobe(f); assertCentred(f, loc);
  f.camera.setView({ destination: C.Cartesian3.fromDegrees(locations[0].lon, locations[0].lat, 1) });
  assertWholeGlobe(f); assertCentred(f, locations[0]);
  f.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.ZERO, C.Ellipsoid.WGS84.maximumRadius), { duration: 0 });
  assertWholeGlobe(f);
});

test('only the V52 viewer is intercepted; destroy restores methods and input settings', () => {
  const oldFly = C.Camera.prototype.flyTo;
  const f = fixture();
  assert.equal(C.Camera.prototype.flyTo, oldFly);
  assert.equal(f.scene.preUpdate.numberOfListeners, 1);
  const installed = f.G.attachCameraController(f.viewer);
  assert.equal(installed, f.controller);
  f.fly(locations[0]);
  assert.equal(f.scene.screenSpaceCameraController.enableInputs, false);
  f.controller.destroy();
  assert.equal(f.scene.preUpdate.numberOfListeners, 0);
  assert.equal(f.scene.postUpdate.numberOfListeners, 0);
  assert.equal(f.camera.flyTo, oldFly);
  assert.equal(f.scene.screenSpaceCameraController.enableInputs, true);
  assert.equal(f.scene.screenSpaceCameraController.enableTilt, true);
  f.controller.destroy();
});

test('existing V51 POINT scenes create their markers at the safe centre for all 8 locations', async () => {
  const f = fixture();
  f.G.viewer = f.viewer;
  f.viewer.entities = new C.EntityCollection();
  f.G.countries = new Map();
  f.G.wait = async (ms, serial) => serial === f.G.navSerial;
  f.G.news = locations.map((loc, i) => ({ ...loc, id: i + 1, title: `QA ${loc.name}`, location: loc.name, sceneMode: 'POINT', adminChain: [] }));
  const unchanged = JSON.stringify(f.G.news);
  vm.runInNewContext(fs.readFileSync(new URL('../public/releases/y1/news-globe-v14-v51-scene-engine.js', import.meta.url), 'utf8'), {
    window: f.root, Cesium: C, document: { getElementById: () => null }, performance: f.root.performance, setTimeout,
  });
  for (const n of f.G.news) {
    f.G.focus(n.id - 1);
    const sequence = f.G.runSequence(n, '', f.G.navSerial);
    for (let i = 0; i < 85; i++) { await Promise.resolve(); f.tick(17); assertWholeGlobe(f); }
    await sequence;
    const markers = f.viewer.entities.values.filter(e => e.point);
    assert.equal(markers.length, 1);
    const screen = project(f, markers[0].position.getValue(C.JulianDate.now()));
    assert.ok(Math.hypot(screen.x - 640, screen.y - 360) < .01, `${n.name}: actual V51 marker`);
  }
  assert.equal(JSON.stringify(f.G.news), unchanged, 'camera must not mutate news data');
});

test('existing V51 sequence cancellation cannot move the next story camera', async () => {
  const f = fixture();
  f.G.viewer = f.viewer; f.viewer.entities = new C.EntityCollection();
  f.G.countries = new Map(); f.G.wait = async (ms, serial) => serial === f.G.navSerial;
  vm.runInNewContext(fs.readFileSync(new URL('../public/releases/y1/news-globe-v14-v51-scene-engine.js', import.meta.url), 'utf8'), {
    window: f.root, Cesium: C, document: { getElementById: () => null }, performance: f.root.performance, setTimeout,
  });
  const pending = [];
  for (let i = 0; i < 20; i++) {
    f.G.focus(i);
    const n = { ...locations[i % 8], sceneMode: 'POINT', location: locations[i % 8].name, adminChain: [] };
    pending.push(f.G.runSequence(n, '', f.G.navSerial));
    for (let j = 0; j < 4; j++) { await Promise.resolve(); f.tick(5); }
  }
  for (let i = 0; i < 85; i++) { await Promise.resolve(); f.tick(17); assertWholeGlobe(f); }
  await Promise.all(pending);
  assertCentred(f, locations[19 % 8]);
  assert.equal(f.viewer.entities.values.filter(e => e.point).length, 1);
});
