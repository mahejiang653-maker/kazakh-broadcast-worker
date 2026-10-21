import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');

function sceneHarness({cancelFirstCountry=false,navigateOnCancel=false}={}) {
  const stages = [], admins = [];
  let failAdmin = false,countryAttempts=0;
  const G = {
    news:[], demo:[], navSerial:9, current:0, v52SceneTrace:[],
    chinaLevel1Geo:{features:[{properties:{name_zh:'新疆维吾尔自治区'},
      geometry:{type:'Polygon',coordinates:[[[74,35],[95,35],[95,49],[74,49],[74,35]]]}}]},
    countryName: iso => iso, wait: async () => true,
    runSequence: async (story, iso, serial) => {
      stages.push({mode:story.sceneMode, iso, title:story.title,
        context:story.scenePlan?.contextCountries || [],
        lon:story.lon,lat:story.lat});
      if(cancelFirstCountry&&story.sceneMode==='COUNTRY'&&++countryAttempts===1){
        if(navigateOnCancel)G.navSerial=serial+1;
        return false;
      }
      return true;
    },
    flashAdmin: async (step,iso) => {
      admins.push({step,iso});
      return !failAdmin;
    }
  };
  vm.runInNewContext(source('news-globe-v52-hard-rules.js'), {
    window:{NG14:G}, document:{getElementById:()=>null}, console
  });
  return {G, stages, admins, setFailAdmin:value => failAdmin=value};
}

test('Top1 China/Russia previews both countries then shows St Petersburg venue', async()=>{
  const h=sceneHarness();
  const story={title:'中俄总理定期会晤',sceneMode:'DIPLOMACY',
    countryIso3:'RUS',lon:30.27,lat:59.8,location:'普尔科沃机场',
    scenePlan:{primaryIso3:'RUS',contextCountries:['CHN'],finalLocation:true}};
  assert.equal(await h.G.runSequence(story,'RUS',9),true);
  assert.deepEqual(h.stages.map(x=>[x.mode,x.iso]),[
    ['COUNTRY','CHN'],['COUNTRY','RUS'],['POINT','']
  ]);
  assert.equal(h.stages.at(-1).lon,30.27);
});

test('Top6 diplomacy returns to Oslo as a geographic point after country previews', async()=>{
  const h=sceneHarness();
  const story={title:'奥斯陆会谈',sceneMode:'DIPLOMACY',
    countryIso3:'NOR',lon:10.7522,lat:59.9139,location:'奥斯陆',
    scenePlan:{primaryIso3:'NOR',contextCountries:['USA','UKR'],finalLocation:true}};
  assert.equal(await h.G.runSequence(story,'NOR',9),true);
  assert.deepEqual(h.stages.map(x=>[x.mode,x.iso]),[
    ['COUNTRY','USA'],['COUNTRY','UKR'],['COUNTRY','NOR'],['POINT','']
  ]);
  assert.equal(h.stages.at(-1).context.length,0);
  assert.equal(h.stages.at(-1).lat,59.9139);
});

test('Top9 Xinjiang area routes into the existing China level-one administrative renderer', async()=>{
  const h=sceneHarness();
  const step={location:'新疆维吾尔自治区',focusLabel:'新疆',placeType:'自治区',lon:85.2,lat:41.5};
  const story={title:'新疆棉花采收进度',sceneMode:'ADMIN_REGION',countryIso3:'CHN',
    lon:85.2,lat:41.5,placeType:'自治区',focusLabel:'新疆',
    scenePlan:{primaryIso3:'CHN',adminChain:[step],finalLocation:false}};
  assert.equal(await h.G.runSequence(story,'CHN',9),true);
  assert.equal(story.noPoint,true);
  assert.deepEqual(h.stages.map(x=>[x.mode,x.iso]),[['COUNTRY','CHN']]);
  assert.equal(h.admins.length,1);
  assert.equal(h.admins[0].step.location,'新疆维吾尔自治区');
  assert.equal(h.admins[0].step.placeType,'自治区');
  assert.equal(h.admins[0].step.focusGeometry.type,'Polygon');
  assert.ok(h.admins[0].step.focusGeometry.coordinates[0].length>=4);
  h.setFailAdmin(true);
  assert.equal(await h.G.runSequence(story,'CHN',9),false,
    'missing polygon must fail rather than silently claim region display');
});

test('country and area summaries never receive fictitious red position markers',()=>{
  const recorded=[];
  const color={withAlpha:()=>({})};
  const C={
    Cartesian3:{fromDegrees:(lon,lat,alt)=>({lon,lat,alt})},
    Color:{fromCssColorString:()=>color, WHITE:color,TRANSPARENT:color},
    CallbackProperty:class {constructor(fn){this.getValue=fn;}},
    ColorMaterialProperty:class {constructor(v){this.value=v;}}
  };
  const news=[
    {sceneMode:'COUNTRY',noPoint:true,lon:-122.4,lat:37.7},
    {sceneMode:'ADMIN_REGION',noPoint:true,lon:85.2,lat:41.5},
    {sceneMode:'POINT',noPoint:false,lon:null,lat:null},
    {sceneMode:'POINT',noPoint:false,lon:30.27,lat:59.8}
  ];
  const G={news,markers:[],pulses:[], $:()=>null, clearArc(){},clearLocal(){},
    viewer:{entities:{add:v=>{recorded.push(v);return v;},remove(){}}}};
  vm.runInNewContext(source('news-globe-v52-locationless-marker-guard.js'),{
    window:{NG14:G,Cesium:C},Cesium:C
  });
  G.buildScene();
  assert.equal(G.markers.length,4);
  assert.equal(G.pulses.length,4);
  assert.equal(G.markers.slice(0,3).every(x=>x===null),true);
  assert.equal(recorded.length,2,'only one true event point gets marker and pulse');
  assert.equal(G.markers[3].position.lon,30.27);
});

test('news transition arcs skip country-only anchors and retain real city routes',()=>{
  const arcs=[],G={news:[
    {noPoint:true,sceneMode:'COUNTRY',lon:-122,lat:37},
    {sceneMode:'POINT',lon:null,lat:null},
    {sceneMode:'POINT',lon:30.27,lat:59.8},
    {sceneMode:'POINT',lon:10.75,lat:59.91}],
    clearArc(){},showArc(a,b){arcs.push([a,b]);}};
  vm.runInNewContext(source('news-globe-v52-navigation-guard.js'),{
    window:{NG14:G},setTimeout:()=>{throw Error('unexpected attach timeout')}
  });
  G.showArc(0,2);
  G.showArc(1,2);
  G.showArc(2,3);
  assert.deepEqual(arcs,[[2,3]]);
});

test('fresh JSON import normalizes area and country news before constructing any red markers',()=>{
  const news=[
    {id:1,title:'Top7 Chinese chips',location:'中国',lon:103.8,lat:35.4,sceneMode:'COUNTRY'},
    {id:2,title:'Top8 Terafab proposal',location:'美国',lon:-122.4,lat:37.7,sceneMode:'COUNTRY'},
    {id:3,title:'Top9 Xinjiang cotton',location:'新疆维吾尔自治区',lon:85.2,lat:41.5,
      sceneMode:'ADMIN_REGION',scenePlan:{primaryIso3:'CHN',adminChain:[{location:'新疆维吾尔自治区'}]}},
    {id:4,title:'Top1 real airport',location:'圣彼得堡机场',lon:30.27,lat:59.8,sceneMode:'POINT'}
  ];
  const input={value:JSON.stringify({news})},snapshots=[];
  const G={
    news:[],demo:[],current:0,navSerial:1,
    $:key=>key==='jsonInput'?input:null,
    validate:()=>[],
    applySettings(){
      this.news=JSON.parse(input.value).news;
      snapshots.push(this.news.map(n=>({mode:n.sceneMode,noPoint:!!n.noPoint,final:n.scenePlan?.finalLocation})));
    },
    runSequence:async()=>true
  };
  vm.runInNewContext(source('news-globe-v52-hard-rules.js'),{
    window:{NG14:G},document:{getElementById:()=>null},console
  });
  G.applySettings();
  assert.equal(snapshots.length,1);
  assert.deepEqual(snapshots[0].map(n=>n.noPoint),[true,true,true,false]);
  assert.deepEqual(snapshots[0].slice(0,3).map(n=>n.final),[false,false,false]);
  assert.deepEqual(snapshots[0].map(n=>n.mode),['COUNTRY','COUNTRY','ADMIN_REGION','POINT']);
});

test('multi-city Gaza event visits both city anchors without inventing an attack midpoint',async()=>{
 const h=sceneHarness();
 const story={title:'加沙两地遇袭',sceneMode:'POINT',countryIso3:'PSE',
   lon:34.466,lat:31.502,location:'加沙城',scenePlan:{primaryIso3:'PSE',finalLocation:true},
   eventSites:[
     {location:'加沙城',label:'加沙城（涉事城市）',lon:34.466,lat:31.502,countryIso3:'PSE'},
     {location:'汗尤尼斯',label:'汗尤尼斯（涉事城市）',lon:34.307,lat:31.345,countryIso3:'PSE'}
   ]};
 assert.equal(await h.G.runSequence(story,'PSE',9),true);
 assert.deepEqual(h.stages.map(x=>[x.title,x.lon,x.lat]),[
   ['加沙两地遇袭',34.466,31.502],
   ['加沙两地遇袭',34.307,31.345]
 ]);
 assert.equal(h.stages[0].context.length,0);
 assert.equal(h.stages[1].context.length,0);
});

test('a same-serial initial flight cancellation is retried once before reaching airport',async()=>{
  const h=sceneHarness({cancelFirstCountry:true});
  const n={title:'圣彼得堡机场',sceneMode:'DIPLOMACY',
    countryIso3:'RUS',lon:30.27,lat:59.8,location:'普尔科沃机场',
    scenePlan:{primaryIso3:'RUS',contextCountries:['CHN'],finalLocation:true}};
  assert.equal(await h.G.runSequence(n,'RUS',9),true);
  assert.deepEqual(h.stages.map(x=>[x.mode,x.iso]),[
    ['COUNTRY','CHN'],['COUNTRY','CHN'],['COUNTRY','RUS'],['POINT','']
  ]);
  assert.equal(h.G.getV52SceneTrace().filter(e=>e.type==='country-camera-retry').length,1);
});
test('a genuine user navigation cancellation must never retry the retired camera scene',async()=>{
  const h=sceneHarness({cancelFirstCountry:true,navigateOnCancel:true});
  const n={title:'圣彼得堡机场',sceneMode:'DIPLOMACY',
    countryIso3:'RUS',lon:30.27,lat:59.8,location:'普尔科沃机场',
    scenePlan:{primaryIso3:'RUS',contextCountries:['CHN'],finalLocation:true}};
  assert.equal(await h.G.runSequence(n,'RUS',9),false);
  assert.deepEqual(h.stages.map(x=>[x.mode,x.iso]),[['COUNTRY','CHN']]);
  assert.equal(h.G.getV52SceneTrace().filter(e=>e.type==='country-camera-retry').length,0);
});
