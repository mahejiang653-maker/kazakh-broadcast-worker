import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');

function sceneHarness() {
  const stages = [], admins = [];
  let failAdmin = false;
  const G = {
    news:[], demo:[], navSerial:9, current:0, v52SceneTrace:[],
    chinaLevel1Geo:{features:[{properties:{name_zh:'新疆维吾尔自治区'},
      geometry:{type:'Polygon',coordinates:[[[74,35],[95,35],[95,49],[74,49],[74,35]]]}}]},
    countryName: iso => iso, wait: async () => true,
    runSequence: async (story, iso, serial) => {
      stages.push({mode:story.sceneMode, iso, title:story.title,
        context:story.scenePlan?.contextCountries || [],
        lon:story.lon,lat:story.lat});
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
