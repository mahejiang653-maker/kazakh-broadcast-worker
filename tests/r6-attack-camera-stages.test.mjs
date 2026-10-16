import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  assert.match(body, /stopAttack\(\)/);
});
