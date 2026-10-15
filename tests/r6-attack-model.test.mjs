import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({window:{NG14:{}}});
vm.runInContext(fs.readFileSync(new URL('../public/news-globe-v52-attack-model.js',import.meta.url),'utf8'),context);
const model=context.window.NG14.v52AttackModel;
const resolve=n=>JSON.parse(JSON.stringify(model.resolve(n)));
const payload=JSON.parse(fs.readFileSync(new URL('./fixtures/r6-daily10-20261014.json',import.meta.url)));
test('real imported Top2 resolves both country roles and unknown launch without a fabricated source',()=>{
 const n=structuredClone(payload.news[1]),a=resolve(n);
 assert.doesNotThrow(()=>resolve({...n,scenePlan:{attackEffect:'invalid'}}));
 assert.doesNotThrow(()=>resolve({...n,scenePlan:'invalid'}));
 assert.equal(a.att,'RUS');assert.equal(a.vic,'UKR');assert.equal(a.source,null);
 assert.deepEqual(a.target,{lon:30.5234,lat:50.4501});assert.equal(a.mode,'MISSILE_ATTACK');
 model.normalize(n);assert.equal(n.scenePlan.attackerIso3,'RUS');assert.equal(n.scenePlan.victimIso3,'UKR');
 assert.equal(n.scenePlan.sourceUnconfirmed,true);assert.equal(n.sourceLon,undefined);
 const again=resolve(n);delete again.identitySource;delete a.identitySource;assert.deepEqual(again,a);
});
test('arbitrary country pairs share the same identity and missile/drone classification',()=>{
 for(const [att,vic] of [['RUS','UKR'],['ISR','IRN'],['IND','PAK'],['USA','JPN']]){
  for(const type of ['missile_attack','drone_attack']){
   const a=resolve({eventType:type,countryIso3:vic,lon:1,lat:2,relatedCountryIso3s:[vic,att],scenePlan:{sourceUnconfirmed:true}});
   assert.equal(a.att,att);assert.equal(a.vic,vic);assert.equal(a.source,null);
   assert.equal(a.attackType,type.split('_')[0]);
  }
 }
});
test('flat and nested exact coordinates include zero and reject null, out-of-range and directional guesses',()=>{
 const n={sceneMode:'ATTACK',sourceCountryIso3:'ISR',targetCountryIso3:'IRN',sourceLon:0,sourceLat:0,targetLon:51,targetLat:35,lon:51,lat:35};
 assert.deepEqual(resolve(n).source,{lon:0,lat:0});
 const nested={eventType:'drone_attack',scenePlan:{attackEffect:{origin:{countryIso3:'IND',longitude:74,latitude:30},target:{countryIso3:'PAK',lon:73,lat:31}}}};
 assert.deepEqual(resolve(nested).source,{lon:74,lat:30});assert.equal(resolve(nested).att,'IND');assert.equal(resolve(nested).vic,'PAK');
 for(const precision of ['direction','directional','approximate','unknown'])assert.equal(resolve({...n,scenePlan:{sourcePrecision:precision}}).source,null);
 for(const sourceLon of [null,undefined,'',181,'invalid'])assert.equal(resolve({...n,sourceLon}).source,null);
 assert.equal(resolve({...n,scenePlan:{attackEffect:{origin:null}}}).source,null);
});
test('sourceUnconfirmed never deletes known attacker or victim identities',()=>{
 const n={sceneMode:'MISSILE_ATTACK',sourceCountryIso3:'ISR',targetCountryIso3:'IRN',lon:51,lat:35,sourceLon:34,sourceLat:31,scenePlan:{sourceUnconfirmed:true,attackerIso3:'ISR',victimIso3:'IRN'}};
 model.normalize(n);assert.equal(n.sourceCountryIso3,'ISR');assert.equal(n.targetCountryIso3,'IRN');
 assert.equal(n.scenePlan.attackerIso3,'ISR');assert.equal(n.scenePlan.victimIso3,'IRN');assert.equal(resolve(n).source,null);
});
test('ambiguous context and non-state actors cannot invent an attacking country',()=>{
 const n={sceneMode:'MISSILE_ATTACK',countryIso3:'UKR',lon:30,lat:50,relatedCountryIso3s:['UKR','RUS','USA']};
 assert.equal(resolve(n).att,'');assert.equal(resolve({...n,relatedCountryIso3s:['UKR','RUS'],scenePlan:{nonStateActor:'某组织'}}).att,'');
 assert.equal(resolve({...n,relatedCountryIso3s:['UKR','RUS'],scenePlan:{registryOnly:true}}).att,'');
});
test('ordinary point stories keep their existing classification and potential attacks stay hypothetical',()=>{
 const ordinary={sceneMode:'POINT',countryIso3:'CHN',lon:116,lat:40,relatedCountryIso3s:['CHN','FRA']};
 assert.equal(resolve(ordinary),null);assert.equal(resolve({...ordinary,eventType:'missile_deployment'}),null);model.normalize(ordinary);assert.equal(ordinary.sceneMode,'POINT');
 assert.equal(resolve({...ordinary,sceneMode:'POTENTIAL_ATTACK'}).potential,true);
 assert.equal(resolve({...ordinary,eventType:'drone_attack',scenePlan:{attackEffect:{enabled:false}}}).enabled,false);
});
