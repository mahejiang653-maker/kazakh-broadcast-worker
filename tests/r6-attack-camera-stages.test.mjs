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
