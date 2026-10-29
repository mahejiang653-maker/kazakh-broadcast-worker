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
test('detail flights move from the approach to the verified site in order',async()=>{
  const flights=[],stages=[];
  const camera={flyTo(o){flights.push(o);o.complete();}};
  const Cesium={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n*Math.PI/180}};
  const G=setup({viewer:{camera,scene:{canvas:{clientWidth:390,clientHeight:219},requestRender(){}}},
    v52Director:{stage:p=>stages.push(p),checkpoint:async()=>true},wait:async()=>true});
  G.v52EventDetail.setCesiumForTest?.(Cesium);
  const n=G.v52EventDetail.normalizeStory(story());
  assert.equal(await G.v52EventDetail.run(n,1,Cesium),true);
  assert.deepEqual(stages,['approach','site']);assert.equal(flights.length,2);
  assert.ok(flights[0].destination.height>flights[1].destination.height);
  assert.equal(flights[1].destination.lon,verified.lon);
});
test('a cancelled site flight restores annotations and relinquishes an old attack camera',async()=>{
  const marker={show:true};let flights=0,attackReleased=0;
  const C={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({markers:[marker],v52Attack:{clear(){attackReleased++;}},
    viewer:{camera:{flyTo(o){if(++flights===1)o.complete();else o.cancel();}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n=story();G.v52EventDetail.prepare(n,1);
  assert.equal(await G.v52EventDetail.run(n,1,C),false);
  assert.equal(attackReleased,1);assert.equal(marker.show,true);
});
test('a stale cancelled site flight cannot restore annotations belonging to a replacement run',async()=>{
  const marker={show:true},pending=[];
  const C={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({markers:[marker],viewer:{camera:{flyTo(o){pending.push(o);}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:async()=>true});
  const n=story();G.v52EventDetail.prepare(n,1);const old=G.v52EventDetail.run(n,1,C);
  await new Promise(setImmediate);pending.shift().complete();await new Promise(setImmediate);
  assert.equal(marker.show,false);const oldSite=pending.shift();
  G.v52EventDetail.cancel();G.navSerial=2;G.v52EventDetail.prepare(n,2);const next=G.v52EventDetail.run(n,2,C);
  await new Promise(setImmediate);pending.shift().complete();await new Promise(setImmediate);
  assert.equal(marker.show,false);const newSite=pending.shift();
  oldSite.cancel();assert.equal(await old,false);assert.equal(marker.show,false);
  newSite.complete();assert.equal(await next,true);G.v52EventDetail.cancel();assert.equal(marker.show,true);
});
test('mobile viewer caps render density and tile cache while desktop retains its settings',async()=>{
  const viewer={resolutionScale:2.2,scene:{msaaSamples:4,globe:{maximumScreenSpaceError:.75,tileCacheSize:200},requestRender(){}}};
  const G=setup({viewer,initViewer:async()=>true});
  await G.initViewer();
  assert.ok(viewer.resolutionScale<=1.4);assert.ok(viewer.scene.msaaSamples<=2);
  assert.ok(viewer.scene.globe.maximumScreenSpaceError>=1);
  assert.ok(viewer.scene.globe.tileCacheSize<=100);
});
test('a verified image that loads during the site hold appears without extending playback',async()=>{
  let image,finishHold;const layers=[];
  class FakeImage{constructor(){image=this;this.naturalWidth=1200;this.naturalHeight=800;}set src(value){this.url=value;}}
  const node=()=>({style:{},children:[],classList:{items:new Set(),add(v){this.items.add(v);},remove(v){this.items.delete(v);},toggle(){}},
    append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);layers.push(x);},remove(){}});
  const frame=node(),head=node(),body=node();
  const document={body,head,querySelector:()=>frame,querySelectorAll:()=>[],getElementById:()=>null,
    createElement:()=>node(),createTextNode:text=>({textContent:text})};
  const Cesium={Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Math:{toRadians:n=>n}};
  const G=setup({viewer:{camera:{flyTo(o){o.complete();}},scene:{requestRender(){}}},
    v52Director:{stage(){},checkpoint:async()=>true},wait:()=>new Promise(r=>{finishHold=r;})},
    {document,Image:FakeImage,requestAnimationFrame:fn=>fn()});
  const n={...story(),detailImage:{url:'https://example.org/a.jpg',source:'Photographer',sourceUrl:'https://example.org/a',
    date:'2025-02-14',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',kind:'historical',verified:true,locationMatch:true}};
  G.v52EventDetail.prepare(n,1);const done=G.v52EventDetail.run(n,1,Cesium);
  await new Promise(setImmediate);
  assert.ok(finishHold,'site hold starts without waiting for the image');image.onload();
  assert.ok(frame.children.some(x=>x.classList.items.has('visible')),'late image appears during the existing hold');
  assert.equal(frame.children[0].children[0],image,'display reuses the preloaded image');
  finishHold(true);assert.equal(await done,true);
});
