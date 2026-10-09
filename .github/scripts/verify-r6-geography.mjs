import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {trackConsoleHealth,assertConsoleHealth} from './r6-imagery-recovery.mjs';
const require=createRequire(import.meta.url);
// Playwright 1.55 is pinned by the workflow and already includes this PNG decoder.
const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));

const url=process.env.GLOBE_URL || 'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=process.env.GLOBE_OUTPUT || 'globe-verify-r6-geography';fs.mkdirSync(dir,{recursive:true});
const report={url,localOverrides:!!process.env.GLOBE_LOCAL,environmentProxy:!!process.env.GLOBE_TRUST_PROXY,status:'RUNNING',stories:[],checks:[],errors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
// This opt-in is only for a managed test environment whose provided HTTPS
// proxy certificate is absent from Chromium's trust store. CI uses strict TLS.
const page=await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
if(process.env.GLOBE_SIMULATE_TILE_FAILURE){
  let injected=false;
  await page.route('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/**',route=>{
    const url=route.request().url(),level=Number(new URL(url).pathname.match(/\/tile\/(\d+)\//)?.[1]);
    // The provider probes its highest level before it exists as a layer.
    // Fail a normal rendered tile, after the public error listener is installed.
    if(!injected&&level<=19){injected=true;report.simulatedTileFailure=url;return route.abort('failed');}
    return route.continue();
  });
}
if(process.env.GLOBE_LOCAL){
  const origin=new URL(url).origin,root=path.resolve('public');
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.resolve(root,'.'+pathname);
    if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
      const contentType=file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':file.endsWith('.gz')?'application/gzip':undefined;
      return route.fulfill({status:200,body:fs.readFileSync(file),...(contentType?{contentType}:{})});
    }
    return route.continue();
  });
}
page.on('pageerror',e=>{report.errors.push(e.message);console.error('PAGE_ERROR',e.message);});
trackConsoleHealth(page,report);
page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('[R6 geography]'))console.warn(m.text());});
async function settled(index){
  await page.waitForFunction(index=>{
    const G=window.NG14,C=window.Cesium;if(!G?.viewer||G.current!==index||G.overviewMode||G.viewer.camera._currentFlight)return false;
    const n=G.news[index],geo=G.v52Geography?.getDiagnostics();
    const t=C.JulianDate.now();return G.v51SceneEntities.some(e=>e.point&&e.show!==false&&e.position&&
      C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(n.lon,n.lat))<5000);
  },index,{timeout:60000});
  await page.waitForFunction(()=>NG14.v52Geography.getDiagnostics().detailSettled||NG14.viewer.camera.positionCartographic.height>1800000,null,{timeout:16000}).catch(()=>{});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:12000}).catch(()=>{});
  const state=await page.evaluate(()=>{
    const G=NG14,C=Cesium,t=C.JulianDate.now(),canvas=G.viewer.scene.canvas;
    const labels=G.viewer.entities.values.filter(e=>e.label&&e.show!==false).map(e=>e.label.text.getValue(t));
    const point=G.v51SceneEntities.find(e=>e.point&&e.show!==false&&e.position&&C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(G.news[G.current].lon,G.news[G.current].lat))<5000);
    const color=point?.point.color.getValue(t);
    return {index:G.current,label:G.news[G.current].focusLabel,labels,geo:G.v52Geography.getDiagnostics(),
      aspect:canvas.clientWidth/canvas.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
      redPoint:!!color&&color.red>.8&&color.green<.4&&color.blue<.4,
      localShapes:G.localHighlightEntities.filter(e=>e.polyline||e.polygon).length,
      baseMarker:G.markers[G.current]?.show,basePulse:G.pulses[G.current]?.show,
      borders:G.borderEntities.length,surfaceModeMatches:G.borderEntities.every(e=>e.polyline.clampToGround.getValue(t)===!(G.viewer.terrainProvider instanceof C.EllipsoidTerrainProvider)),
      maxBorderHeight:Math.max(...G.borderEntities.flatMap(e=>e.polyline.positions.getValue(t).slice(0,2)).map(p=>Math.abs(C.Cartographic.fromCartesian(p).height))),
      primitives:G.viewer.scene.groundPrimitives.length,entities:G.viewer.entities.values.length};
  });
  assert.ok(Math.abs(state.aspect-16/9)<.01);assert.equal(state.overflow,false);
  assert.equal(state.surfaceModeMatches,true);assert.ok(state.maxBorderHeight<.01);assert.equal(state.borders,7955);
  assert.equal(state.geo.featureDisplay,'point');assert.equal(state.geo.depthTestAgainstTerrain,false);
  assert.equal(state.geo.areaActive,false);assert.equal(state.localShapes,0);
  assert.equal(state.redPoint,true,'The news location must have a red point');
  return state;
}
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.ok(response.ok());
  console.log('ENTRY_LOADED');
  await page.waitForFunction(()=>window.NG14?.v52Geography?.version==='20261010-r6-thin-points-r5'&&NG14.countries.get('CHN')?.authoritativeOutline&&NG14.__v52FlagsOverviewClean,null,{timeout:90000});
  console.log('BORDERS_READY');
  if(process.env.GLOBE_SIMULATE_TILE_FAILURE)await page.waitForFunction(()=>NG14.v52Geography.getDiagnostics().imageryRetries>0,null,{timeout:15000});
  if(!process.env.GLOBE_VISIBILITY_ONLY){
  const indexes=process.env.GLOBE_INDEXES?process.env.GLOBE_INDEXES.split(',').map(Number):process.env.GLOBE_QUICK?[6,8,10,11,1,2]:Array.from({length:13},(_,i)=>i);
  for(const i of indexes){
    await page.locator('#timeline button').nth(i).click();
    const state=await settled(i);report.stories.push(state);
    if(i===10)assert.ok(state.labels.includes('北京'),'Beijing city label missing');
    if([1,2,11].includes(i))assert.ok(state.labels.includes(state.label),'The point label should not contain a shape annotation');
    await page.screenshot({path:dir+'/top-'+String(i+1).padStart(2,'0')+'.png',fullPage:true});
    console.log('TOP_'+(i+1)+'_PASS',JSON.stringify(state.geo));
  }
  for(const [width,height] of [[360,800],[800,360],[1280,720]]){
    console.log('VIEWPORT_START',width,height);
    await page.setViewportSize({width,height});
    await page.locator('#timeline button').nth(11).click();
    report.checks.push({name:'duku-point-'+width+'x'+height,state:await settled(11)});
    await page.screenshot({path:dir+'/duku-point-'+width+'x'+height+'.png',fullPage:true});
    console.log('VIEWPORT_PASS',width,height);
  }
  for(let i=0;i<20;i++){await page.locator('#next').click();await page.locator('#prev').click();}
  await page.locator('#timeline button').nth(10).click();
  report.checks.push({name:'40-rapid-clicks',state:await settled(10)});
  await page.locator('#all').click();await page.waitForTimeout(5500);
  const overview=await page.evaluate(()=>({geo:NG14.v52Geography.getDiagnostics(),local:NG14.localHighlightEntities.length,
    scenes:NG14.v51SceneEntities.length,visibleBorders:NG14.borderEntities.filter(e=>e.show).length}));
  assert.equal(overview.geo.detailEntities,0);assert.equal(overview.geo.moveListener,false);
  assert.equal(overview.geo.areaActive,false);assert.equal(overview.local,0);assert.equal(overview.scenes,0);
  report.checks.push({name:'overview-cleanup',state:overview});
  }else{await page.locator('#all').click();await page.waitForTimeout(5500);}
  // Render a zero-height line in isolation and sample its actual pixels. Also
  // verify that ignoring terrain depth does not expose the far side of Earth.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const v=NG14.viewer,C=Cesium;
    v.camera.setView({destination:C.Cartesian3.fromDegrees(34,50,500000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
    v.scene.requestRender();
  });
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:12000}).catch(()=>{});
  await page.evaluate(()=>{
    const v=NG14.viewer,C=Cesium,positions=C.Cartesian3.fromDegreesArray([32,50,36,50]);
    const arc=C.Cartesian3.unpackArray(C.PolylinePipeline.generateArc({positions})),samples=[];
    for(let i=1;i<arc.length;i++)for(const f of [.2,.5,.8])samples.push(C.Cartesian3.lerp(arc[i-1],arc[i],f,new C.Cartesian3()));
    const material=C.Material.fromType('PolylineOutline',{color:C.Color.fromCssColorString('#e6f3ff'),outlineColor:C.Color.fromCssColorString('#06121e'),outlineWidth:.09});
    // A synchronous primitive isolates depth behavior from entity updater startup.
    const make=(positions,width,material)=>v.scene.primitives.add(new C.Primitive({show:false,cull:false,allowPicking:false,asynchronous:false,
      geometryInstances:new C.GeometryInstance({geometry:new C.PolylineGeometry({positions,width,arcType:C.ArcType.GEODESIC,vertexFormat:C.PolylineMaterialAppearance.VERTEX_FORMAT})}),
      appearance:new C.PolylineMaterialAppearance({material,translucent:false})}));
    window.__borderProbe={samples,make,front:make(positions,.65,material)};
  });
  const frame=async()=>{
    await page.evaluate(()=>new Promise(resolve=>{const v=NG14.viewer,remove=v.scene.postRender.addEventListener(()=>{remove();resolve();});v.scene.requestRender();}));
    // Read the presented browser frame: a WebGL drawing buffer may already have
    // been cleared by the time a canvas-to-canvas copy occurs.
    const buffer=await page.locator('#globe canvas').screenshot();
    return {buffer,png:PNG.sync.read(buffer),samples:await page.evaluate(()=>window.__borderProbe.samples.map(p=>{
      const v=NG14.viewer,w=Cesium.SceneTransforms.worldToWindowCoordinates(v.scene,p);
      return [w.x/v.scene.canvas.clientWidth,w.y/v.scene.canvas.clientHeight];
    }))};
  };
  const neighborhoods=frame=>frame.samples.map(([x,y])=>{
    const {width,height,data}=frame.png,cx=Math.round(x*width),cy=Math.round(y*height),pixels=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const k=((cy+dy)*width+cx+dx)*4;pixels.push([data[k],data[k+1],data[k+2]]);}return pixels;
  });
  const hits=(frame,base)=>{const pixels=neighborhoods(base);return neighborhoods(frame).map((a,i)=>a.some((c,j)=>c.every((value,k)=>value-pixels[i][j][k]>10))).filter(Boolean).length;};
  const magenta=frame=>{const data=frame.png.data;let hits=0;for(let i=0;i<data.length;i+=4)if(data[i]>160&&data[i+1]<80&&data[i+2]>160)hits++;return hits;};
  const base=await frame();await page.evaluate(()=>{window.__borderProbe.front.show=true;});const visible=await frame();
  fs.writeFileSync(dir+'/border-near-proof.png',visible.buffer);
  await page.evaluate(()=>{NG14.viewer.scene.globe.depthTestAgainstTerrain=true;});const terrain=await frame();
  await page.evaluate(()=>{
    const v=NG14.viewer,C=Cesium,q=window.__borderProbe;
    v.scene.globe.depthTestAgainstTerrain=false;v.scene.primitives.remove(q.front);
    v.camera.setView({destination:C.Cartesian3.fromDegrees(95,22,16000000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
    q.back=q.make(C.Cartesian3.fromDegreesArray([-86,-22,-84,-22]),3,C.Material.fromType('Color',{color:C.Color.MAGENTA}));q.back.show=true;
  });
  const back=await frame();
  await page.evaluate(()=>{const v=NG14.viewer;v.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-85,-22,16000000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});});
  const frontControl=await frame();
  report.borderVisibility={samples:base.samples.length,visibleSamples:hits(visible,base),terrainTestSamples:hits(terrain,base),backsidePixels:magenta(back),frontControlPixels:magenta(frontControl)};
  await page.evaluate(()=>{NG14.viewer.scene.primitives.remove(window.__borderProbe.back);delete window.__borderProbe;});
  assert.ok(report.borderVisibility.samples>=6);
  assert.ok(report.borderVisibility.visibleSamples/report.borderVisibility.samples>=.9,'A surface border must draw continuously over the satellite tiles');
  assert.equal(report.borderVisibility.backsidePixels,0,'Borders on the far side of Earth must remain hidden');
  assert.ok(report.borderVisibility.frontControlPixels>0,'The hidden test line must render when the camera turns toward it');
  console.log('BORDER_VISIBILITY_PASS',JSON.stringify(report.borderVisibility));
  assert.deepEqual(report.errors,[]);
  await assertConsoleHealth(page,report);
  report.status='PASS';console.log('R6_GEOGRAPHY_PASS');
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);report.lastState=await page.evaluate(()=>({current:window.NG14?.current,news:window.NG14?.news?.[NG14.current],geo:window.NG14?.v52Geography?.getDiagnostics()})).catch(()=>null);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
