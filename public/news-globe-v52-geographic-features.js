(function (G) {
  'use strict';
  if (!G || G.v52Geography || !window.Cesium) return;
  const C = window.Cesium;
  const VERSION = '20261009-r6-ground-geography';
  const areaTypes = new Set(['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
  let controller = null, activeSerial = null, detailEntities = [], removeMove = null, removeTerrain = null;
  const detailBands = new Map(), detailPending = new Map();
  let catalog = null, catalogPromise = null;
  let detailEpoch = 0, areaActive = false, state = null;
  const current = s => s === G.navSerial && !G.overviewMode;
  const signal = () => (controller ||= new AbortController()).signal;
  const value = p => p?.getValue ? p.getValue(G.viewer.clock.currentTime) : p;
  const terrainClamping = () => !C.EllipsoidTerrainProvider || !(G.viewer?.terrainProvider instanceof C.EllipsoidTerrainProvider);
  const pointOK = p => Array.isArray(p) && p.length >= 2 &&
    typeof p[0] === 'number' && typeof p[1] === 'number' &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

  function geometry(g) {
    if (g?.type === 'Feature') return geometry(g.geometry);
    if (!areaTypes.has(g?.type)) return null;
    const lines = g.type === 'LineString' ? [g.coordinates] :
      g.type === 'MultiPolygon' ? g.coordinates?.flat() : g.coordinates;
    if (!Array.isArray(lines) || !lines.length) return null;
    let count = 0;
    for (const line of lines) {
      if (!Array.isArray(line) || line.length < (g.type.includes('Polygon') ? 4 : 2) || !line.every(pointOK)) return null;
      count += line.length;
      if (count > 50000) return null;
      if (g.type.includes('Polygon') && (line[0][0] !== line.at(-1)[0] || line[0][1] !== line.at(-1)[1])) return null;
    }
    return g;
  }
  function explicit(n) {
    if (n.focusGeometry) return geometry(n.focusGeometry);
    if (n.focusLine) return geometry({type:'LineString', coordinates:n.focusLine});
    if (n.focusMultiLine) return geometry({type:'MultiLineString', coordinates:n.focusMultiLine});
    if (n.focusPolygon) return geometry({type:'Polygon', coordinates:n.focusPolygon});
    if (n.focusMultiPolygon) return geometry({type:'MultiPolygon', coordinates:n.focusMultiPolygon});
    const b = n.focusBounds || n.focusBBox;
    if (Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[1] < b[3]) {
      const [w,s,e,t] = b;
      return geometry({type:'Polygon', coordinates:[[[w,s],[e,s],[e,t],[w,t],[w,s]]]});
    }
    return null;
  }
  function kind(n) {
    const t = [n.featureKind, n.placeType, n.focusLabel, n.location].filter(Boolean).join(' ');
    if (/公路|道路|高速|铁路|\b(?:road|highway|railway|route)\b/i.test(t)) return 'road';
    if (/山脉|山系|山地|山岭|\b(?:mountain|ridge|range)\b/i.test(t)) return 'mountain';
    if (/水域|海域|海峡|海湾|海洋|湖泊|湖|河流|运河|(?:江|河)(?:$|[\s（(])|\b(?:ocean|sea|gulf|bay|lake|water|river|canal|strait)\b/i.test(t)) return 'water';
    if (/景区|风景区|国家公园|保护区|\b(?:scenic|park|reserve)\b/i.test(t)) return 'scenic';
    return explicit(n) ? 'area' : null;
  }
  function placeLabel(n) {
    // A city is separate from the country chip. Never infer a research location
    // from a country's default coordinate; uncertainty remains in the story data.
    const city = typeof n.city === 'string' ? n.city : n.city?.focusLabel || n.city?.location;
    return String(n.scenePlan?.targetLabel || city || n.focusLabel || n.location || '新闻地点').trim();
  }
  const ground = (coordinates, color, width = 2.7, approximate = false) => ({polyline:{
    positions:C.Cartesian3.fromDegreesArray(coordinates.flatMap(p => [p[0],p[1]])),
    clampToGround:terrainClamping(), arcType:C.ArcType.GEODESIC, width,
    material:approximate ? new C.PolylineDashMaterialProperty({color,dashLength:14}) : color,
  }});
  function add(spec) { const e = G.viewer.entities.add(spec); G.localHighlightEntities.push(e); return e; }
  function hidePoint() {
    if (G.markers?.[G.current]) G.markers[G.current].show = false;
    if (G.pulses?.[G.current]) G.pulses[G.current].show = false;
  }
  function restoreBorders() {
    for (const e of G.borderEntities || []) e.show = !G.overviewMode;
  }
  function clearDetails(restore = true) {
    detailEpoch++;
    for (const e of detailEntities) G.viewer?.entities.remove(e);
    detailEntities = [];
    if (restore) restoreBorders();
  }
  function cleanup() {
    controller?.abort(); controller = null; activeSerial = null; areaActive = false; state = null;
    removeMove?.(); removeMove = null; clearDetails();
  }
  const clearLocal = G.clearLocal;
  G.clearLocal = function (...args) { cleanup(); return clearLocal?.apply(this, args); };
  const update = G.updateOcclusion;
  G.updateOcclusion = function (...args) { const result = update?.apply(this, args); if (areaActive) hidePoint(); return result; };
  const validate = G.validate;
  G.validate = function (payload) {
    const errors = validate(payload);
    for (const [i,n] of (Array.isArray(payload?.news) ? payload.news : []).entries()) {
      if (['focusGeometry','focusLine','focusMultiLine','focusPolygon','focusMultiPolygon','focusBounds','focusBBox'].some(k => n?.[k] != null) && !explicit(n))
        errors.push('第' + (i+1) + '条地理线面无效：请检查经纬度、闭合轮廓和坐标数量');
    }
    return errors;
  };
  const loadBorders = G.loadBorders;
  G.loadBorders = async function (...args) {
    const result = await loadBorders.apply(this, args);
    for (const e of G.borderEntities || []) {
      const positions = value(e.polyline?.positions);
      if (!positions) continue;
      e.polyline.positions = positions.map(p => C.Ellipsoid.WGS84.scaleToGeodeticSurface(p));
      // The current globe has an ellipsoid surface. Zero-height geodesic lines
      // already sit on it; projecting 8,000 segments adds avoidable GPU work.
      // Enable terrain projection only when there is actual terrain to follow.
      e.polyline.clampToGround = terrainClamping();
      e.polyline.arcType = C.ArcType.GEODESIC;
    }
    if (!removeTerrain && G.viewer.scene?.globe?.terrainProviderChanged) removeTerrain =
      G.viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
        for (const e of [...(G.borderEntities || []),...detailEntities,...(G.localHighlightEntities || [])])
          if (e.polyline) e.polyline.clampToGround = terrainClamping();
      });
    return result;
  };
  const initViewer = G.initViewer;
  if (typeof initViewer === 'function') G.initViewer = function (...args) {
    // Load the small local reference before expensive globe/border initialization,
    // so a rapid first visit to the route need not compete with imagery requests.
    void loadCatalog().catch(() => {});
    return initViewer.apply(this,args);
  };
  async function json(url, sig, timeout = 5000) {
    const local = new AbortController(), stop = () => local.abort();
    if (sig?.aborted) throw new DOMException('Aborted', 'AbortError');
    sig?.addEventListener('abort', stop, {once:true});
    const timer = setTimeout(stop, timeout);
    try {
      const r = await fetch(url, {signal:local.signal});
      if (!r.ok) throw new Error('Geography resource ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); sig?.removeEventListener('abort', stop); }
  }
  async function loadCatalog(sig) {
    if (catalog) return catalog;
    // Small same-origin reference geometries. Reset on failure so a later story can retry.
    if (!catalogPromise) catalogPromise = json('/news-globe-geography-v1.json',null,12000)
      .then(d => (catalog = d)).finally(() => { catalogPromise = null; });
    return catalogPromise;
  }
  async function resolve(n, sig) {
    const g = explicit(n);
    if (g) return {geometry:g, approximate:!!(n.focusBounds || n.focusBBox || n.geometryApproximate),
      precision:n.geometryPrecision, source:n.geometrySource};
    const k = kind(n);
    if (!k) return null;
    if (n.featureId || /独库公路/.test(n.focusLabel || n.location || '')) {
      const data = await loadCatalog(sig), f = data.features?.[n.featureId || 'duku-highway'];
      if (geometry(f?.geometry)) return f;
    }
    const q = new URLSearchParams({location:n.focusQuery || placeLabel(n), placeType:n.placeType || k,
      country:n.country || '', countryIso3:n.countryIso3 || '', lon:String(n.lon), lat:String(n.lat)});
    const result = await json('/api/geo-highlight?' + q, sig, 4500);
    if (!result.approximate && geometry(result.geometry) &&
        (k !== 'road' || result.geometry.type.includes('LineString'))) return result;
    return null;
  }
  function allPoints(g) {
    return g.type === 'LineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat();
  }
  function draw(g, n, result) {
    const k = kind(n), color = C.Color.fromCssColorString(k === 'water' ? '#58cfff' : k === 'mountain' ? '#ffd27a' : '#ff6572');
    const approximate = !!result.approximate;
    if (g.type.includes('LineString')) {
      for (const line of g.type === 'LineString' ? [g.coordinates] : g.coordinates) add(ground(line,color,3.4,approximate));
    } else {
      for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
        const ring = r => r.map(p => C.Cartesian3.fromDegrees(p[0],p[1],0));
        add({polygon:{hierarchy:new C.PolygonHierarchy(ring(poly[0]),poly.slice(1).map(r => new C.PolygonHierarchy(ring(r)))),
          heightReference:C.HeightReference.CLAMP_TO_GROUND, perPositionHeight:false,
          material:color.withAlpha(.14), outline:false}});
        for (const r of poly) add(ground(r,color,2.5,approximate));
      }
    }
    return color;
  }
  function label(text, position) {
    const c = C.Cartographic.fromCartesian(position);
    const e = G.label(text,C.Math.toDegrees(c.longitude),C.Math.toDegrees(c.latitude),'local');
    if (e) {
      // Older label cleaners remove “示意”; retain the precision annotation.
      e.label.text = String(text);
      e.position = C.Cartesian3.fromRadians(c.longitude,c.latitude,0);
      e.label.heightReference = C.HeightReference.CLAMP_TO_GROUND;
      e.label.pixelOffset = new C.Cartesian2(0,-22);
      G.localLabelEntity = e;
    }
  }
  G.v52RenderGeographicFeature = async function (n, serial) {
    if (!kind(n)) return false;
    areaActive = true; hidePoint();
    let result;
    try { result = await resolve(n, signal()); } catch (e) { if (e.name !== 'AbortError') console.warn('[R6 geography]',e.message); }
    if (!current(serial)) return true;
    const g = geometry(result?.geometry);
    if (!g) {
      // Do not invent a circle/rectangle, or silently turn a road back into a red dot.
      state = {serial, status:'unavailable', label:placeLabel(n)};
      const p = C.Cartesian3.fromDegrees(+n.lon,+n.lat,0);
      await new Promise(r => G.viewer.camera.flyToBoundingSphere(new C.BoundingSphere(p,1), {
        offset:new C.HeadingPitchRange(0,-Math.PI/2,450000),duration:1.35,complete:r,cancel:r}));
      if (current(serial)) label(placeLabel(n) + '（范围待补）',p);
      return true;
    }
    draw(g,n,result);
    const points = allPoints(g).map(p => C.Cartesian3.fromDegrees(p[0],p[1],0));
    const sphere = C.BoundingSphere.fromPoints(points), frustum = G.viewer.camera.frustum;
    const fovy = frustum.fovy || Math.PI/3, aspect = frustum.aspectRatio || 16/9;
    const half = Math.min(fovy/2,Math.atan(Math.tan(fovy/2)*aspect));
    const range = Math.max(30000, sphere.radius / Math.sin(half) * 1.18);
    await new Promise(r => G.viewer.camera.flyToBoundingSphere(sphere, {
      offset:new C.HeadingPitchRange(0,-Math.PI/2,range),duration:1.5,complete:r,cancel:r}));
    if (!current(serial)) return true;
    const suffix = result.approximate ? '（范围示意）' : result.precision === 'reference-route' ? '（参考路线）' : '';
    label(placeLabel(n) + suffix,sphere.center);
    state = {serial,status:'ready',type:g.type,label:placeLabel(n),source:result.source || '',precision:result.precision || (result.approximate?'approximate':'geometry'),points:points.length};
    G.v52StartDetailedBorders(serial);
    return true;
  };

  async function loadBand(band) {
    if (detailBands.has(band)) return detailBands.get(band);
    if (!detailPending.has(band)) detailPending.set(band, (async () => {
      const timeout = AbortSignal.timeout(12000);
      const r = await fetch('/news-globe-detail-borders-v1/' + band + '.json.gz', {signal:timeout});
      if (!r.ok) throw new Error('Detailed borders ' + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const stream = new Blob([bytes]).stream();
      // Works whether the host serves gzip as a file or has already decoded it.
      const body = bytes[0] === 31 && bytes[1] === 139 ? stream.pipeThrough(new DecompressionStream('gzip')) : stream;
      const data = await new Response(body).json();
      detailBands.set(band,data);
      // Keep recent latitude bands only, even during a long interactive session.
      if (detailBands.size > 6) detailBands.delete(detailBands.keys().next().value);
      return data;
    })().finally(() => { detailPending.delete(band); }));
    return detailPending.get(band);
  }
  async function loadDetail(keys) {
    const bands = [...new Set(keys.map(k => Number(k.split('_')[1])))];
    const data = await Promise.all(bands.map(loadBand));
    return {tiles:Object.assign({},...data.map(d => d.tiles))};
  }
  function tileKeys(rect) {
    let w = C.Math.toDegrees(rect.west), e = C.Math.toDegrees(rect.east);
    const s = Math.max(-90,C.Math.toDegrees(rect.south)), n = Math.min(89.999,C.Math.toDegrees(rect.north));
    if (e < w) e += 360;
    const keys = [];
    for (let y = Math.max(0,Math.floor((s+90)/10)); y <= Math.min(17,Math.floor((n+90)/10)); y++)
      for (let x = Math.floor((w+180)/10); x <= Math.floor((e+180)/10); x++) keys.push(((x%36+36)%36)+'_'+y);
    return [...new Set(keys)];
  }
  async function refreshDetails() {
    const serial = activeSerial, epoch = ++detailEpoch;
    if (!current(serial)) return;
    if (G.viewer.camera.positionCartographic.height > 1800000) { clearDetails(); return; }
    const rect = G.viewer.camera.computeViewRectangle();
    if (!rect) return;
    const keys = tileKeys(rect);
    if (keys.length > 24) { clearDetails(); return; }
    let data;
    try { data = await loadDetail(keys); } catch { return; } // keep the clamped baseline on a failed optional download
    if (!current(serial) || activeSerial !== serial || epoch !== detailEpoch) return;
    const next = [];
    for (const key of keys) for (const line of data.tiles[key] || []) {
      const e = G.viewer.entities.add(ground(line,C.Color.fromCssColorString('#d8f3ff').withAlpha(.50),.75));
      next.push(e);
    }
    for (const e of detailEntities) G.viewer.entities.remove(e);
    detailEntities = next;
    for (const e of G.borderEntities || []) e.show = !!e._chinaAuthoritativeOutline;
    G.viewer.scene.requestRender();
  }
  G.v52StartDetailedBorders = function (serial) {
    if (!current(serial)) return;
    activeSerial = serial;
    removeMove?.();
    removeMove = G.viewer.camera.moveEnd.addEventListener(refreshDetails);
    void refreshDetails();
  };
  G.v52PlaceLabel = placeLabel;
  G.v52Geography = {version:VERSION, geometry, explicit, kind, tileKeys,
    getDiagnostics:() => ({version:VERSION,areaActive,state:state && {...state},detailEntities:detailEntities.length,
      lineSurface:terrainClamping()?'terrain-clamped':'ellipsoid-surface',
      detailReady:detailBands.size>0,cachedBands:detailBands.size,activeSerial,moveListener:!!removeMove})};
  window.addEventListener('pagehide',e => { if (!e.persisted) { cleanup(); removeTerrain?.(); removeTerrain = null; } });
})(window.NG14);
