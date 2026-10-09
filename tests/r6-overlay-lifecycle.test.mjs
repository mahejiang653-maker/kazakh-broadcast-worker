import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/'+name, import.meta.url), 'utf8');
const collisionSource = source('news-globe-v52-screen-collision-hotfix.js');
const overviewSource = source('news-globe-v52-flags-overview-clean.js');

function event() {
  const listeners = new Set();
  return {
    addEventListener(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    raise(...args) { for (const fn of [...listeners]) fn(...args); },
    get size() { return listeners.size; },
  };
}
function host() {
  const listeners = new Map(), timers = new Map();
  let now = 0, serial = 0;
  const document = {hidden:false, getElementById:()=>null};
  const window = {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  };
  const context = vm.createContext({window, document, performance:{now:()=>now}, console:{info(){}},
    setTimeout(fn, delay=0) { const id=++serial; timers.set(id,{fn,at:now+delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {window, document, context, timers,
    fire(name, value) { for (const fn of [...(listeners.get(name)||[])]) fn(value); },
    advance(ms) {
      const end=now+ms;
      for (;;) {
        const due=[...timers].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); now=due[1].at; due[1].fn();
      }
      now=end;
    },
  };
}
function collision(entities=[]) {
  const h=host(), collectionChanged=event(), postRender=event();
  let reads=0, projections=0, destroyed=false;
  const values=[...entities];
  const collection={collectionChanged, get values(){reads++;return values;}};
  const viewer={entities:collection, clock:{currentTime:0}, scene:{postRender}, isDestroyed:()=>destroyed};
  const C={Cartesian2:class{constructor(x,y){this.x=x;this.y=y;}},
    SceneTransforms:{worldToWindowCoordinates(_,position){projections++;return position;}}};
  h.window.Cesium=C; h.window.NG14={viewer};
  vm.runInContext(collisionSource,h.context);
  return {...h, G:h.window.NG14, collectionChanged, postRender,
    get reads(){return reads;}, get projections(){return projections;},
    render(){h.advance(100);postRender.raise();},
    add(e){values.push(e);collectionChanged.raise(collection,[e],[],[]);},
    remove(e){values.splice(values.indexOf(e),1);collectionChanged.raise(collection,[],[e],[]);},
    change(e){collectionChanged.raise(collection,[],[],[e]);},
    destroyViewer(){destroyed=true;},
  };
}
const point=(x,y,extra={})=>({position:{x,y},point:{},...extra});
const label=(x,y,dx=0,dy=-40)=>({position:{x,y},label:{pixelOffset:{x:dx,y:dy}}});

test('8,000 borders are scanned once; settled labels require no projections',()=>{
  const place=label(200,150), h=collision([...Array.from({length:8000},()=>({polyline:{}})),point(200,150),place]);
  assert.equal(h.reads,1);
  h.render();
  assert.equal(h.projections,2);
  for(let i=0;i<50;i++)h.render();
  assert.equal(h.reads,1,'per-frame work must not traverse the entity collection');
  assert.equal(h.projections,2,'a settled label must not trigger point/label projections');
  assert.deepEqual({...h.G.v52ScreenCollision.getDiagnostics()},{indexedPoints:1,indexedLabels:1,disposed:false});
  assert.equal(place.label.pixelOffset.y,-40);
});

test('new, removed and later-assigned graphics update the index',()=>{
  const h=collision(), e={position:{x:100,y:100}};
  h.add(e);e.label={pixelOffset:{x:0,y:-40}};h.change(e);h.render();
  assert.equal(h.G.v52ScreenCollision.getDiagnostics().indexedLabels,1);
  const dot=point(100,60);h.add(dot);
  assert.equal(h.G.v52ScreenCollision.getDiagnostics().indexedPoints,1);
  e.label=null;h.change(e);h.remove(dot);h.render();
  assert.equal(h.G.v52ScreenCollision.getDiagnostics().indexedPoints,0);
  assert.equal(h.G.v52ScreenCollision.getDiagnostics().indexedLabels,0);
  assert.equal(h.reads,1);
});

test('hidden entities, inherited visibility and hidden graphics are not obstacles',()=>{
  const place=label(200,150), h=collision([place,
    point(200,110,{show:false}),point(200,110,{isShowing:false}),
    point(200,110,{point:{show:{getValue:()=>false}}}),
    {...label(200,150),show:false},
  ]);
  h.render();
  assert.equal(h.projections,1);
  assert.equal(place.__v52CollisionLocked.y,-40);
});

test('visible obstacles still move a label while its own anchor stays exempt',()=>{
  const place=label(200,150),h=collision([point(200,150),point(200,110),place]);h.render();
  assert.equal(place.__v52CollisionLocked.x,0);
  assert.equal(place.__v52CollisionLocked.y,52);
  h.render();assert.equal(place.label.pixelOffset.y,52);
  const alone=label(200,150),own=collision([point(200,150),alone]);own.render();
  assert.equal(alone.__v52CollisionLocked.y,-40);
});

test('a story label keeps its first painted position when its red marker is nearby',()=>{
  const place=label(200,150,0,-29);place.__v52FixedLabelOffset={x:0,y:-29};
  const h=collision([point(200,110),place]);
  const firstPaint={...place.label.pixelOffset};
  h.render();assert.deepEqual(place.label.pixelOffset,firstPaint,'postRender must not move an authored story label');
  h.add(point(200,150));
  place.position={x:20,y:20}; // Camera movement towards a screen edge.
  for(let i=0;i<5;i++)h.render();
  assert.deepEqual(place.label.pixelOffset,firstPaint);
  assert.equal(h.projections,0,'fixed story labels do not need collision projections');
});

test('background and destroyed viewers perform no screen-space work',()=>{
  const h=collision([label(100,100),point(100,100)]);
  h.document.hidden=true;h.render();assert.equal(h.projections,0);
  h.document.hidden=false;h.render();assert.equal(h.projections,2);
  h.add(label(200,200));h.destroyViewer();h.render();assert.equal(h.projections,2);
});

test('installation is unique, bfcache preserves it, teardown removes listeners',()=>{
  const h=collision([point(100,100)]);
  vm.runInContext(collisionSource,h.context);
  assert.equal(h.postRender.size,1);assert.equal(h.collectionChanged.size,1);
  h.fire('pagehide',{persisted:true});assert.equal(h.postRender.size,1);
  h.fire('pagehide',{persisted:false});
  assert.equal(h.postRender.size,0);assert.equal(h.collectionChanged.size,0);
  h.G.v52ScreenCollision.dispose();
  assert.deepEqual({...h.G.v52ScreenCollision.getDiagnostics()},{indexedPoints:0,indexedLabels:0,disposed:true});
});

function overview() {
  const h=host(),removed=[];
  let purges=0;
  const values=[{__v52StoryFlag:true},{__v52OwnedLabel:true},{polyline:{}}];
  const G={navSerial:1,viewer:{entities:{values,remove(e){removed.push(e);const i=values.indexOf(e);if(i>=0)values.splice(i,1);}},camera:{cancelFlight(){},flyHome(){}}},
    focus(i,countryFirst){this.navSerial++;return {i,countryFirst};},overview(){},clearCountry(){purges++;},
    markers:[{show:true}],pulses:[{show:true}],v51SceneEntities:[values[1]],
  };
  h.window.NG14=G;h.window.Cesium={JulianDate:{now:()=>0}};h.context.Cesium=h.window.Cesium;
  vm.runInContext(overviewSource,h.context);
  h.advance(1000); // Existing button-binding startup retries, not overview cleanup.
  return {...h,G,removed,values,get purges(){return purges;}};
}

test('100 repeated overview requests own at most nine cleanup jobs',()=>{
  const h=overview();for(let i=0;i<100;i++)h.G.overview();
  assert.equal(h.G.v52OverviewCleanup.getDiagnostics().pendingTimers,9);
  assert.equal(h.timers.size,9);
  h.advance(5000);
  assert.equal(h.G.v52OverviewCleanup.getDiagnostics().pendingTimers,0);
  assert.equal(h.timers.size,0);
  assert.equal(h.G.markers[0].show,false);assert.equal(h.G.pulses[0].show,false);
  assert.equal(h.G.v51SceneEntities.length,0);
  assert.equal(h.values.length,1,'persistent borders must survive overview cleanup');
});

test('a story cancels pending overview cleanup and preserves focus arguments',()=>{
  const h=overview();h.G.overview();const before=h.purges;
  assert.deepEqual({...h.G.focus(8,false)},{i:8,countryFirst:false});
  assert.equal(h.G.overviewMode,false);
  assert.equal(h.G.v52OverviewCleanup.getDiagnostics().pendingTimers,0);
  h.advance(5000);assert.equal(h.purges,before);
});

test('an already-queued stale cleanup callback cannot purge a later overview',()=>{
  const h=overview();h.G.overview();const queued=[...h.timers.values()][0].fn;
  h.G.focus(2);h.G.overview();const before=h.purges;
  queued();assert.equal(h.purges,before);
});

test('leaving the page cancels cleanup jobs; bfcache retains the current batch',()=>{
  const h=overview();h.G.overview();h.fire('pagehide',{persisted:true});
  assert.equal(h.G.v52OverviewCleanup.getDiagnostics().pendingTimers,9);
  h.fire('pagehide',{persisted:false});assert.equal(h.G.v52OverviewCleanup.getDiagnostics().pendingTimers,0);
  assert.equal(h.timers.size,0);
});
