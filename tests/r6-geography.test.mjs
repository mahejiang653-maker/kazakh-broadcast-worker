import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

const source=fs.readFileSync(new URL('../public/news-globe-v52-geographic-features.js',import.meta.url),'utf8');
function harness(fetcher,options={}){
  const values=[],events=[],handlers={};
  const G={navSerial:1,overviewMode:false,current:0,markers:[{show:true}],pulses:[{show:true}],
    validate:()=>[],updateOcclusion(){this.markers[0].show=true;this.pulses[0].show=true;},
    clearLocal(){for(const e of this.localHighlightEntities) this.viewer.entities.remove(e);this.localHighlightEntities=[];},localHighlightEntities:[],borderEntities:[],loadBorders:async()=>{},
    viewer:{resolutionScale:2.2,scene:{globe:{depthTestAgainstTerrain:true,maximumScreenSpaceError:.75},msaaSamples:4},clock:{currentTime:0},entities:{add:e=>{values.push(e);return e;},remove:e=>{const i=values.indexOf(e);if(i>=0)values.splice(i,1);}},
      camera:{moveEnd:{addEventListener:f=>{events.push(f);return ()=>events.splice(events.indexOf(f),1);}},positionCartographic:{height:3000000}}}};
  const C={EllipsoidTerrainProvider:class {},Math:{toDegrees:r=>r*180/Math.PI},Ellipsoid:{WGS84:{scaleToGeodeticSurface:p=>({...p,height:0})}},ArcType:{GEODESIC:1},
    Color:{fromCssColorString:css=>({css})},PolylineOutlineMaterialProperty:class {constructor(options){Object.assign(this,options);}}};
  if(options.initViewer)G.initViewer=options.initViewer;
  if(options.imageryLayers)G.viewer.imageryLayers=options.imageryLayers;
  const context=vm.createContext({window:{NG14:G,Cesium:C,addEventListener(name,fn){handlers[name]=fn;}},fetch:fetcher,console,
    setTimeout,clearTimeout,AbortController,AbortSignal,DOMException,URLSearchParams,Blob,Response,DecompressionStream});
  vm.runInContext(source,context);return {G,C,values,events,handlers};
}
test('a country field cannot replace an explicit city label',()=>{
  const {G}=harness();
  assert.equal(G.v52PlaceLabel({city:'北京',focusLabel:'中国',countryIso3:'CHN'}),'北京');
  assert.equal(G.v52PlaceLabel({focusLabel:'斯德哥尔摩',country:'瑞典'}),'斯德哥尔摩');
  assert.equal(G.v52PlaceLabel({focusLabel:'中国',countryIso3:'CHN',lon:116.4,lat:39.9}),'中国','Do not invent Beijing from a country anchor');
});
test('geographic intent follows the place and geometry, not incidental headline words',()=>{
  const {G}=harness(),kind=G.v52Geography.kind;
  for(const [name,k] of [['独库公路','road'],['天山山脉','mountain'],['天山天池景区','scenic'],['赛里木湖','water'],['京杭运河','water']]) assert.equal(kind({location:name}),k);
  assert.equal(kind({title:'北京公布公路建设政策',location:'北京'}),null);
  assert.equal(kind({location:'Research Institute'}),null);
  assert.equal(kind({location:'河内',placeType:'城市'}),null);
  assert.equal(kind({location:'黄河'}),'water');
  assert.equal(kind({sceneMode:'AREA',focusBounds:[170,-10,-170,10]}),'area');
});
test('imports reject invalid shapes while accepting polygon holes and dateline bounds',()=>{
  const {G}=harness(),p=G.v52Geography;
  const shell=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[2,2],[2,3],[3,3],[3,2],[2,2]];
  assert.ok(p.geometry({type:'Polygon',coordinates:[shell,hole]}));
  for(const g of [{type:'LineString',coordinates:[[181,0],[0,0]]},{type:'LineString',coordinates:[[null,0],[0,0]]},{type:'Polygon',coordinates:[shell.slice(0,-1)]}]) {
    assert.equal(p.geometry(g),null);assert.equal(G.validate({news:[{focusGeometry:g}]}).length,1);
  }
  assert.ok(p.explicit({focusBounds:[170,-10,-170,10]}));
  const keys=p.tileKeys({west:179*Math.PI/180,east:-179*Math.PI/180,south:0,north:.01});
  assert.deepEqual([...keys],['35_9','0_9']);
});
test('all existing national lines move to the surface without moving attack trajectories',async()=>{
  const {G,C}=harness();const border={polyline:{positions:[{height:18000},{height:22000}]}};
  const attack={polyline:{positions:[{height:700000}]}};G.borderEntities=[border];
  await G.loadBorders();assert.ok(border.polyline.positions.every(p=>p.height===0));
  assert.equal(border.polyline.clampToGround,true);assert.equal(attack.polyline.positions[0].height,700000);
  G.viewer.terrainProvider=new C.EllipsoidTerrainProvider();
  await G.loadBorders();assert.equal(border.polyline.clampToGround,false,'Flat surface does not need expensive terrain projection');
  assert.ok(border.polyline.positions.every(p=>p.height===0));
});
test('roads, bays, water and scenic places use red points without any shape query',async()=>{
  let queries=0;
  const {G,values}=harness(()=>{queries++;throw new Error('Point display must not query geometry');});
  for(const location of ['独库公路','墨西哥湾','霍尔木兹海峡','赛里木湖','天山山脉','天山天池景区']){
    assert.equal(await G.v52RenderGeographicFeature({location,lon:80,lat:40,focusBounds:[79,39,81,41]},1),false);
    G.updateOcclusion();assert.equal(G.markers[0].show,true);assert.equal(G.pulses[0].show,true);
  }
  assert.equal(queries,0);assert.equal(values.length,0);
  assert.equal(G.v52Geography.getDiagnostics().featureDisplay,'point');
  assert.equal(G.v52Geography.getDiagnostics().areaActive,false);
});
test('surface lines ignore tile depth while preserving the original rendering quality',async()=>{
  let queries=0;
  const {G}=harness(()=>{queries++;throw new Error('No reference route preload in point mode');},{initViewer:async()=>42});
  assert.equal(await G.initViewer(),42);
  assert.equal(G.viewer.scene.globe.depthTestAgainstTerrain,false);
  assert.deepEqual([G.viewer.resolutionScale,G.viewer.scene.globe.maximumScreenSpaceError,G.viewer.scene.msaaSamples],[2.2,.75,4]);
  assert.equal(queries,0);
});
test('shipped Duku reference is a full WGS84 route and border tiles omit China replacement',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../public/news-globe-geography-v1.json',import.meta.url)));
  const route=data.features['duku-highway'];assert.equal(route.geometry.type,'LineString');
  assert.equal(route.precision,'reference-route');assert.match(route.sourceURL,/3631/);
  assert.ok(route.geometry.coordinates.length>500);
  const lat=route.geometry.coordinates.map(p=>p[1]);assert.ok(Math.max(...lat)>44.2&&Math.min(...lat)<41.8);
  const detail=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/news-globe-detail-borders-v1/14.json.gz',import.meta.url))));
  assert.equal(detail.license,'public domain');assert.match(detail.chinaOutline,/retained/);
  assert.ok(detail.tiles['19_14'].length>10,'Stockholm tile contains detailed coastlines');
});
test('border viewport reuse and off-screen culling preserve dateline coverage',()=>{
  const {G}=harness(),p=G.v52Geography;
  const coverage={w:178,e:183,s:-5,n:5};
  assert.equal(p.containsView(coverage,{w:-180,e:-178,s:-1,n:1}),true);
  assert.equal(p.containsView(coverage,{w:170,e:179,s:-1,n:1}),false);
  assert.equal(p.lineInView([[-179,0],[-178,1]],coverage),true);
  assert.equal(p.lineInView([[140,0],[141,1]],coverage),false);
  assert.equal(p.lineInView([[179,6],[180,7]],coverage),false);
});
test('satellite errors retry at most twice, leave metadata errors alone, and release listeners',async()=>{
  const event=()=>({listeners:new Set(),addEventListener(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);},emit(e){for(const fn of this.listeners)fn(e);}});
  const errors=event(),added=event(),layer={imageryProvider:{errorEvent:errors}};
  const {G,handlers}=harness(async()=>({ok:true,json:async()=>({features:{}})}),{
    initViewer:async()=>42,imageryLayers:{length:1,get:()=>layer,layerAdded:added},
  });
  assert.equal(await G.initViewer(),42);added.emit(layer);assert.equal(errors.listeners.size,1);
  const first={x:1,y:2,level:3,timesRetried:0};errors.emit(first);assert.equal(first.retry,true);
  const exhausted={x:1,y:2,level:3,timesRetried:2};errors.emit(exhausted);assert.equal(exhausted.retry,false);
  const metadata={timesRetried:0};errors.emit(metadata);assert.equal(metadata.retry,undefined);
  handlers.pagehide({persisted:false});assert.equal(errors.listeners.size,0);assert.equal(added.listeners.size,0);
});
