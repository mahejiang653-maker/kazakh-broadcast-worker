import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const ui = read('news-globe-v14-ui.js');
const adapter = read('news-globe-v52-daily10.js');
const legacyData = read('news-globe-data-20260920-v52-r1.js');
const modes = ['POINT', 'COUNTRY', 'DUAL_COUNTRY', 'MISSILE_ATTACK', 'DRONE_ATTACK', 'BORDER_CONFLICT'];

const story = (id, mode = 'POINT') => ({
  id, title: '新闻 ' + id, location: id === 1 ? '北京' : '地点 ' + id,
  lon: 116 + id * .1, lat: 39 + id * .1,
  focusLabel: id === 1 ? '北京' : '地点 ' + id,
  countryIso3: 'CHN', sceneMode: mode, scenePlan: {primaryIso3: 'CHN'}
});
function daily(news, day = '2026-10-12') {
  const previous = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0,10);
  return {meta: {date: day, edition: 'daily-10', dataLock: day.replaceAll('-','') + '-LOCK10',
    windowStart: previous + 'T13:00:00+08:00', windowEnd: day + 'T13:00:00+08:00'},
    news};
}
function harness({news = Array.from({length:13},(_,i)=>story(i+1,modes[i%modes.length])),
  date='2026-10-11', lock='20261011-LOCK13',now='2026-10-12T11:00:00Z',
  saved = null} = {}) {
  const nodes = new Map(), timers = new Map(), arcs = [], visited = [], sceneKinds = [];
  let nextId = 0, lastSaved = null, overviewCount = 0;
  const storage = new Map();
  if(saved)storage.set('news-globe-v52-daily10-current',JSON.stringify(saved));
  function node(id){
    if (!nodes.has(id)) {
      const v={textContent:'',value:'',children:[],style:{},title:'',
        classList:{add(){},remove(){},toggle(){}},
        appendChild(child){this.children.push(child);return child;}};
      Object.defineProperty(v,'innerHTML',{set(){this.children=[];},get(){return '';}});
      nodes.set(id,v);
    }
    return nodes.get(id);
  }
  class FixedDate extends Date {static now(){return Date.parse(now);}}
  const C={Cartesian3:{fromDegrees(){return {};}},
    Math:{toRadians:x=>x}};
  const G={
    demo:news, meta:{date}, DAILY_LOCK:lock, DATA_KEY:'legacy-key',
    news,started:false,overviewMode:true,current:0,navSerial:0,
    markers:[],pulses:[],borderEntities:[],chinaSpecialEntities:[],
    areaCache:new Map(),playing:false,$:node,
    viewer:{camera:{flyTo(){overviewCount++;}},entities:{remove(){}}},
    loadStored(){try{return JSON.parse(storage.get(this.DATA_KEY)||'null')}catch{return null}},
    resolveIso:n=>n?.countryIso3 || 'CHN',
    storyCountryName:()=> '中国',
    clearCountry(){},clearLocal(){},selectStoryBorders(){},updateOcclusion(){},
    runSequence(n){visited.push(n.id);sceneKinds.push(n.sceneMode);},
  };
  const document={getElementById:node,createElement:()=>node('button-'+(++nextId))};
  const context=vm.createContext({window:{NG14:G},Cesium:C,document,Date:FixedDate,
    localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){storage.set(k,v);lastSaved=v},removeItem:k=>storage.delete(k)},
    setTimeout(fn){const id=++nextId;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id)},URL,console});
  vm.runInContext(ui,context);
  G.runSequence=n=>{visited.push(n.id);sceneKinds.push(n.sceneMode);};
  G.restyle=()=>{};G.overlays=()=>{};G.showArc=(a,b)=>arcs.push([a,b]);
  G.buildScene=()=>{};
  G.storyDuration=()=>20;
  vm.runInContext(adapter,context);
  return {G,context,node,arcs,visited,sceneKinds,timers,storage,
    drain(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());},
    get overviewCount(){return overviewCount;},get lastSaved(){return lastSaved;}};
}

test('old 13-story file remains readable as archive; daily UI exposes only 10 with a historical warning',()=>{
  const h=harness();
  assert.equal(h.G.getLegacyArchive().news.length,13);
  assert.equal(h.G.news.length,10);
  assert.equal(h.G.demo.length,10);
  assert.equal(h.G.meta.edition,'legacy-13-preview');
  h.G.focus(9);assert.equal(h.G.current,9);
  assert.equal(h.node('eyebrow').textContent,'TOP 10 / 10 · 历史预览');
  assert.equal(h.node('count').textContent,'10 / 10');
  assert.equal(h.node('title').textContent,'新闻 10');
  h.G.buildTimeline();assert.equal(h.node('timeline').children.length,10);
});

test('direct import checks only renderable ten-story data',()=>{
 const h=harness(),pack=daily(Array.from({length:10},(_,i)=>story(i+1)));
 assert.equal(h.G.validate(pack).length,0);
 assert.match(h.G.validate({...pack,news:pack.news.slice(1)}).join('|'),/10条/);
 assert.equal(h.G.validate({...pack,meta:{}}).length,0);
 const broken=JSON.parse(JSON.stringify(pack));broken.news[1].lon=999;
 assert.match(h.G.validate(broken).join('|'),/经度无效/);
});

test('a valid ten-story import takes effect in order and restores in the same Beijing edition',()=>{
  const h=harness();
  h.G.bind();
  h.node('sampleBtn').onclick();
  assert.match(h.node('jsonInput').value,/REPLACE_WITH_DAILY_LOCK/);
  assert.equal(h.G.validate(JSON.parse(h.node('jsonInput').value)).length,0);
  const pack=daily(Array.from({length:10},(_,i)=>story(i+1,modes[i%modes.length])));
  h.node('jsonInput').value=JSON.stringify(pack);
  h.G.applySettings();
  assert.match(h.node('msg').textContent,/已保存/);
  assert.equal(h.G.news.length,10);
  assert.deepEqual(Array.from(h.G.news, n=>n.id),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(h.node('timeline').children.length,10);
  assert.ok(h.lastSaved);
  const again=harness({saved:pack});
  assert.equal(again.G.news.length,10);
  assert.equal(again.G.meta.date,'2026-10-12');
  assert.equal(again.G.meta.historical,undefined);
  assert.equal(again.G.news[9].title,'新闻 10');
});

test('top10 next wraps to top1, top1 previous wraps to top10; no missing top11 is addressed',()=>{
  const h=harness({news:Array.from({length:10},(_,i)=>story(i+1,modes[i%modes.length])),
    date:'2026-10-12',lock:'20261012-LOCK10'});
  assert.equal(h.G.news.length,10);
  h.G.focus(9);
  assert.equal(h.node('eyebrow').textContent,'TOP 10 / 10');
  h.G.navigate(10);assert.equal(h.G.current,0);
  h.G.navigate(-1);assert.equal(h.G.current,9);
  assert.deepEqual(h.arcs,[[9,0],[0,9]]);
  assert.ok(h.visited.every(id=>id>=1&&id<=10));
  assert.equal(h.G.getLegacyArchive(),null);
});

test('automatic playback exits to overview after Top10 without trying index 10',()=>{
  const h=harness();
  h.G.focus(9);h.G.playing=true;h.G.schedule();
  assert.equal(h.timers.size,1);
  const earlier=h.visited.length;h.drain();
  assert.equal(h.visited.length,earlier);
  assert.equal(h.G.overviewMode,true);
  assert.equal(h.G.playing,false);
  assert.equal(h.overviewCount,1);
});

test('rapid navigation preserves indexes and passes all six event modes through unchanged',()=>{
  const h=harness();
  for(let i=0;i<350;i++)h.G.navigate(i%2===0?i:-(i+3));
  for(let i=0;i<10;i++)h.G.focus(i);
  assert.ok(h.visited.length>=350);
  assert.deepEqual(h.sceneKinds.slice(-10),Array.from({length:10},(_,i)=>modes[i%modes.length]));
  assert.ok(h.visited.every(id=>id>0&&id<=10));
  assert.equal(h.G.news[0].focusLabel,'北京');
  assert.equal(h.G.news[0].lon,116.1);
});

test('edition boundary is precisely Beijing 13:00, not midnight or UTC 13:00',()=>{
  const early=harness({now:'2026-10-12T04:59:59Z'});
  assert.equal(early.G.daily10EditionDay(),'2026-10-11');
  const onTime=harness({now:'2026-10-12T05:00:00Z'});
  assert.equal(onTime.G.daily10EditionDay(),'2026-10-12');
  const win=onTime.G.daily10Window('2026-10-12');
  assert.equal(win.start,'2026-10-11T13:00:00+08:00');
  assert.equal(win.end,'2026-10-12T13:00:00+08:00');
});

test('the original historical 13-item data asset is not modified or silently relabeled',()=>{
  const context=vm.createContext({window:{}});
  vm.runInContext(legacyData,context);
  const G=context.window.NG14;
  assert.equal(G.demo.length,13);
  assert.equal(G.DAILY_LOCK,'20261011-LOCK13');
  assert.equal(G.meta.date,'2026-10-11');
  assert.equal(G.demo[12].id,13);
});


test('one v1 DATA LOCK imports with V52 native fields and retains separate report-link associations',()=>{
  const h=harness();
  const p=daily(Array.from({length:10},(_,i)=>({
    ...story(i+1),
    summary:'北京新闻'+(i+1)+'的具体事件事实已核实并披露',
    title:'北京新闻'+(i+1),
    eventType:'policy',placeType:'城市',focusLabel:'北京',
    relatedCountryIso3s:['CHN'],
    sources:[{name:'新华社'}],
    articleUrls:i===0?['https://news.example.org/story','https://news.example.org/followup','https://news.example.org/gallery']:[],
    reportedAt:'2026-10-12T12:02:34+08:00',
    publishedAt:'2026-10-12T12:02:34+08:00'
  })));
  Object.assign(p.meta,{schemaVersion:'news-data-lock/v1',timeZone:'Asia/Shanghai',newsCount:10,imagesPerNews:3});
  assert.deepEqual(Array.from(h.G.validate(p)),[]);
  assert.equal(p.news[0].articleUrls.length,3);
  assert.equal(h.G.daily10Warnings(p).length,0);
  h.node('jsonInput').value=JSON.stringify(p);
  h.G.applySettings();
  assert.match(h.node('msg').textContent,/已保存/);
  assert.equal(h.G.news.length,10);
  assert.equal(h.G.news[0].focusLabel,'北京');
  assert.equal(h.G.news[0].articleUrls[0],'https://news.example.org/story');
  assert.equal(h.G.news[9].id,10);
});
test('direct import ignores editorial verification but rejects unusable coordinates',()=>{
 const h=harness(),p=daily(Array.from({length:10},(_,i)=>story(i+1)));
 p.news[0].reportedAt='2026-10-12';
 p.news[0].articleUrls=[];
 p.news[0].scenePlan={sourceUnconfirmed:true};
 assert.equal(h.G.validate(p).length,0);
 p.news[0].lat=200;
 assert.match(h.G.validate(p).join('|'),/纬度无效/);
});

test('autoplay waits for GPU geometry, the full attack and its final static hold',()=>{
 const h=harness();h.G.focus(1);h.G.playing=true;
 let ready=false;h.G.v52Attack={getDiagnostics:()=>({serial:h.G.navSerial,playbackReady:ready})};
 h.G.schedule();const current=h.G.current;
 h.drain();assert.equal(h.G.current,current);assert.equal(h.timers.size,1);
 h.drain();assert.equal(h.G.current,current);
 ready=true;h.drain();assert.equal(h.G.current,current+1);
 h.G.pause();assert.equal(h.timers.size,0);
});

test('regional area validator rejects malformed news and invalid conflict evidence safely',()=>{
  const h=harness();
  assert.match(h.G.validate({news:{unexpected:true}}).join('|'),/10条/);
  const stories=Array.from({length:10},(_,i)=>story(i+1));
  stories[0]={...stories[0],lon:null,lat:null,geoScope:'REGIONAL',
    scenePlan:{primaryIso3:'UKR',area:{type:'CONFLICT_CONTROL',
      geometry:{type:'Polygon',coordinates:[[[30,48],[31,48],[31,49],[30,49],[30,48]]]},
      sourceUrl:'https://example.org/map',asOf:'2026-10-19',controlledBy:'example'}}};
  assert.equal(h.G.validate(daily(stories)).length,0);
  const bad=JSON.parse(JSON.stringify(stories));
  bad[0].scenePlan.area.geometry.coordinates[0].pop();
  assert.match(h.G.validate(daily(bad)).join('|'),/GeoJSON/);
  bad[0]=JSON.parse(JSON.stringify(stories[0]));
  bad[0].scenePlan.area.asOf='2026-02-30';
  assert.match(h.G.validate(daily(bad)).join('|'),/日期/);
  bad[0]=JSON.parse(JSON.stringify(stories[0]));
  bad[0].scenePlan.area.sourceUrl='http://invalid.test';
  assert.match(h.G.validate(daily(bad)).join('|'),/来源/);
  bad[0]=JSON.parse(JSON.stringify(stories[0]));
  delete bad[0].geoScope;
  assert.match(h.G.validate(daily(bad)).join('|'),/区域场景/);
});

test('direction-only geographic regions accept no coordinate and no invented polygon',()=>{
  const h=harness();
  const stories=Array.from({length:10},(_,i)=>story(i+1));
  stories[0]={...stories[0],lon:null,lat:null,geoScope:'REGIONAL',
    scenePlan:{primaryIso3:'CHN',area:{type:'GEOGRAPHIC_REGION',direction:'NORTHWEST'}}};
  assert.equal(h.G.validate(daily(stories)).length,0);
  stories[0].scenePlan.area.direction='NOT_A_DIRECTION';
  assert.match(h.G.validate(daily(stories)).join('|'),/GeoJSON/);
  stories[0].scenePlan.area.direction='NORTHWEST';
  stories[0].scenePlan.area.geometry={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1]]]};
  assert.match(h.G.validate(daily(stories)).join('|'),/显式区域GeoJSON无效/);
});

test('regional scene retries missing country geometry and cancels pending retry on navigation',async()=>{
  const h=harness();
  const G=h.G;
  const C={
    Cartesian3:{fromDegrees:(lon,lat)=>({lon,lat})},
    PolygonHierarchy:class {constructor(positions,holes=[]){this.positions=positions;this.holes=holes}},
    Color:{fromCssColorString:()=>({withAlpha:()=>({})})},
    BoundingSphere:{fromPoints:points=>({radius:100000,points})},
    HeadingPitchRange:class {constructor(heading,pitch,range){this.range=range}}
  };
  h.context.window.Cesium=C;
  const added=[],removed=[];
  G.viewer={entities:{add:e=>{added.push(e);return e},remove:e=>removed.push(e)},
    camera:{frustum:{fovy:Math.PI/3,aspectRatio:9/16},flyToBoundingSphere(){}}};
  G.countries=new Map();
  const regional={...story(1),geoScope:'REGIONAL',lon:null,lat:null,
    scenePlan:{primaryIso3:'CHN',area:{type:'GEOGRAPHIC_REGION',direction:'NORTHWEST'}}};
  G.navSerial=11;
  await G.runSequence(regional,'CHN',11);
  assert.equal(added.length,0);
  assert.equal(h.timers.size,1);
  G.countries.set('CHN',{feature:{type:'Polygon',coordinates:[[[70,20],[130,20],[130,50],[70,50],[70,20]]]}});
  h.drain();
  assert.ok(added.length>=2,'directional polygon and outline must be rendered');
  assert.ok(G.v52AreaScenes.getDiagnostics().entities>=2);
  G.navSerial=12;
  await G.runSequence({...story(2)},'CHN',12);
  assert.equal(G.v52AreaScenes.getDiagnostics().entities,0);
  assert.equal(removed.length,added.length);
  G.countries.clear();
  G.navSerial=13;
  await G.runSequence(regional,'CHN',13);
  assert.equal(h.timers.size,1);
  G.navSerial=14;
  await G.runSequence({...story(3)},'CHN',14);
  assert.equal(h.timers.size,0,'navigation must cancel pending area retry');
});
