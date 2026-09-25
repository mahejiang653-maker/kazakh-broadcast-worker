import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {getEventListeners} from 'node:events';

const require=createRequire(import.meta.url);
if(!process.env.CESIUM_TEST_BUNDLE)throw Error('Set CESIUM_TEST_BUNDLE to the Cesium 1.145.0 index.cjs bundle (see V52_EVENT_EFFECT_QA.md).');
const C=require(process.env.CESIUM_TEST_BUNDLE);assert.equal(C.VERSION,'1.145.0');
const read=name=>fs.readFileSync(new URL('../public/releases/y1/'+name,import.meta.url),'utf8');
const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/y1-events.json',import.meta.url),'utf8'));

function fixture(){
  let now=0,nextId=0;const timers=new Map(),events=new EventTarget();
  const schedule=(fn,ms=0,kind='timer')=>{const id=++nextId;timers.set(id,{fn,due:now+ms,kind});return id};
  const cancel=id=>timers.delete(id);
  const canvas={clientWidth:1280,clientHeight:720,closest:()=>null};
  const scene={canvas,globe:{ellipsoid:C.Ellipsoid.WGS84},ellipsoid:C.Ellipsoid.WGS84,mapProjection:new C.GeographicProjection(),mode:C.SceneMode.SCENE3D,drawingBufferWidth:1280,drawingBufferHeight:720,preUpdate:new C.Event(),postUpdate:new C.Event(),requestRender(){},screenSpaceCameraController:{enableInputs:true,enableTranslate:true,enableTilt:true,enableLook:true,minimumZoomDistance:1}};
  const camera=new C.Camera(scene);camera.setView({destination:C.Cartesian3.fromDegrees(90,22,16000000)});
  const viewer={scene,camera,entities:new C.EntityCollection(),resize(){},clock:{currentTime:C.JulianDate.now()}};
  // Synthetic geometry tests resource ownership/colors, not national borders.
  // Product border data is never loaded, replaced or modified by these fixtures.
  const centers={CAN:[-105,55],USA:[-98,40],IRN:[53,33],RUS:[90,60],UKR:[32,49],FRA:[2,47],DEU:[10,51],JPN:[138,37],THA:[101,15],KHM:[105,12]};
  const countries=new Map(Object.entries(centers).map(([iso,[x,y]])=>[iso,{center:[x,y],entities:[],feature:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[x-4,y-3],[x+4,y-3],[x+4,y+3],[x-4,y+3],[x-4,y-3]]]}}}]));
  const G={viewer,countries,news:structuredClone(cases),navSerial:0,current:0,markers:[],pulses:[],v51SceneEntities:[],legacy:[],
    resolveIso:n=>n.countryIso3||n.primaryCountry||'',countryName:x=>x,adminSteps:n=>n.adminChain||[],runSequence:async()=>{},storyDuration:()=>15000,
    wait:(ms,s)=>new Promise(resolve=>schedule(()=>resolve(s===G.navSerial),ms)),
    clearCountry(){cancel(G.countryBlinkTimer);G.countryBlinkTimer=null},clearLocal(){cancel(G.localHighlightTimer);G.localHighlightTimer=null},
    clearSecondaryCountry(){cancel(G.secondaryBlinkTimer);G.secondaryBlinkTimer=null},
    clearInteractionEffects(){for(const e of G.legacy.splice(0))viewer.entities.remove(e)},
    clearArc(){cancel(G.arcTimer);G.arcTimer=null;if(G.transientArc)viewer.entities.remove(G.transientArc);G.transientArc=null},
    focus(i){G.navSerial++;G.current=(i+G.news.length)%G.news.length;const n=G.news[G.current];return G.runSequence(n,G.resolveIso(n),G.navSerial)},
    overview(){G.navSerial++},buildScene(){},
    showArc(a,b){G.clearArc();G.transientArc=viewer.entities.add({polyline:{positions:[C.Cartesian3.fromDegrees(G.news[a].lon,G.news[a].lat),C.Cartesian3.fromDegrees(G.news[b].lon,G.news[b].lat)]}});G.arcTimer=schedule(G.clearArc,520)},
    navigate(i){const from=G.current,to=(i+G.news.length)%G.news.length;if(from!==to)G.showArc(from,to);return G.focus(to)},
    positions:(ring,height)=>C.Cartesian3.fromDegreesArrayHeights(ring.flatMap(p=>[p[0],p[1],height])),
  };
  G.flashAdmin=async(_n,_iso,s,hold)=>G.wait(hold,s);
  const root={NG14:G,Cesium:C,performance:{now:()=>now},devicePixelRatio:1,innerHeight:900,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),matchMedia:()=>({matches:false})};
  const context=vm.createContext({window:root,Cesium:C,document:{getElementById:()=>null},performance:root.performance,setTimeout:schedule,clearTimeout:cancel,setInterval:(fn,ms)=>schedule(fn,ms,'interval'),clearInterval:cancel,requestAnimationFrame:fn=>schedule(fn,16,'raf'),cancelAnimationFrame:cancel,console});
  const load=name=>vm.runInContext(read(name),context,{filename:name});
  for(const name of ['news-globe-v14-v34-final-polish.js','news-globe-v14-v51-scene-engine.js','news-globe-v14-v52-camera-breathing-room.js','news-globe-v14-v52-event-geometry.js','news-globe-v14-v52-event-model.js','news-globe-v14-v52-event-effects.js'])load(name);
  G.attachCameraController(viewer);
  async function tick(ms=40){
    now+=ms;for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.fn(now)}
    scene.preUpdate.raiseEvent(scene);scene.postUpdate.raiseEvent(scene);
    for(let i=0;i<5;i++)await Promise.resolve();
  }
  async function until(check,limit=35000){for(let i=0;i<limit/40&&!check();i++)await tick();assert.ok(check(),'condition must settle within the bounded scene duration')}
  return {G,viewer,scene,camera,canvas,root,events,timers,tick,until,load,geo:G.EventGeometry,model:G.EventModel,manager:G.eventEffects};
}
const time=C.JulianDate.now();
const css=e=>{const v=e.getValue(time);return [v.red,v.green,v.blue].map(x=>Math.round(x*255)).join(',')};
const RED='255,64,80',BLUE='61,189,255';
function assertOwned(f){for(const e of f.viewer.entities.values)if(e.ngEvent)assert.equal(e.ngEvent.serial,f.G.navSerial,'old entities cannot survive navigation')}
function assertEmpty(f,old){
  assert.equal(f.viewer.entities.values.length,0);assert.equal(f.timers.size,0);
  assert.equal(f.scene.preUpdate.numberOfListeners,1,'only the unchanged camera listener remains');
  if(old){assert.equal(old.entities.size,0);assert.equal(old.resources.size,0)}
}

for(const sample of cases)test(sample.title,async()=>{
  const f=fixture(),source=JSON.stringify(f.G.news);let done=false,outcome,sawPair=false,sawBlue=false,sawEffect=false,lastProgress=-1;
  const result=f.G.focus(sample.id-1).then(v=>{done=true;outcome=v});const scope=f.manager.scope;
  await f.until(()=>{
    assertOwned(f);
    const visibleCountries=new Set();
    for(const e of f.viewer.entities.values){
      if(e.ngEvent?.kind==='country'){
        visibleCountries.add(e.ngEvent.country);const expected=e.ngEvent.country===sample.primaryCountry?RED:BLUE;
        assert.equal(css(e.polygon?e.polygon.material.color:e.polyline.material.color),expected,'role colors must not flip with attacker/victim');
      }
      if(e.point&&css(e.point.color)===BLUE){sawBlue=true;assert.ok(e.point.pixelSize.getValue(time)<=6)}
      if(e.ngEvent?.kind?.startsWith('border-')||e.ngEvent?.kind==='local-border'){
        sawEffect=true;const positions=e.polyline?e.polyline.positions.getValue(time):[e.position.getValue(time)];
        for(const p of positions){const c=C.Cartographic.fromCartesian(p),q={lon:C.Math.toDegrees(c.longitude),lat:C.Math.toDegrees(c.latitude)};assert.ok(f.geo.greatCircle(scope.event.borderCenter,q).distance<=scope.event.borderRadius+.1,'conflict effect stays inside the actual local radius')}
      }
    }
    if(visibleCountries.has(sample.primaryCountry)&&visibleCountries.has(sample.secondaryCountry))sawPair=true;
    const flight=f.manager.flight;
    if(flight){sawEffect=true;assert.ok(flight.data.progress>=lastProgress);lastProgress=flight.data.progress;assert.equal(flight.kind,sample.type==='drone_attack'?'drone':'missile')}
    if(['domestic','interstate'].includes(sample.type))assert.equal(flight,null,'ordinary events must not gain weapons or persistent routes');
    return done;
  });
  await result;assert.equal(outcome,true);assert.equal(f.manager.state,'DISPLAYING_STORY');
  if(sample.secondaryCountry){assert.ok(sawPair,'both countries must be highlighted together');assert.ok(sawBlue,'secondary country needs a small blue marker')}
  if(sample.type.endsWith('_attack')||sample.type==='border_conflict')assert.ok(sawEffect);
  if(sample.type.endsWith('_attack'))assert.equal(lastProgress,1,'attack reaches its target exactly once');
  assert.equal(JSON.stringify(f.G.news),source,'normalization may not mutate news');
  f.G.overview();await f.tick(10000);assertEmpty(f,scope);
});

test('short spherical routes handle date line, high latitudes, continents and antipodes',()=>{
  const f=fixture();
  for(const [a,b] of [[{lon:179.8,lat:66},{lon:-166,lat:66}],[{lon:-166,lat:66},{lon:179.8,lat:66}],[{lon:-122.4,lat:37.8},{lon:51.73,lat:33.72}],[{lon:0,lat:90},{lon:120,lat:-90}],[{lon:0,lat:0},{lon:180,lat:0}],[{lon:10,lat:10},{lon:10,lat:10}]]){
    const route=f.geo.route(a,b),distance=f.geo.greatCircle(a,b).distance;let traveled=0,previous=a;
    for(let i=0;i<=route.steps;i++){
      const p=route.positions[i],c=C.Cartographic.fromCartesian(p),q={lon:C.Math.toDegrees(c.longitude),lat:C.Math.toDegrees(c.latitude)};
      assert.ok(Number.isFinite(c.height)&&c.height>29990);traveled+=f.geo.greatCircle(previous,q).distance;previous=q;
    }
    assert.ok(Math.abs(traveled-distance)<.1,'trajectory must use the shortest sphere arc, not linear longitude/latitude');
    assert.ok(C.Cartesian3.distance(route.at(0),C.Cartesian3.fromDegrees(a.lon,a.lat,30000))<.001);
    assert.ok(C.Cartesian3.distance(route.at(1),C.Cartesian3.fromDegrees(b.lon,b.lat,30000))<.001);
    if(Math.abs(a.lon-b.lon)>340)assert.ok(route.arc.angle<C.Math.toRadians(10));
  }
});

test('missile and drone retain distinct artwork, duration, altitude, trail and motion',async()=>{
  const f=fixture(),a={lon:179.8,lat:66},b={lon:-166,lat:66};
  const m=f.geo.route(a,b,'missile'),d=f.geo.route(a,b,'drone');assert.ok(d.duration>m.duration*1.7);assert.ok(m.peak>d.peak);
  assert.notEqual(f.G.eventEffectAssets.missile,f.G.eventEffectAssets.drone);
  for(const [index,kind,material] of [[4,'missile','PolylineGlow'],[6,'drone','PolylineDash']]){
    const pending=f.G.focus(index);await f.until(()=>!!f.manager.flight);
    const flight=f.manager.flight;await f.tick(flight.duration*.5);
    assert.ok(Math.abs(flight.data.progress-(kind==='missile'?.3625:.5))<.02);
    const trail=f.viewer.entities.values.find(e=>e.ngEvent?.kind==='trajectory');assert.equal(trail.polyline.material.getType(time),material);
    f.G.overview();await f.tick();await pending;assertEmpty(f);
  }
});

test('rapid switching cancels particles, trajectories, timers, RAF and late continuations',async()=>{
  const f=fixture(),pending=[];let oldCallbackRuns=0;
  for(const index of [3,5,7,4,6,8]){
    pending.push(f.G.focus(index));await f.until(()=>f.manager.state==='PLAYING_EFFECT');
    const old=f.manager.scope;old.timeout(()=>oldCallbackRuns++,1);old.raf(()=>oldCallbackRuns++);
    pending.push(f.G.focus(0));assert.equal(old.disposed,true);assert.equal(old.resources.size,0);assert.equal(old.entities.size,0);
    await f.tick();assertOwned(f);
  }
  for(let i=0;i<40;i++){pending.push(f.G.navigate(i%9));await f.tick(12);assertOwned(f)}
  let lastDone=false;pending.push(f.G.focus(2).then(x=>{lastDone=true;return x}));await f.until(()=>lastDone);
  await Promise.all(pending);assert.equal(oldCallbackRuns,0);assert.equal(f.manager.snapshot().event.id,3);
  f.G.overview();await f.tick(30000);assertEmpty(f);
});

test('current prev/next navigation arc survives initial cleanup, previous arc is removed',async()=>{
  const f=fixture(),a=f.G.focus(0);await f.tick();const b=f.G.navigate(1),arc=f.G.transientArc;
  assert.ok(arc&&f.viewer.entities.contains(arc));const c=f.G.navigate(2);assert.equal(f.viewer.entities.contains(arc),false);assert.ok(f.G.transientArc);
  f.G.overview();await f.tick();await Promise.all([a,b,c]);assertEmpty(f);
});

test('late legacy attack entry and stale sequence cannot restart the current effect',async()=>{
  const f=fixture(),oldNews=f.G.news[3],first=f.G.focus(3);await f.until(()=>!!f.manager.flight);
  const oldSerial=f.G.navSerial,second=f.G.focus(5);await f.until(()=>!!f.manager.flight);
  const flight=f.manager.flight;
  assert.equal(await f.G.v29ShowMissile(oldNews,{navSerial:oldSerial}),false);
  assert.equal(await f.G.runSequence(oldNews,'IRN',oldSerial),false);
  assert.equal(f.manager.flight,flight);assertOwned(f);
  f.G.overview();await f.tick();await Promise.all([first,second]);assertEmpty(f);
});

test('clearing one effect cannot let its continuation delete its replacement',async()=>{
  const f=fixture(),sequence=f.G.focus(5);await f.until(()=>!!f.manager.flight);
  f.G.clearInteractionEffects();
  const replacement=f.G.v29ShowDrone(f.G.news[5],{navSerial:f.G.navSerial}),flight=f.manager.flight;
  await f.tick(100);assert.equal(f.manager.flight,flight);assert.ok(flight.data.progress>0);
  assert.equal(f.viewer.entities.values.filter(e=>e.ngEvent?.kind==='target-label').length,1);
  f.G.overview();await f.tick();await Promise.all([sequence,replacement]);assertEmpty(f);
});

test('potential attacks remain illustrative and never create impacts or aircraft',async()=>{
  const f=fixture();f.G.news[3]={...f.G.news[3],sceneMode:'POTENTIAL_ATTACK'};
  const pending=f.G.focus(3);await f.until(()=>f.manager.state==='POTENTIAL_EFFECT');
  const kinds=f.viewer.entities.values.map(e=>e.ngEvent?.kind);assert.ok(kinds.includes('potential-trajectory'));assert.ok(!kinds.some(k=>['impact','impact-ring','missile','drone'].includes(k)));
  f.G.overview();await f.tick();await pending;assertEmpty(f);
});

test('canonical roles, missing locations and special V52 scenes normalize compatibly',()=>{
  const f=fixture();
  const canonical={id:'new',type:'missile_attack',primaryCountry:'USA',secondaryCountry:'IRN',origin:{lon:50,lat:25},target:{lon:51,lat:33}};
  const n=f.model.normalize(canonical);assert.equal(n.origin.country,'USA');assert.equal(n.target.country,'IRN');
  assert.equal(f.geo.point([null,0]),null);assert.equal(f.geo.point(['',0]),null);assert.equal(f.geo.route({lon:181,lat:0},{lon:0,lat:0}),null);
  const unknown=f.model.normalize({type:'drone_attack',primaryCountry:'XXX',secondaryCountry:'IRN',target:{lon:51,lat:33}});assert.equal(unknown.origin,null,'do not invent a launch site when geometry and coordinates are absent');
  for(const mode of ['CARRIER_PORT','ORGANIZATION','DIPLOMACY_MULTI']){const raw={sceneMode:mode,scenePlan:{participants:['USA','IRN','RUS']}};const e=f.model.normalize(raw);assert.equal(e.managed,false);assert.equal(f.model.adapt(e),raw)}
  const raw={type:'interstate',sceneMode:'ATTACK',countryIso3:'USA',secondaryCountryIso3:'IRN',lon:1,lat:1};assert.equal(f.model.adapt(f.model.normalize(raw)).sceneMode,'POINT');
});

test('the current 13 V52 records retain data and special-scene dispatch',async()=>{
  const f=fixture();
  for(const file of ['news-globe-data-20260907-v47.js','news-globe-v14-v48-data-fix.js','news-globe-v14-v50-data-fix.js','news-globe-v14-v51-data-fix.js'])f.load(file);
  assert.equal(f.G.news.length,13);const original=JSON.stringify(f.G.news);
  assert.deepEqual(Array.from(f.G.news.slice(0,3),n=>f.model.normalize(n).type),['missile_attack','missile_attack','drone_attack']);
  for(let i=0;i<13;i++){
    const n=f.G.news[i],normalized=f.model.normalize(n);let done=false;
    if(['CARRIER_PORT','ORGANIZATION','DIPLOMACY_MULTI'].includes(n.sceneMode)){assert.equal(normalized.managed,false);assert.equal(f.model.adapt(normalized),n)}
    const pending=f.G.focus(i).then(()=>{done=true});await f.until(()=>done);await pending;assertOwned(f);
  }
  assert.equal(JSON.stringify(f.G.news),original);
  f.G.overview();await f.tick(30000);assertEmpty(f);
});

test('final stability: full event chain, previous/next, rapid input and viewport changes share one session',async()=>{
  const f=fixture(),original=JSON.stringify(f.G.news),completed=[];
  const check=()=>{
    assertOwned(f);
    assert.equal(new Set(f.viewer.entities.values.map(e=>e.id)).size,f.viewer.entities.values.length);
    assert.equal(f.scene.postUpdate.numberOfListeners,1,'camera postUpdate must not accumulate');
    for(const type of ['resize','orientationchange','pageshow'])assert.equal(getEventListeners(f.events,type).length,1);
  };
  async function finish(index,navigate=false){
    let done=false;
    const result=(navigate?f.G.navigate(index):f.G.focus(index)).then(value=>{done=true;return value});
    await f.until(()=>{check();return done});assert.equal(await result,true);
    assert.equal(f.G.current,index);assert.equal(f.manager.state,'DISPLAYING_STORY');
    assert.equal(f.timers.size,0,'a settled story must not retain timers or RAF');
    assert.equal(f.scene.preUpdate.numberOfListeners,1,'no previous animation frame listener remains');
    completed.push(f.manager.snapshot().event.type);
  }
  // One viewer traverses every required kind, then returns to ordinary news.
  for(const i of [0,1,2,3,4,5,6,7,8,0])await finish(i);
  assert.deepEqual(completed,['domestic','interstate','interstate','missile_attack','missile_attack','drone_attack','drone_attack','border_conflict','border_conflict','domestic']);
  await finish(8,true);await finish(0,true);
  const pending=[],oldScopes=[];let staleCallbacks=0;
  for(let i=0;i<80;i++){
    const previous=f.manager.scope;
    previous.timeout(()=>staleCallbacks++,10000);previous.raf(()=>staleCallbacks++);oldScopes.push(previous);
    pending.push(f.G.navigate(i%2?(f.G.current+1)%9:(f.G.current+8)%9));
    await f.tick(12);check();
  }
  const selected=f.G.current;
  for(const [width,height,dpr,event] of [[320,180,3,'resize'],[740,416.25,2,'orientationchange'],[360,202.5,3,'orientationchange'],[360,202.5,3,'resize'],[1280,720,1,'resize']]){
    f.canvas.clientWidth=width;f.canvas.clientHeight=height;f.root.devicePixelRatio=dpr;
    f.root.innerHeight=event==='resize'?600:900;f.events.dispatchEvent(new Event(event));
    await f.tick(40);check();assert.equal(f.G.current,selected);
    assert.equal(f.camera.frustum.aspectRatio,width/height);
    const volume=f.camera.frustum.computeCullingVolume(f.camera.positionWC,f.camera.directionWC,f.camera.upWC);
    assert.equal(volume.computeVisibility(new C.BoundingSphere(C.Cartesian3.ZERO,f.G.cameraController.radius)),C.Intersect.INSIDE);
  }
  await f.until(()=>f.manager.scope.finished);const results=await Promise.allSettled(pending);
  assert.ok(results.every(r=>r.status==='fulfilled'),'no rejected navigation promises');
  assert.equal(staleCallbacks,0);
  for(const old of oldScopes){assert.equal(old.disposed,true);assert.equal(old.entities.size,0);assert.equal(old.resources.size,0)}
  f.G.overview();await f.tick(60000);assertEmpty(f);
  assert.equal(f.manager.state,'IDLE');assert.equal(f.manager.flight,null);assert.equal(JSON.stringify(f.G.news),original);
  f.G.cameraController.destroy();assert.equal(f.scene.preUpdate.numberOfListeners,0);assert.equal(f.scene.postUpdate.numberOfListeners,0);
  for(const type of ['resize','orientationchange','pageshow'])assert.equal(getEventListeners(f.events,type).length,0);
});
