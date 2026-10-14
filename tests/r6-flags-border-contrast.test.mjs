import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url),'utf8');

test('final POINT location preserves the primary-country flag after scene cleanup',()=>{
  const code=source('news-globe-v14-v51-scene-engine.js');
  assert.match(code,/flag\(flagIso\|\|n\.scenePlan\?\.primaryIso3\|\|n\.countryIso3,\+n\.lon,\+n\.lat/);
  assert.match(code,/cc=ISO2\[key\]\|\|String\(G\.countries\?\.get\(key\)\?\.iso2/);
  assert.match(code,/if\(!\['city','town','village','城市','城镇','乡镇','村庄','市','县城'\]\.includes\(String\(n\.placeType\|\|''\)\.trim\(\)\.toLowerCase\(\)\) && G\.v52RenderGeographicFeature&&await G\.v52RenderGeographicFeature\(n,s\)\)\{if\(s===G\.navSerial\)flag/);
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


test('all attack modes use one scene renderer and unknown launch sites do not create inferred trajectories',()=>{
 const engine=source('news-globe-v14-v51-scene-engine.js');
 const rules=source('news-globe-v52-hard-rules.js');
 for(const mode of ['ATTACK','MISSILE_ATTACK','DRONE_ATTACK','POTENTIAL_ATTACK']){
   assert.ok(engine.includes("mode==='"+mode+"'"),'missing engine mode '+mode);
   assert.ok(rules.includes("'"+mode+"'"),'missing hard-rule mode '+mode);
 }
 assert.match(engine,/p\.sourceUnconfirmed!==true/);
 assert.match(engine,/\['direction','directional','approximate'\]\.includes/);
 assert.match(engine,/if\(!a\.source\)return finalLocation\(n,s/);
 assert.doesNotMatch(engine,/基辅|Kyiv|Kiev|Київ/);
});
