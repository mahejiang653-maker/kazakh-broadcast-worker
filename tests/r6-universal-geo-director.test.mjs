import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/news-globe-v52-geo-semantic.js', import.meta.url),'utf8');
function load(){
 const win={};vm.runInNewContext(source,{window:win,console});
 return win.V52GeoSemantic;
}
const d=load();
const base=(title,other={})=>({title,summary:title,countryIso3:'CHN',location:'北京',
 focusLabel:'北京',lon:116.4,lat:39.9,sceneMode:'POINT',...other});
const types=n=>Array.from(d.analyze(n).steps,s=>s.type);
const isos=n=>Array.from(d.analyze(n).steps.filter(s=>s.type==='country-highlight'),s=>s.iso3);

test('real 2026-11-12 Top9: northwest is an area, never an event point',()=>{
 const s=base('轻骑兵太阳能无人机首飞',{id:'Top9',rank:9,location:'中国西北地区',focusLabel:'中国西北地区',
 lon:103.8,lat:36.1,coordinatePrecision:'representative, not exact event location',
 relatedCountryIso3s:['CHN'],sceneMode:'POINT'});
 const p=d.analyze(s);
 assert.equal(p.scenario,'region');
 assert.deepEqual(types(s),['country-highlight','region-highlight']);
 assert.equal(p.steps[1].regionKey,'china-northwest');
 assert.equal(p.steps[1].provinces.length,5);
 assert.ok(!p.steps.some(x=>x.type==='point-focus'));
});
test('real 2026-11-12 Top10: trade partner before China then port reference',()=>{
 const s=base('新疆塔克什肯口岸通关热度攀升',{id:'Top10',rank:10,location:'塔克什肯口岸',focusLabel:'塔克什肯口岸',
 lon:90.8,lat:46.15,eventType:'trade',relatedCountryIso3s:['CHN','MNG'],coordinatePrecision:'representative, not exact event location'});
 assert.deepEqual(isos(s),['MNG','CHN']);
 assert.deepEqual(types(s),['country-highlight','country-highlight','point-focus']);
 assert.equal(d.analyze(s).steps[2].point.verified,false);
});
const fixtures=[
 ['city traffic accident',base('韩国城南市多车相撞',{countryIso3:'KOR',location:'城南市',focusLabel:'城南',lon:127.12,lat:37.42}),['country-highlight','point-focus']],
 ['national policy',base('中国全国实施经济政策',{sceneMode:'COUNTRY',location:'全国',focusLabel:'全国',lon:null,lat:null}),['country-highlight']],
 ['northeast regional disaster',base('中国东北地区洪灾',{location:'中国东北地区',focusLabel:'中国东北地区'}),['country-highlight','region-highlight']],
 ['bilateral trade',base('中国与蒙古国边境口岸通关量增长',{location:'边境口岸',relatedCountryIso3s:['CHN','MNG']}),['country-highlight','country-highlight','point-focus']],
 ['verified transport direction',base('中国向蒙古国通过口岸运输',{location:'边境口岸',relatedCountryIso3s:['CHN','MNG'],
   route:{fromCountryIso3:'CHN',toCountryIso3:'MNG',directionVerified:true}}),['country-highlight','country-highlight','point-focus']],
 ['trilateral diplomacy',base('中国美国俄罗斯在阿布扎比举行会谈',{countryIso3:'ARE',location:'阿布扎比',
   relatedCountryIso3s:['CHN','USA','RUS','ARE'],lon:54.37,lat:24.45}),['country-highlight','country-highlight','country-highlight','country-highlight','point-focus']],
 ['large diplomacy',base('中国美国俄罗斯法国德国英国在阿布扎比举行多国峰会',{countryIso3:'ARE',location:'阿布扎比',relatedCountryIso3s:['CHN','USA','RUS','FRA','DEU','GBR','ARE'],
   lon:54.37,lat:24.45}),['multi-country-overview','country-highlight','point-focus']],
 ['traveler illustrative route',base('旅行者从中国前往哈萨克斯坦旅行',{location:'阿拉木图',countryIso3:'KAZ',relatedCountryIso3s:['CHN','KAZ'],lon:76.9,lat:43.2}),
   ['country-highlight','country-highlight','cross-border-route','point-focus']],
 ['military action',base('俄罗斯对乌克兰地区发动袭击',{countryIso3:'UKR',location:'乌克兰东部地区',relatedCountryIso3s:['RUS','UKR'],
   sceneMode:'ATTACK',scenePlan:{attackerIso3:'RUS',victimIso3:'UKR'},lon:36.5,lat:49}),
   ['country-highlight','country-highlight','directional-relation']],
 ['military unknown launch',base('美国对伊朗部分设施发动打击',{countryIso3:'IRN',relatedCountryIso3s:['USA','IRN'],
   scenePlan:{attackerIso3:'USA',victimIso3:'IRN'}}),['country-highlight','country-highlight','directional-relation']],
 ['Hormuz waterway',base('霍尔木兹海峡油轮事故',{countryIso3:'IRN',location:'霍尔木兹海峡',focusLabel:'霍尔木兹海峡',lon:56.5,lat:26.56}),
   ['country-highlight','waterbody-focus']],
 ['mountain range event',base('天山山脉完成生态修复',{location:'天山山脉',focusLabel:'天山山脉'}),
   ['country-highlight','waterbody-focus']],
 ['southwest regional technology',base('我国西南地区科技活动突破',{location:'我国西南地区'}),['country-highlight','region-highlight']],
 ['EU policy collective',base('欧盟通过年度预算',{countryIso3:'BEL',location:'布鲁塞尔',lon:4.35,lat:50.85}),
   ['multi-country-overview','point-focus']],
 ['city geolocation reference',base('城南市发生交通事故',{countryIso3:'KOR',location:'城南市',lon:127.12,lat:37.42,
   locationPrecision:'city-or-regional-reference'}),['country-highlight','point-focus']],
 ['country only missing coordinates',base('中国出台全国性财政政策',{sceneMode:'COUNTRY',location:'全国',lon:null,lat:null}),
   ['country-highlight']]
];
for(const [name,fixture,expected] of fixtures)test('semantic regression: '+name,()=>{
 assert.deepEqual(types(fixture),expected);
 const p=d.analyze(fixture);
 assert.equal(p.validated,true);
 assert.ok(p.steps.length>0);
 assert.ok(p.steps.every(s=>!s.point||Number.isFinite(s.point.lon)&&Number.isFinite(s.point.lat)));
});
test('rank and date do not affect scene plans',()=>{
 const a=base('中国西北地区实施技术试验',{location:'中国西北地区',rank:1,date:'2026-11-12'});
 const b={...a,rank:10,id:'Top10',date:'2030-01-01'};
 assert.deepEqual(JSON.parse(JSON.stringify(d.analyze(a).steps)),JSON.parse(JSON.stringify(d.analyze(b).steps)));
});
test('unverified attack route cannot become an actual trajectory',()=>{
 const p=d.analyze(base('俄罗斯对乌克兰发动袭击',{countryIso3:'UKR',relatedCountryIso3s:['RUS','UKR'],
 scenePlan:{attackerIso3:'RUS',victimIso3:'UKR'},coordinatePrecision:'representative'}));
 assert.equal(p.steps.find(s=>s.type==='directional-relation').evidence,'abstract-relation');
 assert.ok(!p.steps.some(s=>s.type==='point-focus'));
});
test('EU is 27 sovereign members, not a fake ISO3 country',()=>{
 const p=d.analyze(base('欧盟通过年度预算',{countryIso3:'BEL',location:'布鲁塞尔'}));
 assert.equal(p.steps[0].countries.length,27);
 assert.ok(!p.steps[0].countries.includes('EU'));
});
test('rejected invalid coordinates and unknown ISO in deterministic validator',()=>{
 const p=d.analyze(base('交通事故',{countryIso3:'CHN'}));
 const bad={...p,steps:[{type:'point-focus',point:{lon:Infinity,lat:200}},{type:'country-highlight',iso3:'XXX'},...p.steps]};
 const v=d.validate(bad,new Set(['CHN']));
 assert.equal(v.steps.length,p.steps.length);
});
test('no extra coordinates for regional events without source precision',()=>{
 const p=d.analyze(base('我国西北地区发生区域性灾害',{location:'西北地区',lon:103.8,lat:36.1}));
 assert.ok(p.steps.every(s=>!s.point));
 assert.equal(p.precision,'regional-approximation');
});
