(function (G) {
  if (!G || G.v52ChinaBoundaryOwnership || typeof G.loadBorders !== 'function') return;

  // The world dataset rounds foreign borders to 0.01 degrees, while China's
  // existing outline is more detailed. Exact endpoint keys cannot join them.
  // This bounded join changes ownership only; it never generates a China line.
  const FRONTIER_JOIN_METERS = 18000;
  const METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
  const CELL_DEGREES = .25;
  let removedGenericEdges = 0;
  const neighborIsos = new Set();

  function area(ring) {
    let sum = 0;
    for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    return Math.abs(sum / 2);
  }
  function mainlandIndex(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] :
      geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    const polygon = polygons.reduce((best, p) => area(p?.[0] || []) > area(best?.[0] || []) ? p : best, null);
    const ring = polygon?.[0];
    if (!ring || ring.length < 4) return null;
    const borderCells = new Map(), rayRows = new Map(), cache = new Map();
    const cell = value => Math.floor(value / CELL_DEGREES);
    const key = (x, y) => x + ':' + y;
    const add = (map, k, segment) => { if (!map.has(k)) map.set(k, []); map.get(k).push(segment); };
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (const p of ring) {
      west = Math.min(west, p[0]); east = Math.max(east, p[0]);
      south = Math.min(south, p[1]); north = Math.max(north, p[1]);
    }
    for (const [ri, r] of polygon.entries()) for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i], segment = [a, b];
      for (let y = cell(Math.min(a[1], b[1])); y <= cell(Math.max(a[1], b[1])); y++) {
        add(rayRows, key(ri, y), segment);
        if (ri === 0) for (let x = cell(Math.min(a[0], b[0])); x <= cell(Math.max(a[0], b[0])); x++) add(borderCells, key(x, y), segment);
      }
    }
    function insideRing(p, ri) {
      let inside = false;
      for (const [a, b] of rayRows.get(key(ri, cell(p[1]))) || []) {
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    }
    function matches(p) {
      if (!Array.isArray(p) || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1])) return false;
      const id = p[0] + ',' + p[1];
      if (cache.has(id)) return cache.get(id);
      const sx = METERS_PER_DEGREE * Math.cos(p[1] * Math.PI / 180);
      const dx = FRONTIER_JOIN_METERS / sx, dy = FRONTIER_JOIN_METERS / METERS_PER_DEGREE;
      let found = false;
      if (p[0] >= west - dx && p[0] <= east + dx && p[1] >= south - dy && p[1] <= north + dy) {
        found = insideRing(p, 0) && !polygon.slice(1).some((_, i) => insideRing(p, i + 1));
        if (!found) for (let x = cell(p[0] - dx); x <= cell(p[0] + dx) && !found; x++) {
          for (let y = cell(p[1] - dy); y <= cell(p[1] + dy) && !found; y++) {
            for (const [a, b] of borderCells.get(key(x, y)) || []) {
              const ax = (a[0] - p[0]) * sx, ay = (a[1] - p[1]) * METERS_PER_DEGREE;
              const vx = (b[0] - a[0]) * sx, vy = (b[1] - a[1]) * METERS_PER_DEGREE;
              const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / (vx * vx + vy * vy || 1)));
              if (Math.hypot(ax + t * vx, ay + t * vy) <= FRONTIER_JOIN_METERS) { found = true; break; }
            }
          }
        }
      }
      cache.set(id, found);
      return found;
    }
    return {matches};
  }

  function reconcile() {
    const china = G.countries?.get('CHN');
    if (!china?.entities?.some(e => e._chinaAuthoritativeOutline)) return 0;
    const index = mainlandIndex(china.authoritativeOutline?.geometry);
    if (!index) return 0;
    const obsolete = new Set();
    for (const e of G.borderEntities || []) {
      // Keep every authoritative island/territory ring and every shared foreign
      // border. Testing BOTH endpoints also preserves coasts leaving a tripoint.
      if (e._chinaAuthoritativeOutline || e._countryIsos?.size !== 1 || !e._edgeAB) continue;
      if (e._edgeAB.every(index.matches)) {
        obsolete.add(e);
        for (const iso of e._countryIsos) neighborIsos.add(iso);
      }
    }
    for (const e of obsolete) G.viewer.entities.remove(e);
    G.borderEntities = (G.borderEntities || []).filter(e => !obsolete.has(e));
    for (const country of G.countries.values()) if (Array.isArray(country.entities)) country.entities = country.entities.filter(e => !obsolete.has(e));
    removedGenericEdges += obsolete.size;
    return obsolete.size;
  }
  G.v52ChinaBoundaryOwnership = {
    reconcile,
    getDiagnostics: () => ({removedGenericEdges, neighborIsos: [...neighborIsos].sort(),
      authoritativeRings: G.countries?.get('CHN')?.entities?.filter(e => e._chinaAuthoritativeOutline).length || 0,
      joinMeters: FRONTIER_JOIN_METERS}),
  };
  const load = G.loadBorders;
  G.loadBorders = async function (...args) { const result = await load.apply(this, args); reconcile(); return result; };
})(window.NG14);
