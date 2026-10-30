import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const path = new URL('../public/news-globe-v52-event-detail.js', import.meta.url);
function setup(extra = {}, globals = {}) {
  const G={navSerial:1,current:0,overviewMode:false,...extra};
  const window={NG14:G,innerWidth:390,devicePixelRatio:3};
  if(fs.existsSync(path)) vm.runInNewContext(fs.readFileSync(path,'utf8'),{window,URL,Date,Number,Math,Promise,console,setTimeout,clearTimeout,...globals});
  return G;
}
const verified={lon:-89.2811,lat:42.075,verified:true,sourceUrl:'https://www.nrc.gov/example'};
const story=(precision='site')=>({title:'地点测试',location:'Byron',lon:-89.25,lat:42.08,locationPrecision:precision,eventLocation:{...verified}});

test('mobile closeups retain the established map and label rendering quality',async()=>{
  const viewer={resolutionScale:2.2,scene:{msaaSamples:4,globe:{maximumScreenSpaceError:.75,tileCacheSize:100},requestRender(){}}};
  const G=setup({viewer,initViewer:async()=>true});
  await G.initViewer();
  assert.equal(viewer.resolutionScale,2.2);
  assert.equal(viewer.scene.globe.maximumScreenSpaceError,.75);
  assert.equal(viewer.scene.msaaSamples,4);
});

test('the facility descent is one continuous camera flight rather than two stop-start flights',async()=>{
  const calls=[],C={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({viewer:{camera:{flyTo(o){calls.push(o);o.complete();}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.prepare(story(),1);
  assert.equal(await G.v52EventDetail.run(story(),1,C),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].destination.lon,verified.lon);
  assert.equal(calls[0].destination.height,4000);
});

test('a story with a verified historical image never downloads or overlays a photo',async()=>{
  let imageRequests=0;class TrackingImage{constructor(){imageRequests++;}}
  const C={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({viewer:{camera:{flyTo(o){o.complete();}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true},{Image:TrackingImage});
  const n={...story(),detailImage:{url:'https://example.org/a.jpg',source:'Photographer',sourceUrl:'https://example.org/a',
    date:'2025-02-14',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',kind:'historical',verified:true,locationMatch:true}};
  G.v52EventDetail.prepare(n,1);
  assert.equal(imageRequests,0);
  assert.equal(await G.v52EventDetail.run(n,1,C),true);
});

test('yellow map text becomes white while non-yellow labels and red markers keep their colors',async()=>{
  const listeners=[],white={red:1,green:1,blue:1,alpha:1,withAlpha(alpha){return {...this,alpha};}};
  const entities={values:[],collectionChanged:{addEventListener(fn){listeners.push(fn);return ()=>{};}},
    add(e){this.values.push(e);for(const fn of listeners)fn(this,[e],[],[]);return e;}};
  const viewer={resolutionScale:2.2,clock:{currentTime:0},entities,
    scene:{msaaSamples:4,globe:{maximumScreenSpaceError:.75,tileCacheSize:100},requestRender(){}}};
  const G={navSerial:1,current:0,overviewMode:false,viewer,initViewer:async()=>true};
  const window={NG14:G,innerWidth:390,devicePixelRatio:3,Cesium:{Color:{WHITE:white}}};
  vm.runInNewContext(fs.readFileSync(path,'utf8'),{window,URL,Date,Number,Math,Promise,console,setTimeout,clearTimeout});
  await G.initViewer();
  const warm={red:1,green:.953,blue:.824,alpha:1},blue={red:.65,green:.8,blue:1,alpha:1};
  const country=entities.add({label:{fillColor:warm},point:{color:'red'}});
  const other=entities.add({label:{fillColor:blue}});
  assert.equal(country.label.fillColor.red,1);assert.equal(country.label.fillColor.green,1);assert.equal(country.label.fillColor.blue,1);
  assert.equal(country.point.color,'red');assert.equal(other.label.fillColor,blue);
});

test('the incident marker fades during the descent and is restored if the flight is cancelled',async()=>{
  const callbacks=[];let flight;
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,position:{getValue:()=>({height:30000})},point:{color:original}};
  const pulse={show:true,ellipse:{material:{color:original},outlineColor:original}};
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartographic:{fromCartesian:position=>position},Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:170000},flyTo(o){flight=o;}};
  const scene={requestRender(){},preRender:{addEventListener(fn){callbacks.push(fn);return ()=>callbacks.splice(callbacks.indexOf(fn),1);}}};
  const G=setup({markers:[marker],pulses:[pulse],viewer:{camera,scene,clock:{currentTime:0}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.prepare(story(),1);const done=G.v52EventDetail.run(story(),1,C);
  await new Promise(setImmediate);
  assert.equal(typeof marker.point.color.getValue,'function','the marker has a gradual opacity');
  camera.positionCartographic.height=55000;
  const mid=marker.point.color.getValue(0).alpha;assert.ok(mid>0&&mid<1);assert.equal(marker.show,true);
  assert.ok(pulse.ellipse.material.color.getValue(0).alpha>0&&pulse.ellipse.material.color.getValue(0).alpha<1);
  assert.ok(pulse.ellipse.outlineColor.getValue(0).alpha>0&&pulse.ellipse.outlineColor.getValue(0).alpha<1);
  // Fade to zero before the camera crosses the 30 km marker elevation.
  camera.positionCartographic.height=35000;callbacks[0]();assert.equal(marker.show,false);
  flight.cancel();assert.equal(await done,false);assert.equal(marker.show,true);assert.equal(marker.point.color,original);
  assert.equal(pulse.ellipse.material.color,original);assert.equal(pulse.ellipse.outlineColor,original);
});

test('a wider region preset fades annotations gradually when the camera must move upwards',async()=>{
  const callbacks=[];let flight;
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,point:{color:original}};
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:170000},flyTo(o){flight=o;}};
  const scene={requestRender(){},preRender:{addEventListener(fn){callbacks.push(fn);return ()=>{};}}};
  const G=setup({markers:[marker],viewer:{camera,scene},v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n={...story('region'),cameraPreset:{siteHeight:300000}};
  G.v52EventDetail.prepare(n,1);const done=G.v52EventDetail.run(n,1,C);await new Promise(setImmediate);
  assert.equal(marker.point.color.getValue(0).alpha,1,'the wider shot must start with annotations visible');
  camera.positionCartographic.height=235000;
  const middle=marker.point.color.getValue(0).alpha;assert.ok(middle>0&&middle<1);
  camera.positionCartographic.height=300000;callbacks[0]();assert.equal(marker.show,false);
  flight.cancel();assert.equal(await done,false);assert.equal(marker.show,true);
});

test('a small regional descent fades annotations gradually instead of dropping them at one altitude',async()=>{
  const callbacks=[];let flight;
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,point:{color:original}};
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:170000},flyTo(o){flight=o;}};
  const scene={requestRender(){},preRender:{addEventListener(fn){callbacks.push(fn);return ()=>{};}}};
  const G=setup({markers:[marker],viewer:{camera,scene},v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n={...story('region'),cameraPreset:{siteHeight:160000}};
  G.v52EventDetail.prepare(n,1);const done=G.v52EventDetail.run(n,1,C);await new Promise(setImmediate);
  assert.equal(marker.point.color.getValue(0).alpha,1);
  camera.positionCartographic.height=165000;
  const middle=marker.point.color.getValue(0).alpha;assert.ok(middle>.2&&middle<.8,'opacity should reflect the gradual movement');
  camera.positionCartographic.height=160000;callbacks[0]();assert.equal(marker.show,false);
  flight.cancel();assert.equal(await done,false);assert.equal(marker.show,true);
});

test('high annotations fade before the camera crosses their elevation',async()=>{
  const callbacks=[];let flight;
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,position:{getValue:()=>({height:90000})},label:{fillColor:original}};
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartographic:{fromCartesian:position=>position},Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:100000},flyTo(o){flight=o;}};
  const scene={requestRender(){},preRender:{addEventListener(fn){callbacks.push(fn);return ()=>{};}}};
  const G=setup({markers:[marker],viewer:{camera,scene},v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.prepare(story(),1);const done=G.v52EventDetail.run(story(),1,C);await new Promise(setImmediate);
  camera.positionCartographic.height=97000;
  const middle=marker.label.fillColor.getValue(0).alpha;assert.ok(middle>0&&middle<1);
  camera.positionCartographic.height=95000;callbacks[0]();assert.equal(marker.show,false);
  flight.cancel();assert.equal(await done,false);assert.equal(marker.show,true);
});

test('annotations close to camera height fade before they pass behind the camera',async()=>{
  const callbacks=[];let flight;
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,position:{getValue:()=>({height:99000})},label:{fillColor:original}};
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartographic:{fromCartesian:position=>position},Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:100000},flyTo(o){flight=o;}};
  const scene={requestRender(){},preRender:{addEventListener(fn){callbacks.push(fn);return ()=>{};}}};
  const G=setup({markers:[marker],viewer:{camera,scene},v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.prepare(story(),1);const done=G.v52EventDetail.run(story(),1,C);await new Promise(setImmediate);
  camera.positionCartographic.height=99750;
  const middle=marker.label.fillColor.getValue(0).alpha;assert.ok(middle>0&&middle<1);
  camera.positionCartographic.height=99500;callbacks[0]();assert.equal(marker.show,false);
  flight.cancel();assert.equal(await done,false);assert.equal(marker.show,true);
});

test('a camera already at the regional target keeps annotations instead of hiding them instantly',async()=>{
  const original={alpha:1,withAlpha(alpha){return {alpha,withAlpha:this.withAlpha};}};
  const marker={show:true,point:{color:original}},stages=[];
  const C={Color:{WHITE:original},CallbackProperty:class {constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:170000},flyTo(o){o.complete();}};
  const scene={requestRender(){},preRender:{addEventListener(){return ()=>{};}}};
  const G=setup({markers:[marker],viewer:{camera,scene},v52Director:{stage(name){stages.push(name);},checkpoint:async()=>true},wait:async()=>true});
  const n={...story('region'),cameraPreset:{siteHeight:170000}};
  G.v52EventDetail.prepare(n,1);assert.equal(await G.v52EventDetail.run(n,1,C),true);
  assert.equal(marker.show,true);assert.equal(marker.point.color,original);assert.ok(stages.includes('site'));
});

test('verified facility coordinates replace a legacy city marker',()=>{
  const d=setup().v52EventDetail;assert.ok(d,'detail module is installed');
  const n=d.normalizeStory(story());
  assert.equal(n.lon,-89.2811);assert.equal(n.lat,42.075);assert.equal(n.locationPrecision,'site');
});
test('verified event coordinates also replace stale attack-target aliases',()=>{
  const d=setup().v52EventDetail;
  const n=d.normalizeStory({...story(),sceneMode:'ATTACK',targetLon:-89.2,targetLat:42.1,
    target:{lon:-89.2,lat:42.1},scenePlan:{attackEffect:{target:{lon:-89.2,lat:42.1}}}});
  assert.equal(n.targetLon,verified.lon);assert.equal(n.targetLat,verified.lat);
  assert.equal(n.target.lon,verified.lon);assert.equal(n.scenePlan.attackEffect.target.lat,verified.lat);
});
test('attackType triggers verified target normalization even when sceneMode is POINT',()=>{
  const d=setup().v52EventDetail;
  const n=d.normalizeStory({...story(),sceneMode:'POINT',attackType:'missile',targetLon:-89.2,targetLat:42.1});
  assert.equal(n.targetLon,verified.lon);assert.equal(n.targetLat,verified.lat);
});
test('an enabled facility closeup suppresses synthetic attack and impact effects without changing the news',()=>{
  const G=setup();
  vm.runInNewContext(fs.readFileSync(new URL('../public/news-globe-v52-attack-model.js',import.meta.url),'utf8'),{window:{NG14:G}});
  const n={...story(),sceneMode:'MISSILE_ATTACK',attackType:'missile',scenePlan:{primaryIso3:'USA',attackEffect:{enabled:true,impact:{enabled:true}}}};
  const view=G.v52EventDetail.storyForMap(n),resolved=G.v52AttackModel.resolve(view);
  assert.equal(resolved.enabled,false);assert.equal(resolved.impactEnabled,false);
  assert.equal(n.scenePlan.attackEffect.enabled,true);
  assert.equal(G.v52EventDetail.storyForMap({...n,detailEnabled:false}).scenePlan.attackEffect.enabled,true);
});
test('unverified and invalid facility coordinates cannot replace a known city',()=>{
  const d=setup().v52EventDetail;assert.ok(d);
  for(const eventLocation of [{...verified,verified:false},{...verified,sourceUrl:''},{...verified,lat:91},{...verified,lon:null},
    {...verified,lon:false},{...verified,lat:true},{...verified,lon:'   '},{...verified,lat:[]},{...verified,lon:{}}]){
    const n=d.normalizeStory({...story(),eventLocation});
    assert.equal(n.lon,-89.25);assert.equal(n.lat,42.08);
    assert.equal(d.cameraPlan(n),null);
  }
});
test('city and region have safe higher views and country-only never creates a closeup',()=>{
  const d=setup().v52EventDetail;assert.ok(d);
  const exact=d.cameraPlan(d.normalizeStory(story('exact')));
  const city=d.cameraPlan(d.normalizeStory(story('city')));
  const region=d.cameraPlan(d.normalizeStory(story('region')));
  assert.ok(exact.siteHeight<city.siteHeight);assert.ok(city.siteHeight<region.siteHeight);
  assert.equal(d.cameraPlan({...story(),noPoint:true,sceneMode:'COUNTRY'}),null);
  assert.equal(d.cameraPlan({...story(),detailEnabled:false}),null);
});
test('bounds adjust framing only when finite, local and containing the verified location',()=>{
  const d=setup().v52EventDetail;assert.ok(d);
  const n=d.normalizeStory(story());const base=d.cameraPlan(n);
  const bounded=d.cameraPlan({...n,targetBounds:[-89.30,42.06,-89.26,42.09]});
  assert.ok(bounded.siteHeight>base.siteHeight);
  for(const b of [[-170,-80,170,80],[-80,40,-79,41],[0,0,Infinity,1]])
    assert.equal(d.cameraPlan({...n,targetBounds:b}).siteHeight,base.siteHeight);
});
test('off-center facility bounds keep the far edge in view without moving the incident off-center',()=>{
  const d=setup().v52EventDetail,n=d.normalizeStory(story());
  const centered=d.cameraPlan({...n,targetBounds:[n.lon-.0205,n.lat-.001,n.lon+.0205,n.lat+.001]});
  const edge=d.cameraPlan({...n,targetBounds:[n.lon-.001,n.lat-.001,n.lon+.040,n.lat+.001]});
  assert.ok(edge.siteHeight>centered.siteHeight*1.4);
  assert.equal(edge.lon,n.lon);assert.equal(edge.lat,n.lat);
});
test('an image needs explicit source, date, license and verified location match',()=>{
  const d=setup().v52EventDetail;assert.ok(d);
  const image={url:'https://example.org/a.jpg',source:'Example photographer',sourceUrl:'https://example.org/source',date:'2025-02-14',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',kind:'historical',verified:true,locationMatch:true};
  const n=d.normalizeStory({...story(),detailImage:image});
  assert.equal(d.imageSpec(n).kind,'historical');
  for(const change of [{verified:false},{locationMatch:false},{license:''},{licenseUrl:''},{date:''},{url:'javascript:alert(1)'},{sourceUrl:''},{kind:'live'}])
    assert.equal(d.imageSpec({...n,detailImage:{...image,...change}}),null);
});
test('the uninterrupted descent retains the configured travel time and ends at the verified site',async()=>{
  const flights=[],stages=[];
  const camera={flyTo(o){flights.push(o);o.complete();}};
  const Cesium={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n*Math.PI/180}};
  const G=setup({viewer:{camera,scene:{canvas:{clientWidth:390,clientHeight:219},requestRender(){}}},
    v52Director:{stage:p=>stages.push(p),checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.setCesiumForTest?.(Cesium);
  const n=G.v52EventDetail.normalizeStory(story());
  assert.equal(await G.v52EventDetail.run(n,1,Cesium),true);
  assert.deepEqual(stages,['approach','site']);assert.equal(flights.length,1);
  assert.equal(flights[0].duration,6);
  assert.equal(flights[0].destination.lon,verified.lon);
});
test('a cancelled site flight restores annotations and relinquishes an old attack camera',async()=>{
  const marker={show:true};let attackReleased=0;
  const C={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({markers:[marker],v52Attack:{clear(){attackReleased++;}},
    viewer:{camera:{flyTo(o){o.cancel();}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n=story();G.v52EventDetail.prepare(n,1);
  assert.equal(await G.v52EventDetail.run(n,1,C),false);
  assert.equal(attackReleased,1);assert.equal(marker.show,true);
});
test('a stale cancelled site flight cannot restore annotations belonging to a replacement run',async()=>{
  const color={alpha:1,withAlpha(alpha){return {...this,alpha};}},marker={show:true,point:{color}},pending=[],listeners=new Set();
  const C={Color:{WHITE:color},CallbackProperty:class{constructor(fn){this.fn=fn;}getValue(t){return this.fn(t);}},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const camera={positionCartographic:{height:170000},flyTo(o){pending.push(o);}};
  const scene={requestRender(){},preRender:{addEventListener(fn){listeners.add(fn);return()=>listeners.delete(fn);}}};
  const G=setup({markers:[marker],viewer:{camera,scene,clock:{currentTime:0}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n=story();G.v52EventDetail.prepare(n,1);const old=G.v52EventDetail.run(n,1,C);
  await new Promise(setImmediate);const oldSite=pending.shift();camera.positionCartographic.height=8000;
  for(const fn of [...listeners])fn();assert.equal(marker.show,false);
  G.v52EventDetail.cancel();G.navSerial=2;G.v52EventDetail.prepare(n,2);const next=G.v52EventDetail.run(n,2,C);
  camera.positionCartographic.height=170000;await new Promise(setImmediate);const newSite=pending.shift();
  camera.positionCartographic.height=8000;for(const fn of [...listeners])fn();assert.equal(marker.show,false);
  oldSite.cancel();assert.equal(await old,false);assert.equal(marker.show,false);
  newSite.complete();assert.equal(await next,true);G.v52EventDetail.cancel();assert.equal(marker.show,true);
});
test('mobile tile cache is bounded without lowering the original rendering quality',async()=>{
  const viewer={resolutionScale:2.2,scene:{msaaSamples:4,globe:{maximumScreenSpaceError:.75,tileCacheSize:200},requestRender(){}}};
  const G=setup({viewer,initViewer:async()=>true});
  await G.initViewer();
  assert.equal(viewer.resolutionScale,2.2);assert.equal(viewer.scene.msaaSamples,4);
  assert.equal(viewer.scene.globe.maximumScreenSpaceError,.75);
  assert.ok(viewer.scene.globe.tileCacheSize<=100);
});
