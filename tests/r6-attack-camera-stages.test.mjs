import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const engine = fs.readFileSync(new URL('../public/news-globe-v14-v51-scene-engine.js', import.meta.url), 'utf8');
const between = (start, end) => {
  const a = engine.indexOf(start);
  const b = engine.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'scene-engine stage markers must exist in order');
  return engine.slice(a, b);
};

test('attack renders country overview before approaching the impact location', () => {
  const body = between('async function renderAttack(', 'const attackFocus=G.focus;');
  const overview = body.indexOf("ctx.stage='country-overview'");
  const approach = body.indexOf("ctx.stage='target-approach'");
  const impact = body.indexOf('showImpacts(ctx)');
  assert.ok(overview >= 0 && approach > overview && impact > approach);
  assert.match(body, /await flyFit\(overviewPoints,s,/);
  assert.match(body, /await wait\(1550,s\)/);
  assert.match(body, /await fitAttack\(ctx,1\.75\)/);
});

test('overview contains only known country identities, not armed-group labels', () => {
  const body = between('async function renderAttack(', 'const attackFocus=G.focus;');
  assert.match(body, /\[a\.att,a\.vic\]\.filter\(Boolean\)/);
  assert.match(body, /overviewCountries\.flatMap\(code=>countryFramePoints\(code,/);
});

test('unknown launch coordinates finish at target while known routes retain wide framing', () => {
  const body = between('async function fitAttack(', 'let impactSprite=null');
  assert.match(body, /if\(!a\.source\)/);
  assert.match(body, /flyPoint\(a\.target\.lon,a\.target\.lat,height,ctx\.serial,duration\)/);
  assert.match(engine, /aspect<\.8\?2400000:1650000/);
  assert.match(body, /const height=impactHeight\(ctx\)/);
  assert.match(body, /if\(a\.source\)points\.push/);
});

test('navigation serial and active attack guard both camera phases', () => {
  const body = between('async function renderAttack(', 'const attackFocus=G.focus;');
  assert.match(body, /activeAttack!==ctx\|\|s!==G\.navSerial/);
  assert.match(engine, /const attackFocus=G\.focus;[\s\S]*?stopAttack\(\)/);
});

test('cancelled Cesium camera flights are not treated as completed stages', () => {
  for (const [start, end] of [
    ['async function flyPoint(', 'async function flyFit('],
    ['async function flyFit(', 'function countryMin('],
  ]) {
    const body = between(start, end);
    assert.match(body, /complete:\(\)=>r\(true\)/);
    assert.match(body, /cancel:\(\)=>r\(false\)/);
    assert.match(body, /return completed&&s===G\.navSerial/);
  }
});

test('real camera helpers resolve cancellation as false and refuse stale navigation', async () => {
  const calls=[];
  const G={navSerial:3,viewer:{camera:{
    flyTo:options=>{calls.push('point');options.cancel();},
    flyToBoundingSphere:(sphere,options)=>{calls.push('fit');options.cancel();}
  }}};
  const C={Cartesian3:{fromDegrees:()=>({})},Math:{toRadians:x=>x},
    BoundingSphere:{fromPoints:()=>({radius:1})},HeadingPitchRange:function(){}};
  const ctx=vm.createContext({G,C,good:()=>true});
  vm.runInContext(between('async function flyPoint(', 'function countryMin('),ctx);
  assert.equal(await vm.runInContext('flyPoint(1,2,3,3)',ctx),false);
  assert.equal(await vm.runInContext('flyFit([{}],3)',ctx),false);
  assert.equal(await vm.runInContext('flyPoint(1,2,3,2)',ctx),false);
  assert.equal(await vm.runInContext('flyFit([{}],2)',ctx),false);
  assert.deepEqual(calls,['point','fit']);
});

test('country geometry failure cannot advance the camera or play impacts', async () => {
  const calls=[],G={navSerial:1,v51SceneEntities:[],current:2};
  const ctx=vm.createContext({G,activeAttack:null,performance:{now:()=>100},
    attackData:()=>({vic:'YEM',att:'',target:{lon:45,lat:12}}),good:()=>true,
    clearScene:()=>{},hideBase:()=>{},mainland:()=>[45,12],drawCountry:()=>{},
    countryLabel:()=>'',label:()=>{},flag:()=>{},mark:()=>{},carts:()=>[{}],countryFramePoints:()=>[{}],
    COLOR:{attack:'',victim:''},waitAttackGeometry:async()=>false,
    flyFit:()=>{calls.push('flight');},fitAttack:()=>{calls.push('approach');},
    showImpacts:()=>{calls.push('impact');}
  });
  vm.runInContext(between('function endAttackStage(', 'function attackEntity(')+
    between('async function renderAttack(', 'const attackFocus=G.focus;'),ctx);
  assert.equal(await vm.runInContext('renderAttack({},"YEM",1)',ctx),false);
  assert.deepEqual(calls,[]);
  assert.equal(vm.runInContext('activeAttack.stage',ctx),'geometry-unavailable');
});

test('visible attack country labels stay inside a portrait canvas without pulling in distant labels',()=>{
 const label=position=>({position:{getValue:()=>position},label:{text:{getValue:()=> '乌克兰'},font:{getValue:()=> '600 13px sans-serif'}}});
 const make=(x,y)=>({flag:{position:{getValue:()=>({x,y})},billboard:{}},label:label({x,y})});
 const near=make(22,180),far=make(1000,180);
 const ctx=vm.createContext({G:{viewer:{clock:{currentTime:0},scene:{canvas:{clientWidth:374,clientHeight:210},requestRender(){}}}},
  C:{SceneTransforms:{worldToWindowCoordinates:(_,p)=>p},Cartesian3:{fromDegrees:()=>({x:85,y:100})},Cartesian2:class{constructor(x,y){this.x=x;this.y=y;}}},
  document:{createElement:()=>({getContext:()=>({measureText:()=>({width:39})})})},ctx:{data:{target:{lon:1,lat:2}},badges:[near,far]}});
 vm.runInContext(between('function placeAttackLabels(', 'let activeAttack=null;')+'placeAttackLabels(ctx);',ctx);
 const offset=near.label.label.pixelOffset;
 assert.ok(22+offset.x-28.5>=4);assert.ok(180+offset.y+13<=210);
 assert.ok(1000+far.label.label.pixelOffset.x>374,'off-screen country anchors must stay off screen');
});

test('delayed impact timers cannot declare settled before the final pulse is cleaned up',()=>{
 let now=0,nextId=0;
 const tasks=new Map(),entities=new Set();
 const attack={serial:7,data:{enabled:true,impactEnabled:true,target:{lon:39,lat:54}},timers:new Set(),impactCount:0};
 const G={navSerial:7,overviewMode:false,v51SceneEntities:[],viewer:{
  entities:{remove:e=>entities.delete(e)},scene:{requestRender(){}}
 }};
 const ctx=vm.createContext({G,activeAttack:attack,ctx:attack,performance:{now:()=>now},
  setTimeout:(fn,ms)=>{const id=++nextId;tasks.set(id,{fn,due:now+ms});return id;},
  C:{Cartesian3:{fromDegrees:()=>({})},CallbackProperty:function(){},Color:{WHITE:{withAlpha(){}}}},
  impactImage:()=>'',attackEntity:options=>{entities.add(options);G.v51SceneEntities.push(options);return options;}
 });
 vm.runInContext(between('function attackLater(', 'function attackAnchor(')+
  between('function impact(', 'function flight(')+between('function showImpacts(', 'async function renderAttack('),ctx);
 const advance=time=>{
  now=time;
  for(;;){const next=[...tasks].filter(([,t])=>t.due<=now).sort((a,b)=>a[1].due-b[1].due)[0];
   if(!next)break;tasks.delete(next[0]);next[1].fn();}
 };
 vm.runInContext('showImpacts(ctx)',ctx);
 advance(1200);advance(2700);advance(3500);
 assert.equal(attack.impactCount,3);
 assert.equal(attack.stage,'impact','a delayed final pulse is still active at the old fixed deadline');
 assert.equal(entities.size,1);
 advance(3850);
 assert.equal(attack.stage,'settled');assert.equal(attack.timers.size,0);
 assert.equal(entities.size,0);assert.equal(G.v51SceneEntities.length,0);
});


test('France overview camera frames mainland and Corsica together after upstream overseas filtering',()=>{
 const mainland=[[-5,43],[8,43],[8,51],[-5,51],[-5,43]];
 const corsica=[[8.54,41.38],[9.56,41.38],[9.56,43.01],[8.54,43.01]];
 const indonesia=[[96,-6],[140,-6],[140,7],[96,7],[96,-6]];
 const points=ring=>ring.map(([x,y])=>({x,y}));
 const C={Cartesian3:{fromDegrees:(x,y)=>({x,y}),distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},
  BoundingSphere:{fromPoints(ps){const center={x:ps.reduce((a,p)=>a+p.x,0)/ps.length,y:ps.reduce((a,p)=>a+p.y,0)/ps.length};
   return {center,radius:Math.max(...ps.map(p=>Math.hypot(p.x-center.x,p.y-center.y)))*100000};}}};
 const geometry={FRA:{type:'MultiPolygon',coordinates:[[mainland],[corsica]]},
  IDN:{type:'Polygon',coordinates:[indonesia]}};
 const G={viewer:{scene:{canvas:{clientWidth:690,clientHeight:378}}}};
 const ctx=vm.createContext({C,G,good:(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b),
  polygons:f=>f.type==='MultiPolygon'?f.coordinates:[f.coordinates],
  raw:iso=>geometry[iso],
  carts:iso=>iso==='FRA'?[...points(mainland),...points(corsica)]:points(indonesia),
  area:ring=>Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2)});
 vm.runInContext(between('const DISPERSED_TERRITORIES=', '/* Fill follows'),ctx);
 const fra=vm.runInContext('countryFramePoints("FRA",{lon:2.35,lat:48.85})',ctx);
 assert.equal(fra.length,mainland.length+corsica.length,'France camera must frame ALL metropolitan territory');
 const withoutFocus=vm.runInContext('countryFramePoints("FRA")',ctx);
 assert.equal(withoutFocus.length,mainland.length+corsica.length);
 const idn=vm.runInContext('countryFramePoints("IDN")',ctx);
 assert.equal(idn.length,indonesia.length,'other countries must retain existing regional policy');
 assert.ok(!engine.includes("new Set(['FRA','USA'"));
});

test('small-state impact camera height is lower than large-country camera height',()=>{
 const G={viewer:{scene:{canvas:{clientWidth:690,clientHeight:378}}}};
 const C={BoundingSphere:{fromPoints:pts=>({radius:pts[0].radius})}};
 const ctx=vm.createContext({G,C,countryFramePoints:iso=>[{radius:iso==='PSE'?90000:iso==='UKR'?600000:900000}]});
 vm.runInContext(between('function impactHeight(ctx){','/* Fill follows'),ctx);
 const palestine=vm.runInContext('impactHeight({data:{vic:"PSE",target:{lon:35.10,lat:31.5}}})',ctx);
 const large=vm.runInContext('impactHeight({data:{vic:"FRA",target:{lon:2.3,lat:48.8}}})',ctx);
 assert.equal(palestine,495000);
 assert.equal(large,1650000);
 const ukraine=vm.runInContext('impactHeight({data:{vic:"UKR",target:{lon:31,lat:50}}})',ctx);
 assert.equal(ukraine,1650000,'medium-sized countries must keep their complete sovereign border on screen');
 G.viewer.scene.canvas.clientWidth=378;G.viewer.scene.canvas.clientHeight=690;
 const portrait=vm.runInContext('impactHeight({data:{vic:"PSE",target:{lon:35.10,lat:31.5}}})',ctx);
 assert.ok(portrait<1000000&&portrait>palestine,'portrait should be closer while retaining context');
});

test('a locality never skips its country intro because an imported field says hierarchyPresented',async()=>{
 const calls=[],G={navSerial:42};
 const ctx=vm.createContext({G,placeLabel:()=> '巴黎',countryStage:async(iso,serial)=>{
  calls.push('country:'+iso);G.__v52CountryFrame={iso,serial};return true;
 },finalLocation:async()=>{calls.push('location');return true;},COLOR:{main:'#f00'}});
 vm.runInContext(between('async function renderPoint(', 'async function renderDiplomacy('),ctx);
 const news={countryIso3:'FRA',scenePlan:{primaryIso3:'FRA',hierarchyPresented:true}};
 await vm.runInContext('renderPoint',ctx)(news,'FRA',42);
 assert.deepEqual(calls,['country:FRA','location']);
 calls.length=0;
 await vm.runInContext('renderPoint',ctx)(news,'FRA',42);
 assert.deepEqual(calls,['location'],'already displayed intro on same navigation must not repeat');
 G.navSerial=43;
 calls.length=0;
 await vm.runInContext('renderPoint',ctx)(news,'FRA',43);
 assert.deepEqual(calls,['country:FRA','location'],'next news navigation starts from a country view again');
});

test('confirmed attack routes keep projectile animation then end on an incident close-up',()=>{
 const flightCode=between('function flight(', '// Cesium 1.145');
 assert.ok(flightCode.indexOf('showImpacts(ctx)')<flightCode.indexOf('flyPoint(a.target.lon,a.target.lat,impactHeight(ctx),ctx.serial,1.05)'));
 assert.match(flightCode,/activeAttack===ctx&&ctx.serial===G.navSerial/);
});
