(function (G, C) {
  'use strict';
  if (!G || !C || G.v52DetailedBorders) return;
  const ROOT = '/news-globe-country-borders-v2/';
  const VERSION = '20261121-detailed-country-borders-v2';
  const ELEVATION = 18000;
  const ISO = /^[A-Z]{3}$/;
  const pending = new Map(), cache = new Map(), tried = new Set();
  const EMPTY = new Map();
  let index, key = '', installedKey = '', active = EMPTY, drawn = [], wanted = new Set();
  let cachedSegments = 0, segments = 0;

  async function json(name, signal) {
    const response = await fetch(ROOT + name, {cache:'force-cache', signal});
    if (!response.ok) throw Error('Border data HTTP ' + response.status);
    return response.json();
  }
  function annotationsHidden() {
    return document.body?.classList?.contains('v52-detail-close') === true;
  }
  function style(iso) {
    const base = G.countries.get(iso)?.entities?.find(e => e.polyline)?.polyline;
    return {width:base?.width ?? .63, material:base?.material ?? C.Color.fromCssColorString('#e6f3ff')};
  }
  function addLine(positions, iso) {
    return G.viewer.entities.add({show:false,polyline:{positions,clampToGround:false,
      arcType:C.ArcType.GEODESIC,...style(iso)}});
  }
  function decode(encoded) {
    // Signed delta varints of source vertices in millionths of a degree.
    const raw = atob(encoded), positions = [];
    let i = 0, x = 0, y = 0;
    function read() {
      let value = 0;
      for (let shift = 0; shift < 35 && i < raw.length; shift += 7) {
        const b = raw.charCodeAt(i++);
        value += (b & 127) * 2 ** shift;
        if (b < 128) return value % 2 ? -(value + 1) / 2 : value / 2;
      }
      throw Error('Invalid border coordinate');
    }
    while (i < raw.length) {
      x += read(); y += read();
      if (Math.abs(x) > 180e6 || Math.abs(y) > 90e6 || positions.length >= 384 * 3)
        throw Error('Border coordinate out of bounds');
      positions.push(x / 1e6,y / 1e6,ELEVATION);
    }
    if (positions.length < 6) throw Error('Border arc too short');
    return positions;
  }
  function trimCache(wanted) {
    for (const [iso,item] of cache) {
      if (cachedSegments <= 180000 && cache.size <= 12) break;
      if (wanted.has(iso)) continue;
      cache.delete(iso); cachedSegments -= item.count;
    }
  }
  function request(iso) {
    if (cache.has(iso) || pending.has(iso) || tried.has(iso)) return;
    tried.add(iso);
    const [count,files] = index.packs[iso];
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),6000);
    pending.set(iso,controller);
    Promise.all(files.map(file => json(file,controller.signal))).then(chunks => {
      if (controller.signal.aborted) return;
      const arcs = chunks.flat().map(([id,codes,encoded]) => {
        const owners = codes.match(/.{3}/g);
        if (!owners?.includes(iso)) throw Error('Border owner missing from requested pack');
        return {id,owners,positions:decode(encoded)};
      });
      if (!arcs.length || arcs.reduce((n,arc) => n + arc.positions.length / 3 - 1,0) !== count)
        throw Error('Incomplete border pack');
      cache.set(iso,{arcs,count}); cachedSegments += count;
      trimCache(wanted);
      // Recalculate from the latest story; never show a country's late results
      // after a switch, in overview or in an annotation-free closeup.
      if (!annotationsHidden()) G.applyStoryBorders?.();
    }).catch(() => {
      // The existing outline remains usable if any selected pack fails.
    }).finally(() => {
      clearTimeout(timeout);
      if (pending.get(iso) === controller) pending.delete(iso);
    });
  }

  function clearDetail() {
    if (drawn.length) {
      for (const e of drawn) G.viewer.entities.remove(e);
      G.borderEntities = G.borderEntities.filter(e => !e.__v52DetailedBorder);
    }
    drawn = []; active = EMPTY; installedKey = ''; segments = 0;
  }
  function forCountries(isos) {
    if (!index) return EMPTY;
    const detailIsos = [...isos].filter(iso => Object.hasOwn(index.packs,iso)).sort();
    const includesChina = isos.has('CHN') && G.countries.get('CHN')?.entities?.some(e => e._chinaAuthoritativeOutline);
    const nextKey = detailIsos.join(',') + (includesChina ? '|CHN' : '');
    if (key !== nextKey) {
      key = nextKey;
      tried.clear();
      wanted = new Set(detailIsos);
      for (const [iso,controller] of pending) if (!wanted.has(iso)) {
        controller.abort(); pending.delete(iso);
      }
      for (const iso of wanted) {
        const item = cache.get(iso);
        if (item) { cache.delete(iso); cache.set(iso,item); }
        else request(iso);
      }
      trimCache(wanted);
      clearDetail();
    }
    if (!detailIsos.length || detailIsos.some(iso => !cache.has(iso))) return EMPTY;
    if (installedKey === key) return active;
    const shared = new Map(), byCountry = new Map();
    try {
      for (const iso of detailIsos) {
        const list = [];
        for (const arc of cache.get(iso).arcs) {
          // Keep the full neighbor border when it is shown alone. If China is
          // also selected, its existing outline represents the shared frontier.
          if (includesChina && arc.owners.includes('CHN')) continue;
          let e = shared.get(arc.id);
          if (!e) {
            const positions = C.Cartesian3.fromDegreesArrayHeights(arc.positions);
            e = addLine(positions,iso);
            e.__v52DetailedBorder = true; e._countryIsos = new Set(arc.owners);
            shared.set(arc.id,e); drawn.push(e); G.borderEntities.push(e);
            segments += positions.length - 1;
          }
          list.push(e);
        }
        byCountry.set(iso,list);
      }
      installedKey = key; active = byCountry;
    } catch {
      clearDetail(); installedKey = key;
    }
    return active;
  }

  function installExtras() {
    // The coarse worldwide map has no shape at all for many small countries.
    // Index rings are a compact fallback; their full detail is still on demand.
    for (const [iso,[name,iso2,ring]] of Object.entries(index.extras)) {
      if (!ISO.test(iso) || G.countries.has(iso) || !Array.isArray(ring) || ring.length < 4) continue;
      const feature = {type:'Feature',properties:{iso_a3:iso,iso_a2:iso2,name_zh:name},
        geometry:{type:'Polygon',coordinates:[ring]}};
      const e = addLine(G.positions(ring,ELEVATION),iso);
      e._countryIsos = new Set([iso]);
      G.borderEntities.push(e);
      const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
      const bbox = [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      const sphere = C.BoundingSphere.fromPoints(ring.map(([x,y]) => C.Cartesian3.fromDegrees(x,y,0)));
      G.countries.set(iso,{feature,entities:[e],bbox,sphere,name,iso2,center:G.centerOf(feature.geometry)});
      G.worldGeo?.features?.push(feature);
    }
  }
  const loadBorders = G.loadBorders;
  G.loadBorders = async function (...args) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),4000);
    const manifest = json('index.json',controller.signal).catch(() => null).finally(() => clearTimeout(timeout));
    const [result,data] = await Promise.all([loadBorders.apply(this,args),manifest]);
    if (data?.version === 2 && data.packs && data.extras) {
      G.viewer.entities.suspendEvents();
      try { index = data; installExtras(); }
      catch (error) { console.warn('[V52 detailed borders] Country index unavailable',error); index = null; }
      finally { G.viewer.entities.resumeEvents(); }
      G.applyStoryBorders?.();
    }
    return result;
  };
  const setCountry = G.setCountry;
  G.setCountry = function (iso,on,...args) {
    const result = setCountry?.call(this,iso,on,...args);
    const code = String(iso || '').toUpperCase();
    if (active.has(code)) for (const e of active.get(code)) Object.assign(e.polyline,style(code));
    return result;
  };
  G.v52DetailedBorders = {version:VERSION,forCountries,annotationsHidden,
    getDiagnostics:() => ({countries:[...active.keys()],segments,lines:drawn.length,pending:[...pending.keys()],
      availableCountries:index ? Object.keys(index.packs).length : 0})};
})(window.NG14,window.Cesium);
