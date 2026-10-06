import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
// Snapshot of the same WORLD URL the production core already uses, not a new map source.
const world = JSON.parse(fs.readFileSync(new URL('./fixtures/r6-world-borders-20261007.geojson', import.meta.url)));
const outline = JSON.parse(source('news-globe-china-outline-v52.geojson'));
const expected = {AFG:1,BTN:5,IND:18,KAZ:11,KGZ:10,LAO:4,MMR:15,MNG:45,NPL:9,PAK:3,PRK:9,RUS:33,TJK:5,VNM:9};
const ownershipSource = source('news-globe-v52-china-border-ownership.js');

function harness() {
  const values = [], warnings = [];
  const color = {withAlpha(){return this;}};
  const C = {
    Color:{fromCssColorString:()=>color,BLACK:color,WHITE:color},ArcType:{GEODESIC:1},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height}),
      fromDegreesArrayHeights:a=>Array.from({length:a.length/3},(_,i)=>({lon:a[i*3],lat:a[i*3+1],height:a[i*3+2]}))},
    BoundingSphere:{fromPoints:points=>({points,radius:2000000})},
    PolygonHierarchy:class {constructor(positions){this.positions=positions;}},
    Cartesian2:class {constructor(x,y){this.x=x;this.y=y;}},
    HeadingPitchRange:class {},Math:{toRadians:n=>n*Math.PI/180},
    LabelStyle:{FILL_AND_OUTLINE:1},HorizontalOrigin:{CENTER:1},VerticalOrigin:{CENTER:1},
  };
  const context=vm.createContext({window:{Cesium:C},Cesium:C,
    localStorage:{getItem:()=>null},document:{getElementById:()=>null},
    console:{info(){},warn:e=>warnings.push(e)},setTimeout,clearTimeout,clearInterval});
  vm.runInContext(source('news-globe-v14-core.js'),context);
  const G=context.window.NG14;
  G.viewer={entities:{values,add(e){values.push(e);return e;},remove(e){const i=values.indexOf(e);if(i<0)return false;values.splice(i,1);return true;}},
    camera:{flyToBoundingSphere(_sphere,options){options.complete();}}};
  G.fetchJSON=async urls=>urls===G.WORLD?structuredClone(world):urls===G.CHINA_OUTLINE?structuredClone(outline):{features:[]};
  G.wait=async()=>true;
  const install=()=>vm.runInContext(ownershipSource,context);
  return {G,values,warnings,context,install};
}

test('mixed-resolution world frontiers reproduce the actual double-line bug',async()=>{
  const {G}=harness();await G.loadBorders();
  const oldChina=G.countries.get('CHN');
  assert.equal(oldChina.entities.length,514);
  assert.ok(oldChina.entities.every(e=>e._chinaAuthoritativeOutline));
  // The former exact-key cleanup did not discover any of these neighboring lines.
  const legacy=G.countries.get('KAZ').entities.find(e=>e._edgeAB?.some(p=>p[0]===87.36&&p[1]===49.21));
  assert.ok(legacy);assert.deepEqual([...legacy._countryIsos],['KAZ']);
});

test('canonical China replaces 177 neighbor-side frontiers without changing other borders',async()=>{
  const h=harness();await h.G.loadBorders();
  const before=new Map([...h.G.countries].map(([iso,c])=>[iso,[...c.entities]]));
  const shared=h.G.borderEntities.filter(e=>e._countryIsos.size>1);
  const china=[...before.get('CHN')];h.install();
  assert.equal(h.G.v52ChinaBoundaryOwnership.reconcile(),177);
  assert.equal(h.G.borderEntities.length,8132-177);
  const removed={};
  for(const [iso,old]of before){const count=old.length-h.G.countries.get(iso).entities.length;if(count)removed[iso]=count;}
  assert.deepEqual(removed,expected);
  assert.ok(shared.every(e=>h.G.borderEntities.includes(e)),'foreign shared borders must remain');
  assert.ok(china.every(e=>h.G.borderEntities.includes(e)&&h.values.includes(e)),'all 514 authoritative rings must remain');
  assert.equal(h.G.v52ChinaBoundaryOwnership.reconcile(),0,'reconciliation is idempotent');
  for(const c of h.G.countries.values())assert.ok(c.entities.every(e=>h.values.includes(e)),'no stale country references');
  assert.equal(h.warnings.length,0);
});

test('coastal continuations and shared tripoint borders stay visible',async()=>{
  const h=harness();h.install();await h.G.loadBorders();
  const matches=(iso,a,b)=>h.G.countries.get(iso).entities.some(e=>e._edgeAB?.every(p=>[a,b].some(q=>p[0]===q[0]&&p[1]===q[1])));
  assert.ok(matches('VNM',[108.05,21.55],[106.72,20.7]));
  assert.ok(matches('PRK',[124.27,39.93],[124.74,39.66]));
  assert.ok(matches('PRK',[130.78,42.22],[130.4,42.28]));
  assert.ok(matches('RUS',[130.78,42.22],[130.64,42.4]));
  assert.ok(!matches('KAZ',[87.36,49.21],[86.6,48.55]));
});

test('load wrapper runs once after borders exist and introduces no timer or RAF',async()=>{
  const h=harness();h.install();const wrapped=h.G.loadBorders;h.install();
  assert.equal(h.G.loadBorders,wrapped);await h.G.loadBorders();
  const state=h.G.v52ChinaBoundaryOwnership.getDiagnostics();
  assert.equal(state.removedGenericEdges,177);assert.equal(state.authoritativeRings,514);
  assert.deepEqual([...state.neighborIsos],Object.keys(expected).sort());
  assert.ok(!/setTimeout|setInterval|requestAnimationFrame|addEventListener/.test(ownershipSource));
});

test('missing authoritative data never suppresses foreign geometry',async()=>{
  const h=harness();await h.G.loadBorders();h.install();
  h.G.countries.get('CHN').authoritativeOutline=null;
  const before=h.values.length;assert.equal(h.G.v52ChinaBoundaryOwnership.reconcile(),0);
  assert.equal(h.values.length,before);
});

test('active R6 country fill uses authoritative rings while camera fitting retains its baseline geometry',async()=>{
  const h=harness();h.install();await h.G.loadBorders();
  const original=h.G.countries.get('CHN').feature;
  const points=h.G.collect(original,[]).length;
  let fittingPoints;
  h.G.viewer.camera.flyToBoundingSphere=(sphere,opts)=>{fittingPoints=sphere.points.length;opts.complete();};
  vm.runInContext(source('news-globe-v14-v51-scene-engine.js'),h.context);
  await h.G.runSequence({sceneMode:'COUNTRY',countryIso3:'CHN'},'CHN',h.G.navSerial);
  const fills=h.G.v51SceneEntities.filter(e=>e.polygon);
  assert.equal(fills.length,514);assert.equal(fittingPoints,points);
  assert.equal(h.G.countries.get('CHN').feature,original,'do not replace camera or event country geometry');
  assert.deepEqual(fills[0].polygon.hierarchy.positions.map(p=>[p.lon,p.lat]),
    outline.geometry.coordinates[0][0]);
  assert.ok(fills.every(e=>e.polygon.outline===false));
});
