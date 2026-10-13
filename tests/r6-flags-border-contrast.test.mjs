import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url),'utf8');

test('final POINT location preserves the primary-country flag after scene cleanup',()=>{
  const code=source('news-globe-v14-v51-scene-engine.js');
  assert.match(code,/flag\(flagIso\|\|n\.scenePlan\?\.primaryIso3\|\|n\.countryIso3,\+n\.lon,\+n\.lat/);
  assert.match(code,/cc=ISO2\[key\]\|\|String\(G\.countries\?\.get\(key\)\?\.iso2/);
  assert.match(code,/if\(G\.v52RenderGeographicFeature&&await G\.v52RenderGeographicFeature\(n,s\)\)\{if\(s===G\.navSerial\)flag/);
});

test('shared China–Kazakhstan edges remain available to Kazakhstan while China uses its own canonical outline',()=>{
  const core=source('news-globe-v14-core.js');
  assert.match(core,/some\(iso=>iso!=='CHN'\)/);
  assert.match(core,/e\._countryIsos\.delete\('CHN'\)/);
  assert.match(core,/G\.positions\(\[a,b\],18000\)/);
  assert.match(core,/G\.positions\(r,22000\)/);
  const highlight=source('news-globe-v14-highlight.js');
  assert.match(highlight,/const width=on\?\.80:\.42/);
});

test('China ownership cleanup cannot delete foreign-owned edges',()=>{
 const code=source('news-globe-v52-china-border-ownership.js');
 assert.match(code,/e\._countryIsos\?\.has\('CHN'\) && e\._edgeAB\.every\(index\.matches\)/);
 const engine=source('news-globe-v14-v51-scene-engine.js');
 assert.match(engine,/https:\/\/flagcdn\.com\/w40\//);
 assert.match(engine,/canvas\.toDataURL\('image\/png'\)/);
});
