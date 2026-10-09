import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const province={location:'新疆维吾尔自治区',focusLabel:'新疆',placeType:'自治区',lon:87.6,lat:43.8};
const story=()=>({sceneMode:'POINT',countryIso3:'CHN',scenePlan:{primaryIso3:'CHN'},focusLabel:'独库公路',location:'新疆独库公路',lon:84.4,lat:43.15,adminChain:[{...province}]});

function harness({areaDelay=0}={}){
  let now=0,nextId=0,flight=null;
  const timers=new Map(),values=[],frames=[],flights=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',children:[],classList:{remove(){},add(){},toggle(){}}});return nodes.get(id);};
  const later=(fn,delay=0)=>{const id=++nextId;timers.set(id,{fn,at:now+delay});return id;};
  const color={withAlpha(){return this;}};
  const C={
    Color:{fromCssColorString:()=>color,BLACK:color,WHITE:color,TRANSPARENT:color},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},
    Cartesian2:class{constructor(x,y){this.x=x;this.y=y;}},
    BoundingSphere:class{static fromPoints(points){return {points,radius:1000000};}},
    PolygonHierarchy:class{constructor(positions){this.positions=positions;}},
    HeadingPitchRange:class{},Math:{toRadians:x=>x*Math.PI/180},
    CallbackProperty:class{constructor(fn){this.fn=fn;}getValue(){return this.fn();}},
    ColorMaterialProperty:class{constructor(color){this.color=color;}},
    LabelStyle:{FILL_AND_OUTLINE:1},HorizontalOrigin:{CENTER:1},VerticalOrigin:{CENTER:1},
  };
  const G={navSerial:1,current:0,started:true,overviewMode:false,playing:false,$:node,news:Array.from({length:13},story),meta:{},
    markers:[],pulses:[],borderEntities:[],chinaSpecialEntities:[],countryFillEntities:[],localHighlightEntities:[],areaCache:new Map(),
    resolveIso:n=>n.countryIso3,collect:g=>g.coordinates[0],clearInteractionEffects(){},clearSecondaryCountry(){},pulsePhase:0};
  function fly(kind,options){
    if(flight){timers.delete(flight.timer);flight.options.cancel?.();}
    const item={kind,options,at:now,serial:G.navSerial,labels:values.filter(e=>e.label).map(e=>e.label.text)};flights.push(item);
    const f={options,timer:later(()=>{if(flight===f)flight=null;options.complete?.();},100)};flight=f;
  }
  G.viewer={entities:{values,add(e){values.push(e);return e;},remove(e){const i=values.indexOf(e);if(i>=0)values.splice(i,1);}},
    camera:{flyTo:options=>fly('point',options),flyToBoundingSphere:(_,options)=>fly('fit',options)}};
  G.countries=new Map([['CHN',{feature:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[73,18],[135,18],[135,54],[73,54],[73,18]]]}},entities:[]}]]);
  const context=vm.createContext({window:{NG14:G,Cesium:C},Cesium:C,document:{getElementById:()=>null},console,
    setTimeout:later,clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id),performance:{now:()=>now}});
  for(const file of ['news-globe-v14-ui.js','news-globe-v14-highlight.js','news-globe-v14-v51-scene-engine.js','news-globe-v52-hard-rules.js'])vm.runInContext(source(file),context);
  G.resolveArea=async()=>{if(areaDelay)await new Promise(r=>later(r,areaDelay));return {geometry:{type:'Polygon',coordinates:[[[73,36],[96,36],[96,49],[73,49],[73,36]]]}};};
  G.drawAdminArea=()=>G.clearLocal();G.flyArea=()=>{};
  const snapshot=()=>{const names=values.filter(e=>e.label).map(e=>e.label.text);if(JSON.stringify(names)!==JSON.stringify(frames.at(-1)?.names))frames.push({at:now,names});};
  async function flush(){for(let i=0;i<30;i++)await Promise.resolve();snapshot();}
  async function advance(ms){const end=now+ms;await flush();for(;;){const due=[...timers].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();await flush();}now=end;await flush();}
  return {G,values,frames,flights,nodes,flush,advance,get now(){return now;}};
}

test('play/pause resumes a selected story without restarting focus or its label stage',()=>{
  const h=harness();let focused=0,scheduled=0;
  h.G.focus=()=>{focused++;};h.G.schedule=()=>{scheduled++;};
  h.G.play();assert.equal(focused,0);assert.equal(scheduled,1);assert.equal(h.G.navSerial,1);
  h.G.play();assert.equal(scheduled,1,'duplicate play must not add a timer');
  h.G.pause();h.G.play();assert.equal(focused,0);assert.equal(scheduled,2);
  assert.equal(h.nodes.get('play').textContent,'暂停');
});

test('play still starts a scene from the initial globe and from overview',()=>{
  for(const [started,overviewMode,current,expected] of [[false,true,7,0],[true,true,7,7]]){
    const h=harness();Object.assign(h.G,{started,overviewMode,current});let index;
    h.G.focus=i=>{index=i;};h.G.schedule=()=>{};h.G.play();assert.equal(index,expected);
  }
});

test('country, province and road labels hand over once without a rendered empty stage',async()=>{
  const h=harness({areaDelay:600}),n=story(),run=h.G.runSequence(n,'CHN',1);
  await h.advance(10000);assert.equal(await run,true);
  assert.deepEqual(h.frames.map(f=>f.names),[['中国'],['新疆'],['独库公路']]);
  assert.ok(h.flights.find(f=>f.kind==='point').labels.includes('独库公路'),'destination label must exist throughout the arrival flight');
  const point=h.values.find(e=>e.point),label=h.values.find(e=>e.label);
  assert.deepEqual(label.position,point.position,'the place name must share its red point anchor at tilted camera angles');
});

test('an imported scenePlan hierarchy does not play the country intro a second time',async()=>{
  const h=harness(),n=story();n.scenePlan.adminChain=[{...province}];
  const run=h.G.runSequence(n,'CHN',1);await h.advance(15000);assert.equal(await run,true);
  assert.deepEqual(h.frames.map(f=>f.names),[['中国'],['新疆'],['独库公路']]);
  assert.equal(h.flights.filter(f=>f.kind==='fit').length,1,'the hierarchy owner already presented the country');
  assert.equal(n.scenePlan.hierarchyPresented,undefined,'temporary handoff state must not mutate imported story data');
});

test('starting play while the province label is visible leaves the serial and scene intact',async()=>{
  const h=harness(),run=h.G.runSequence(story(),'CHN',1);await h.advance(1000);
  assert.deepEqual(h.frames.at(-1).names,['新疆']);
  h.G.schedule=()=>{};h.G.play();assert.equal(h.G.navSerial,1);
  await h.advance(9000);assert.equal(await run,true);
  assert.deepEqual(h.frames.map(f=>f.names),[['中国'],['新疆'],['独库公路']]);
});

test('a canceled pending province lookup cannot replace the next story label',async()=>{
  const h=harness({areaDelay:1000}),old=h.G.runSequence(story(),'CHN',1);await h.advance(800);
  h.G.navSerial=2;const n={...story(),adminChain:[],focusLabel:'北京',location:'北京',lon:116.4,lat:39.9};
  const current=h.G.runSequence(n,'CHN',2);await h.advance(10000);
  await old;assert.equal(await current,true);
  assert.ok(!h.frames.some(f=>f.names.includes('新疆')));assert.deepEqual(h.frames.at(-1).names,['北京']);
  const before=[...h.values];assert.equal(await h.G.runSequence(story(),'CHN',1),false);assert.deepEqual(h.values,before);
});

test('a late admin hold cannot clear the label owned by a newer navigation',async()=>{
  const h=harness(),old=h.G.flashAdmin(province,'CHN',1,500);await h.flush();
  assert.deepEqual(h.frames.at(-1).names,['新疆']);
  h.G.navSerial=2;h.G.clearLocal();h.G.localLabelEntity=h.G.label('北京',116.4,39.9,'country');
  await h.advance(2000);assert.equal(await old,false);assert.deepEqual(h.frames.at(-1).names,['北京']);
});
