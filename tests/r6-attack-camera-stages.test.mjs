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
  assert.match(body, /overviewCountries\.flatMap\(code=>carts\(code\)\)/);
});

test('unknown launch coordinates finish at target while known routes retain wide framing', () => {
  const body = between('async function fitAttack(', 'let impactSprite=null');
  assert.match(body, /if\(!a\.source\)/);
  assert.match(body, /flyPoint\(a\.target\.lon,a\.target\.lat,height,ctx\.serial,duration\)/);
  assert.match(body, /aspect<\.8\?2400000:1650000/);
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
    countryLabel:()=>'',label:()=>{},flag:()=>{},mark:()=>{},carts:()=>[{}],
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
