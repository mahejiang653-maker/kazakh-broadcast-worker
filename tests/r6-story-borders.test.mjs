import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name,import.meta.url),'utf8');
const world = JSON.parse(fs.readFileSync(new URL('./fixtures/r6-world-borders-20261007.geojson',import.meta.url)));
const china = JSON.parse(source('news-globe-china-outline-v52.geojson'));
const atlasRoot = 'news-globe-country-borders-v2/';
const atlasManifest = atlasRoot+'territories-v1.json';
const atlasIndex = JSON.parse(source(atlasManifest));
function harness({atlas=false,onFetch=()=>{}}={}) {
  const values = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{textContent:'',children:[],classList:{remove(){},add(){},toggle(){}}});
    return nodes.get(id);
  };
  const color = {withAlpha(){return this;}};
  const C = {Color:{fromCssColorString:css=>({css,withAlpha(){return this;}}),BLACK:color,WHITE:color},ArcType:{GEODESIC:1},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height}),
      fromDegreesArrayHeights:a=>Array.from({length:a.length/3},(_,i)=>({lon:a[i*3],lat:a[i*3+1],height:a[i*3+2]}))},
    BoundingSphere:{fromPoints:points=>({points,radius:2000000})},
    PolygonHierarchy:class {constructor(positions,holes=[]){this.positions=positions;this.holes=holes;}},
    Cartesian2:class {constructor(x,y){this.x=x;this.y=y}},HeadingPitchRange:class {},
    PolylineOutlineMaterialProperty:class {constructor(options){Object.assign(this,options);}},
    Math:{toRadians:n=>n*Math.PI/180}};
  let hideAnnotations = false;
  const context = vm.createContext({window:{Cesium:C,addEventListener(){}},Cesium:C,
    localStorage:{getItem:()=>null},document:{getElementById:node,body:{classList:{contains:()=>hideAnnotations}}},console,
    setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal,atob});
  vm.runInContext(source('news-globe-v14-core.js'),context);
  const G = context.window.NG14;
  G.viewer = {entities:{values,add(e){values.push(e);return e;},contains(e){return values.includes(e);},
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
  if(atlas){
    context.fetch = async (url,options) => {
      const name = url.slice(1).split('?')[0];
      await onFetch(name,options);
      return {ok:true,json:async()=>JSON.parse(source(name))};
    };
    vm.runInContext(source('news-globe-v52-detailed-borders.js'),context);
  }
  G.runSequence = (_n,iso) => { G.activeIso=iso;G.setCountry(iso,true);G.clearLocal(); };
  return {G,context,values,hide(value){hideAnnotations=value;}};
}
const story = (iso,title='新闻') => ({countryIso3:iso,scenePlan:{primaryIso3:iso},title,location:'新闻地点',lon:0,lat:0});
function installNews(G,news) { G.news=Array.from({length:13},(_,i)=>news[i%news.length]); }
function visibleCountries(G) { return [...G.v52StoryBorders.getDiagnostics().countries]; }
function assertScope(G,isos) {
  const expected = new Set(isos);
  const selected = new Set(isos.flatMap(iso=>G.storyBorderEntities(iso)));
  for (const e of G.borderEntities) {
    assert.equal(e.show,selected.has(e),'Country ownership must determine every border segment');
    if(e.show) assert.ok([...e._countryIsos].some(iso=>expected.has(iso)));
  }
  assert.equal(G.borderEntities.filter(e=>e.show).length,selected.size);
}

test('the high detail atlas covers every existing country, plus countries absent from the older map',()=>{
  const files = new Set(fs.readdirSync(new URL('../public/'+atlasRoot,import.meta.url)));
  for(const f of world.features){
    const sourceIso=f.properties.iso_a3, iso=sourceIso==='-99'?
      ({France:'FRA',Norway:'NOR',Kosovo:'XKX'}[f.properties.name]):sourceIso;
    if(!iso||iso==='CHN')continue;
    const rings=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];
    const coarse=rings.reduce((n,poly)=>n+poly[0].length-1,0);
    assert.ok(atlasIndex.packs[iso][0]>coarse,iso+' did not get a more detailed outline');
  }
  for(const [iso,[segments,parts]] of Object.entries(atlasIndex.packs)){
    assert.ok(segments>0&&parts.length&&parts.every(file=>file.startsWith(iso+'-')&&files.has(file)),iso+' has missing parts');
    assert.ok(atlasIndex.fills[iso]?.length,iso+' has no fill rings');
  }
  assert.deepEqual(Object.keys(atlasIndex.fills).sort(),Object.keys(atlasIndex.packs).sort());
  for(const iso of ['VAT','MCO','LIE','AND','MLT','MDV','SGP'])assert.ok(atlasIndex.packs[iso]);
  assert.equal(atlasIndex.packs.CHN,undefined,'China must use its existing authoritative outline');
});

const settled = () => new Promise(resolve=>setImmediate(resolve));
test('a slow border index does not block globe startup or prevent later detail',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const {G}=harness({atlas:true,onFetch:name=>name===atlasManifest?gate:null});
  try {
    await G.loadBorders();
    assert.equal(G.v52DetailedBorders.getDiagnostics().availableCountries,0);
    installNews(G,[story('NLD')]);G.focus(0);assertScope(G,['NLD']);
    assert.equal(G.borderEntities.filter(e=>e.show).length,14);
  } finally { release(); }
  await settled();assertScope(G,['NLD']);
  assert.ok(G.countries.has('VAT'));
  assert.equal(G.v52DetailedBorders.getDiagnostics().segments,842);
});

function edgeKey(a,b){
  return [a,b].map(p=>`${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).sort().join(':');
}
function outlineEdges(lines){
  return new Set(lines.flatMap(line=>line.slice(1).map((p,i)=>edgeKey(line[i],p))));
}
function fillLines(parts){
  return parts.flatMap(e=>{
    const h=e.polygon.hierarchy;
    return [h.positions,...h.holes.map(hole=>hole.positions)];
  });
}

test('country fills and white strokes upgrade together from the same real arcs',async()=>{
  const {G,values}=harness({atlas:true});await G.loadBorders();
  G.overviewMode=false;G.label=()=>null;
  G.flashCountry('NLD',story('NLD'));
  const fallback=[...G.countryFillEntities];
  assert.ok(fallback.length>0&&fallback.every(e=>!e.__v52DetailedFill));
  assert.ok(G.storyBorderEntities('NLD').every(e=>!e.__v52DetailedBorder));
  await settled();
  assert.ok(fallback.every(e=>!values.includes(e)),'old fill must be removed');
  const pieces=G.countryFillEntities;
  assert.ok(pieces.every(e=>e.__v52DetailedFill&&e.polygon.height===17500));
  assert.equal(pieces.length,12,'mainland and islands stay separate');
  const white=outlineEdges(G.storyBorderEntities('NLD').map(e=>e.polyline.positions));
  const filled=outlineEdges(fillLines(pieces));
  assert.equal(white.size,842);
  assert.deepEqual(filled,white,'every fill edge, including its coast, uses the exact outline coordinates');
  G.clearCountry();G.overview();await settled();
  assert.ok(pieces.every(e=>!values.includes(e)),'overview clears every upgraded polygon');
});

test('all active red and blue polygons retain their holes and scene metadata after refinement',async()=>{
  const {G}=harness({atlas:true});await G.loadBorders();G.overviewMode=false;
  const layer=[];
  G.selectCountryOverviewBordersBatch(['ZAF','LSO']);
  G.v52DrawTerritory('ZAF',layer,'#ff4050',.26,{__v52AttackSerial:9,__v52AttackKind:'country-ZAF'});
  G.v52DrawTerritory('LSO',layer,'#3dbdff',.26);
  await settled();
  assertScope(G,['LSO','ZAF']);assert.ok(layer.every(e=>e.__v52DetailedFill));
  const home=layer.filter(e=>e.__v52CountryIso==='ZAF');
  const interior=home.flatMap(e=>e.polygon.hierarchy.holes.map(h=>h.positions))[0];
  assert.ok(interior?.length>20,'a country surrounding another leaves a real hole');
  const enclave=layer.filter(e=>e.__v52CountryIso==='LSO');
  assert.deepEqual(outlineEdges([interior]),outlineEdges(fillLines(enclave)));
  assert.ok(home.every(e=>e.__v52AttackSerial===9&&e.__v52AttackKind==='country-ZAF'&&e.polygon.material.css==='#ff4050'));
  assert.ok(enclave.every(e=>e.polygon.material.css==='#3dbdff'));
  // A regional source polygon uses the same hierarchy builder (including holes).
  const admin=[[[0,0],[2,0],[2,2],[0,2],[0,0]],[[.4,.4],[.4,.8],[.8,.8],[.4,.4]]];
  assert.equal(G.countryHierarchy(admin).holes[0].positions.length,4);
});

test('a late polygon pack cannot recreate an old territory after a story switch',async()=>{
  let release,signal;
  const gate=new Promise(resolve=>{release=resolve;});
  const {G,values}=harness({atlas:true,onFetch:(name,options)=>{
    if(name===atlasRoot+'NLD-0.json'){signal=options.signal;return gate;}
  }});await G.loadBorders();G.label=()=>null;
  installNews(G,[story('NLD'),story('LIE')]);G.focus(0);G.flashCountry('NLD',story('NLD'));
  G.focus(1);G.flashCountry('LIE',story('LIE'));
  assert.equal(signal.aborted,true);
  release();await settled();
  assert.ok(G.countryFillEntities.length&&G.countryFillEntities.every(e=>e.__v52CountryIso==='LIE'&&e.__v52DetailedFill));
  assert.ok(!values.some(e=>e.__v52TerritoryFill&&e.__v52CountryIso==='NLD'));
});

test('Hague switches to real detailed coastlines; fast navigation and overview remove stale detail',async()=>{
  let delay,loadSignal;
  const {G,hide}=harness({atlas:true,onFetch:(name,options)=>{
    if(name===atlasRoot+'NLD-0.json'&&delay){loadSignal=options.signal;return delay;}
  }});
  await G.loadBorders();
  assert.ok(G.countries.has('VAT'),'new country must be resolvable before its first story');
  const baseline=G.borderEntities.length;
  const n={...story('NLD'),sceneMode:'POINT',title:'海牙国际法庭举行听证',location:'海牙',lon:4.3,lat:52.08};
  installNews(G,[n,story('LIE')]);
  let release;delay=new Promise(resolve=>{release=resolve;});
  G.focus(0);assertScope(G,['NLD']);
  assert.equal(G.borderEntities.filter(e=>e.show).length,14);
  G.focus(1);
  assert.equal(loadSignal.aborted,true);
  release();delay=null;await settled();
  assertScope(G,['LIE']);assert.deepEqual([...G.v52DetailedBorders.getDiagnostics().countries],['LIE']);
  G.focus(0);await settled();assertScope(G,['NLD']);
  const lines=G.storyBorderEntities('NLD');
  assert.equal(lines.reduce((n,e)=>n+e.polyline.positions.length-1,0),842);
  assert.ok(lines.every(e=>!e.polyline.clampToGround&&e.polyline.positions.every(p=>p.height===18000)));
  const hague=lines.flatMap(e=>e.polyline.positions).filter(p=>p.lon>=3.9&&p.lon<=4.6&&p.lat>=51.9&&p.lat<=52.35);
  assert.ok(hague.length>=12,'real coast vertices near the reported close-up');
  G.clearLocal();assertScope(G,['NLD']);
  assert.equal(G.storyBorderEntities('NLD'),lines,'scene cleanup must keep the installed geometry');
  hide(true);for(const e of lines)e.show=false;G.applyStoryBorders();assert.ok(lines.every(e=>!e.show));
  hide(false);G.overview();assert.equal(G.borderEntities.length,baseline);
  assert.ok(G.borderEntities.every(e=>!e.show));
});

test('high detail draws shared frontiers once and preserves existing China and France coverage',async()=>{
  const {G}=harness({atlas:true});await G.loadBorders();
  const original=[...G.countries.get('CHN').entities];
  const choose=(...codes)=>{G.overviewMode=false;G.selectCountryOverviewBordersBatch(codes);};
  choose('BEL','NLD');await settled();assertScope(G,['BEL','NLD']);
  const nl=G.storyBorderEntities('NLD'),bel=G.storyBorderEntities('BEL');
  assert.ok(nl.some(e=>e._countryIsos.has('BEL')&&bel.includes(e)),'both sides reuse one polyline');
  assert.ok(nl.every(e=>e.__v52DetailedBorder));
  choose('KGZ');await settled();assertScope(G,['KGZ']);
  assert.ok(G.storyBorderEntities('KGZ').some(e=>e._countryIsos.has('CHN')));
  choose('CHN','KGZ');assertScope(G,['CHN','KGZ']);
  assert.deepEqual([...G.storyBorderEntities('CHN')],original);
  assert.ok(G.storyBorderEntities('KGZ').every(e=>!e._countryIsos.has('CHN')));
  choose('FRA');await settled();assertScope(G,['FRA']);
  assert.ok(G.storyBorderEntities('FRA').every(e=>e.polyline.positions.every(p=>p.lon>=-7&&p.lon<=11&&p.lat>=40&&p.lat<=52.5)));
  choose('PSE');await settled();assertScope(G,['PSE']);
  const ps=G.storyBorderEntities('PSE').flatMap(e=>e.polyline.positions);
  assert.ok(ps.some(p=>p.lon<34.65&&p.lat<31.8)&&ps.some(p=>p.lon>34.97&&p.lat>31.8),'Gaza and the West Bank remain visible');
  choose('FJI');await settled();assertScope(G,['FJI']);
  const fiji=G.storyBorderEntities('FJI').map(e=>e.polyline.positions);
  assert.ok(fiji.flat().some(p=>p.lon< -179)&&fiji.flat().some(p=>p.lon>179));
  assert.ok(fiji.every(line=>line.slice(1).every((p,i)=>Math.abs(p.lon-line[i].lon)<180&&
    !(Math.abs(p.lon)===180&&Math.abs(line[i].lon)===180))),'the dateline seam is not a country border');
});

test('if a fine pack fails, a two-country view retains both working coarse outlines',async()=>{
  const {G}=harness({atlas:true,onFetch:name=>{if(name===atlasRoot+'BEL-0.json')throw Error('offline');}});
  await G.loadBorders();G.overviewMode=false;
  G.selectCountryOverviewBordersBatch(['BEL','NLD']);await settled();
  assertScope(G,['BEL','NLD']);assert.equal(G.v52DetailedBorders.getDiagnostics().lines,0);
  G.selectCountryOverviewBorders('NLD');await settled();
  assert.equal(G.v52DetailedBorders.getDiagnostics().segments,842);
});


test('French country polygons, national outlines and flash exclude overseas territories',async()=>{
  const {G}=harness();await G.loadBorders();
  const f=G.countries.get('FRA')?.feature,coordinates=f?.geometry?.coordinates||[];
  assert.equal(f?.geometry?.type,'MultiPolygon');
  assert.equal(coordinates.length,2,'mainland France and Corsica must remain, French Guiana removed');
  const all=coordinates.flatMap(poly=>poly[0]);
  assert.ok(all.length>40,'full mainland outline should remain detailed');
  assert.ok(all.every(([lon,lat])=>lon>=-7&&lon<=11&&lat>=40&&lat<=52.5));
  assert.ok(!all.some(([lon,lat])=>lon < -40&&lat < 10));
  const recorded=G.countries.get('FRA').entities.flatMap(e=>
    e.polyline?.positions||[]).filter(Boolean);
  assert.ok(recorded.length>20);
  assert.ok(recorded.every(p=>p.lon>=-7&&p.lon<=11&&p.lat>=40&&p.lat<=52.5));
  installNews(G,[story('FRA')]);G.focus(0);assertScope(G,['FRA']);
  assert.ok(G.borderEntities.filter(e=>e.show).every(e=>
    e.polyline.positions.every(p=>p.lon>=-7&&p.lon<=11&&p.lat>=40&&p.lat<=52.5)),
  'White national border must never include French overseas territory');
  // Mock fixture omits Cesium label rendering; geometry and border behavior remain real.
  G.label=()=>null;
  G.flashCountry('FRA',story('FRA'));
  assert.equal(G.countryFillEntities.length,2,'only mainland France and Corsica must receive clipped territory color');
  assert.equal(G.resolveIso({lon:-52.3,lat:4.1}), '',
    'location inference must not silently reselect French overseas territories');
  assert.equal(G.resolveIso({lon:2.35,lat:48.86}), 'FRA');
});

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
  const initialBorderCount=G.borderEntities.length;
  for(let i=0;i<40;i++) {
    const iso=i%2?'CHN':'USA';G.focus(i%2);G.clearLocal();G.setCountry(iso==='CHN'?'USA':'CHN',true);
    assertScope(G,[iso]);
  }
  assert.equal(G.borderEntities.length,initialBorderCount,'navigation must not recreate or leak border entities');
  assert.ok(initialBorderCount>8000,'real world borders must not be truncated');
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

test('New Mexico city story never turns the US state into Mexico country borders',async()=>{
  const {G}=harness();await G.loadBorders();
  const n={...story('USA','美国新墨西哥州隐私处罚'),sceneMode:'CITY',placeType:'city',
    location:'New Mexico',focusLabel:'新墨西哥州',lon:-106.65,lat:35.08,
    secondaryCountryIso3:'MEX',scenePlan:{primaryIso3:'USA',contextCountries:['MEX']}};
  installNews(G,[n]);G.focus(0);assertScope(G,['USA']);
  assert.deepEqual(visibleCountries(G),['USA']);
});

test('local diplomatic partner context does not add off-camera country borders',async()=>{
  const {G}=harness();await G.loadBorders();
  const n={...story('CHN','喀什与吉尔吉斯斯坦开展合作'),sceneMode:'POINT',
    placeType:'city',location:'喀什',focusLabel:'喀什',lon:75.99,lat:39.47,
    scenePlan:{primaryIso3:'CHN',contextCountries:['KGZ'],showPartnerCountryOverview:true}};
  installNews(G,[n]);G.focus(0);assertScope(G,['CHN']);
});

test('Gaza regional outline is loaded from a real polygon and selected with West Bank',async()=>{
 const {G,context}=harness();
 const gaza=JSON.parse(source('news-globe-gaza-strip-outline-v1.geojson'));
 const singapore=JSON.parse(source('news-globe-singapore-outline-v1.geojson'));
 context.fetch=async url=>({ok:true,json:async()=>structuredClone(
    String(url).includes('singapore-outline')?singapore:gaza)});
 await G.loadBorders();
 const pieces=G.countries.get('PSE').entities.filter(e=>e.__v52GazaOutline);
 assert.equal(pieces.length,1);
 assert.equal(pieces[0].polyline.width,1.65);
 assert.equal(G.countries.get('PSE').feature.geometry.type,'MultiPolygon');
 assert.equal(G.countries.get('PSE').feature.geometry.coordinates.length,2,'PSE camera must contain both West Bank and Gaza');
 const points=pieces[0].polyline.positions;
 assert.ok(points.length>=12&&points.every(p=>p.lon>=34.1&&p.lon<=34.8&&p.lat>=31.1&&p.lat<=31.8));
 const west=G.countries.get('PSE').entities.filter(e=>!e.__v52GazaOutline);
 assert.ok(west.length>0,'original West Bank boundary must remain');
 installNews(G,[story('PSE','希伯伦拆迁事件')]);G.focus(0);
 assert.equal(pieces[0].show,true,'Gaza must be white when PSE story selected');
 assertScope(G,['PSE']);
 installNews(G,[story('IDN','印尼天然气出口')]);G.focus(0);
 assert.equal(pieces[0].show,false,'Gaza outline must hide for unrelated stories');
});

test('country overview paints clipped red territory inside white border and pairs flag with name',async()=>{
 const {G}=harness();await G.loadBorders();
 G.v52FlagIso2={IDN:'id',SGP:'sg'};
 G.label=(text,lon,lat)=>G.viewer.entities.add({position:{lon,lat},label:{text,pixelOffset:{x:0,y:0}}});
 installNews(G,[story('IDN','印尼最新报道')]);G.focus(0);
 G.flashCountry('IDN',story('IDN'));
 assert.ok(G.countryFillEntities.length>0,'single country must receive clipped red interior');
 assert.ok(G.countryFillEntities.every(e=>!!e.polygon?.hierarchy),'filled geometry must be polygons, not red border strokes');
 assert.ok(G.countryLabelEntity?.label,'country name remains visible');
 assert.ok(G.countryFlagEntity?.billboard,'country name must have an adjacent national flag');
 const f=G.countryFlagEntity.billboard.pixelOffset;
 const l=G.countryLabelEntity.label.pixelOffset;
 assert.ok(f.x<0&&l.x>0,'label and flag must be on different sides of same center');
 assert.ok(G.countries.get('IDN').entities.some(e=>e.show===true));
 assert.ok(G.countries.get('IDN').entities.every(e=>e.polyline.width<=2),
  'white national border must stay thin without full-territory red outline');
});
test('explicit dual-country border scoping shows only Singapore and Indonesia',async()=>{
 const {G,context}=harness();
 const singapore=JSON.parse(source('news-globe-singapore-outline-v1.geojson'));
 const gaza=JSON.parse(source('news-globe-gaza-strip-outline-v1.geojson'));
 context.fetch=async url=>({ok:true,json:async()=>structuredClone(
    String(url).includes('singapore-outline')?singapore:gaza)});
 await G.loadBorders();
 installNews(G,[story('IDN')]);G.focus(0);
 assert.ok(G.countries.get('SGP')?.feature?.geometry,'Singapore must be a real country polygon');
 assert.equal(G.selectCountryOverviewBordersBatch(['SGP','IDN']),true);
 assertScope(G,['SGP','IDN']);
 assert.equal(G.selectCountryOverviewBorders('IDN'),true);
 assertScope(G,['IDN']);
});

test('all sovereign fills follow globe curvature across continents and islands, never flat chord triangles',async()=>{
 const {G,context}=harness();
 const singapore=JSON.parse(source('news-globe-singapore-outline-v1.geojson'));
 const gaza=JSON.parse(source('news-globe-gaza-strip-outline-v1.geojson'));
 context.fetch=async url=>({ok:true,json:async()=>structuredClone(
   String(url).includes('singapore-outline')?singapore:gaza)});
 await G.loadBorders();
 // Geometry-only harness has no text-label renderer.
 G.label=()=>null;
 G.overviewMode=false;G.started=true;
 // Representative large states, small states and fractured archipelagos.
 for(const iso of ['CHN','USA','RUS','BRA','KAZ','AUS','IDN','JPN','SGP','PSE']){
   const entry=G.countries.get(iso);
   assert.ok(entry?.feature?.geometry,'country geometry missing: '+iso);
   G.flashCountry(iso,{countryIso3:iso,scenePlan:{primaryIso3:iso}});
   const fills=G.countryFillEntities;
   const polies=entry.authoritativeOutline?.geometry||entry.feature.geometry;
   const polygons=polies.type==='MultiPolygon'?polies.coordinates.length:1;
   assert.equal(fills.length,polygons,iso+' must fill ALL mainland/island parts');
   assert.ok(fills.every(e=>e.__v52TerritoryFill&&e.polygon?.hierarchy),
     iso+' colour must be clipped to the actual country shape');
   assert.ok(fills.every(e=>e.polygon?.height===13500&&e.polygon?.perPositionHeight===false),
     iso+' must use globe-curved fixed-height tessellation, never flat triangles');
   assert.ok(fills.every(e=>e.polygon?.arcType===1&&e.polygon?.outline===false),
     iso+' fill must follow geodesics and leave the white border independent');
   assert.ok(entry.entities.some(e=>e.show&&e.polyline),
     iso+' border line must remain visible above coloured interior');
 }
});
