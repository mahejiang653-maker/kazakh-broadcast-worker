import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name,import.meta.url),'utf8');
const world = JSON.parse(fs.readFileSync(new URL('./fixtures/r6-world-borders-20261007.geojson',import.meta.url)));
const china = JSON.parse(source('news-globe-china-outline-v52.geojson'));
function harness() {
  const values = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{textContent:'',children:[],classList:{remove(){},add(){},toggle(){}}});
    return nodes.get(id);
  };
  const color = {withAlpha(){return this;}};
  const C = {Color:{fromCssColorString:()=>color,BLACK:color,WHITE:color},ArcType:{GEODESIC:1},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height}),
      fromDegreesArrayHeights:a=>Array.from({length:a.length/3},(_,i)=>({lon:a[i*3],lat:a[i*3+1],height:a[i*3+2]}))},
    BoundingSphere:{fromPoints:points=>({points,radius:2000000})},
    PolygonHierarchy:class {},Cartesian2:class {},HeadingPitchRange:class {},
    PolylineOutlineMaterialProperty:class {constructor(options){Object.assign(this,options);}},
    Math:{toRadians:n=>n*Math.PI/180}};
  const context = vm.createContext({window:{Cesium:C,addEventListener(){}},Cesium:C,
    localStorage:{getItem:()=>null},document:{getElementById:node},console,
    setTimeout,clearTimeout,setInterval,clearInterval,AbortController});
  vm.runInContext(source('news-globe-v14-core.js'),context);
  const G = context.window.NG14;
  G.viewer = {entities:{values,add(e){values.push(e);return e;},
    remove(e){const i=values.indexOf(e);if(i>=0)values.splice(i,1);},suspendEvents(){},resumeEvents(){}},
    scene:{requestRender(){}},clock:{currentTime:0},camera:{flyTo(){},flyToBoundingSphere(){}}};
  G.fetchJSON = async urls => urls===G.WORLD ? structuredClone(world) : urls===G.CHINA_OUTLINE ? structuredClone(china) : {features:[]};
  G.countryNameZh = iso => ({CHN:'中国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',FRA:'法国',IRN:'伊朗',OMN:'阿曼',IND:'印度',IDN:'印度尼西亚'}[iso]);
  G.dualInfo = n => {
    if(!n)return null;
    n.secondaryCountryIso3='MEX';n.secondaryCountry='墨西哥';n.secondaryLon=-102;n.secondaryLat=23;
    return {iso:'MEX',lon:-102,lat:23};
  };
  for (const file of ['news-globe-v14-highlight.js','news-globe-v14-ui.js','news-globe-v52-china-border-ownership.js',
    'news-globe-v52-geographic-features.js','news-globe-v52-attack-model.js','news-globe-v52-story-borders.js']) vm.runInContext(source(file),context);
  G.runSequence = (_n,iso) => { G.activeIso=iso;G.setCountry(iso,true);G.clearLocal(); };
  return {G,context,values};
}
const story = (iso,title='新闻') => ({countryIso3:iso,scenePlan:{primaryIso3:iso},title,location:'新闻地点',lon:0,lat:0});
function installNews(G,news) { G.news=Array.from({length:13},(_,i)=>news[i%news.length]); }
function visibleCountries(G) { return [...G.v52StoryBorders.getDiagnostics().countries]; }
function assertScope(G,isos) {
  const expected = new Set(isos);
  const selected = new Set(isos.flatMap(iso=>G.countries.get(iso).entities));
  for (const e of G.borderEntities) {
    assert.equal(e.show,selected.has(e),'Country ownership must determine every border segment');
    if(e.show) assert.ok([...e._countryIsos].some(iso=>expected.has(iso)));
  }
  assert.equal(G.borderEntities.filter(e=>e.show).length,selected.size);
}

test('USA alone keeps its shared frontiers and hides Canada, Mexico and unrelated coastlines',async()=>{
  const {G}=harness();await G.loadBorders();
  const n={...story('USA','飓风逼近美国墨西哥湾，油气企业撤离人员。'),
    country:'美国 · 墨西哥',scenePlan:{primaryIso3:'USA',contextCountries:['USA','MEX','CAN']}};
  installNews(G,[n]);G.focus(0);
  assert.deepEqual(visibleCountries(G),['USA']);assertScope(G,['USA']);
  assert.ok(G.borderEntities.some(e=>e.show&&e._countryIsos.has('USA')&&e._countryIsos.has('CAN')));
  assert.ok(G.countries.get('MEX').entities.some(e=>!e.show&&!e._countryIsos.has('USA')));
  const info=G.dualInfo(n);assert.equal(info.iso,'MEX');
  assert.equal(n.secondaryCountryIso3,undefined,'Display-only geographic guesses must not alter the story');
  G.focus(0);assertScope(G,['USA']);
});

test('switching stories and repeated scene cleanup never restore every country',async()=>{
  const {G}=harness();await G.loadBorders();installNews(G,[story('USA'),story('CHN')]);
  const positions=new Map(G.borderEntities.map(e=>[e,e.polyline.positions]));
  for(let i=0;i<40;i++) {
    const iso=i%2?'CHN':'USA';G.focus(i%2);G.clearLocal();G.setCountry(iso==='CHN'?'USA':'CHN',true);
    assertScope(G,[iso]);
  }
  assert.equal(G.borderEntities.length,8132);
  for(const e of G.borderEntities) {
    assert.equal(e.polyline.positions,positions.get(e));assert.equal(e.polyline.clampToGround,false);
    assert.ok(e.polyline.positions.every(p=>p.height===(e._chinaAuthoritativeOutline?22000:18000)));
  }
});

test('overview stays border-free even after country reset and local cleanup',async()=>{
  const {G}=harness();await G.loadBorders();installNews(G,[story('USA')]);G.focus(0);G.overview();
  G.setCountry('USA',false);G.clearLocal();
  assert.ok(G.borderEntities.every(e=>!e.show));
  G.focus(0);assertScope(G,['USA']);
  G.overlays(false);G.clearLocal();assert.ok(G.borderEntities.every(e=>!e.show));
});

test('explicit diplomatic participants and verified attack roles show their combined frontiers',async()=>{
  const {G}=harness();await G.loadBorders();
  installNews(G,[{...story('CHN'),scenePlan:{primaryIso3:'CHN',participants:['CHN','FRA','ZZZ']}},
    {...story('UKR'),sourceCountryIso3:'RUS',targetCountryIso3:'UKR'}]);
  G.focus(0);assertScope(G,['CHN','FRA']);assert.deepEqual(visibleCountries(G),['CHN','FRA']);
  G.focus(1);assertScope(G,['UKR','RUS']);
  // A temporary country-introduction plan must not replace the current story's scope.
  G.setCountry('CHN',true);G.clearLocal();assertScope(G,['UKR','RUS']);
});

test('unconfirmed actors and registry-only context cannot add unrelated countries',async()=>{
  const {G}=harness();await G.loadBorders();
  const plan={primaryIso3:'USA',attackerIso3:'RUS',victimIso3:'IRN',contextCountries:['CAN']};
  for(const flags of [{sourceUnconfirmed:true},{nonStateActor:'某组织'},{registryOnly:true}]) {
    const n={...story('USA'),sourceCountryIso3:'RUS',targetCountryIso3:'IRN',scenePlan:{...plan,...flags}};
    installNews(G,[n]);G.focus(0);assertScope(G,['USA']);
  }
});

test('daily headlines identify countries even when the edition only supplies a primary ISO',async()=>{
  const {G,context}=harness();await G.loadBorders();
  const cases=[['CHN','中法举行第28次战略对话，聚焦航空航天合作。',['CHN','FRA']],
    ['UKR','若俄停止攻击乌能源设施，乌愿停止袭击俄炼油厂。',['RUS','UKR']],
    ['OMN','美军称在阿曼湾击停一艘试图突破对伊封锁的商船。',['IRN','OMN','USA']],
    ['USA','美国公布新政策，弘扬美德。',['USA']],
    ['IDN','印度尼西亚公布经济数据。',['IDN']]];
  for(const [iso,title,expected]of cases) {
    installNews(G,[story(iso,title)]);G.focus(0);assert.deepEqual(visibleCountries(G),expected);assertScope(G,expected);
  }
  vm.runInContext(source('news-globe-data-20260920-v52-r1.js'),context);
  G.news=G.demo;
  for(let i=0;i<G.news.length;i++) {
    G.focus(i);const isos=visibleCountries(G);
    assert.ok(isos.includes(G.news[i].countryIso3));assertScope(G,isos);
  }
});

test('async border loading honors the latest selection and starts all new geometry hidden',async()=>{
  const {G}=harness();installNews(G,[story('USA'),story('CHN')]);
  const fetchJSON=G.fetchJSON;let release;const gate=new Promise(r=>{release=r;});
  G.fetchJSON=async urls=>{if(urls===G.CHINA_L1)await gate;return fetchJSON(urls);};
  const pending=G.loadBorders();G.focus(0);
  await new Promise(r=>setImmediate(r));assert.ok(G.borderEntities.every(e=>e.show===false));
  G.focus(1);release();await pending;assertScope(G,['CHN']);
  assert.ok(G.countries.get('CHN').entities.every(e=>e._chinaAuthoritativeOutline));
});


test('POINT diplomatic story highlights only its primary country despite headline and related-country metadata',async()=>{
  const {G}=harness();await G.loadBorders();
  const n={...story('CHN','中越就人工智能、清洁能源和数字经济合作深入交换意见'),
    sceneMode:'POINT',location:'中国北京',focusLabel:'北京',lon:116.4,lat:39.9,
    summary:'中国与越南在北京就合作交换意见。',
    relatedCountryIso3s:['CHN','VNM'],
    scenePlan:{primaryIso3:'CHN',participants:['CHN','VNM']}};
  installNews(G,[n]);G.focus(0);
  assert.deepEqual(visibleCountries(G),['CHN']);
  assertScope(G,['CHN']);
  assert.equal(n.relatedCountryIso3s.length,2,'keep the true related countries in news data');
  G.overview();assert.ok(G.borderEntities.every(e=>!e.show));
  G.focus(0);assertScope(G,['CHN']);
});

 test('unknown launch in an attack story retains both explicit actors and ignores unrelated context',async()=>{
  const {G}=harness();await G.loadBorders();
  const n={...story('UKR'),sceneMode:'MISSILE_ATTACK',relatedCountryIso3s:['UKR','RUS'],scenePlan:{primaryIso3:'UKR',sourceUnconfirmed:true,contextCountries:['USA']}};
  installNews(G,[n]);G.focus(0);assertScope(G,['UKR','RUS']);
 });
