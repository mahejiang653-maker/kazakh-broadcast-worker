import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const url=process.env.GLOBE_URL || 'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=process.env.GLOBE_OUTPUT || 'globe-verify-r6-geography';fs.mkdirSync(dir,{recursive:true});
const report={url,localOverrides:!!process.env.GLOBE_LOCAL,environmentProxy:!!process.env.GLOBE_TRUST_PROXY,status:'RUNNING',stories:[],checks:[],errors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
// This opt-in is only for a managed test environment whose provided HTTPS
// proxy certificate is absent from Chromium's trust store. CI uses strict TLS.
const page=await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
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
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());if(m.type()==='warning'&&m.text().includes('[R6 geography]'))console.warn(m.text());});
async function settled(index){
  await page.waitForFunction(index=>{
    const G=window.NG14,C=window.Cesium;if(!G?.viewer||G.current!==index||G.overviewMode||G.viewer.camera._currentFlight)return false;
    const n=G.news[index],geo=G.v52Geography?.getDiagnostics();
    if(G.v52Geography?.kind(n))return geo?.state?.serial===G.navSerial&&geo.state.status==='ready';
    const t=C.JulianDate.now();return G.v51SceneEntities.some(e=>e.point&&e.show!==false&&e.position&&
      C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(n.lon,n.lat))<5000);
  },index,{timeout:60000});
  await page.waitForFunction(()=>NG14.v52Geography.getDiagnostics().detailEntities>0,null,{timeout:16000}).catch(()=>{});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:12000}).catch(()=>{});
  const state=await page.evaluate(()=>{
    const G=NG14,C=Cesium,t=C.JulianDate.now(),canvas=G.viewer.scene.canvas;
    const labels=G.viewer.entities.values.filter(e=>e.label&&e.show!==false).map(e=>e.label.text.getValue(t));
    const points=G.localHighlightEntities.flatMap(e=>e.polyline?.positions.getValue(t)||[]);
    const projected=points.map(p=>C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p)).filter(Boolean);
    return {index:G.current,label:G.news[G.current].focusLabel,labels,geo:G.v52Geography.getDiagnostics(),
      aspect:canvas.clientWidth/canvas.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
      bounds:projected.length?{minX:Math.min(...projected.map(p=>p.x/canvas.clientWidth)),maxX:Math.max(...projected.map(p=>p.x/canvas.clientWidth)),minY:Math.min(...projected.map(p=>p.y/canvas.clientHeight)),maxY:Math.max(...projected.map(p=>p.y/canvas.clientHeight))}:null,
      baseMarker:G.markers[G.current]?.show,basePulse:G.pulses[G.current]?.show,
      borders:G.borderEntities.length,surfaceModeMatches:G.borderEntities.every(e=>e.polyline.clampToGround.getValue(t)===!(G.viewer.terrainProvider instanceof C.EllipsoidTerrainProvider)),
      maxBorderHeight:Math.max(...G.borderEntities.flatMap(e=>e.polyline.positions.getValue(t).slice(0,2)).map(p=>Math.abs(C.Cartographic.fromCartesian(p).height))),
      primitives:G.viewer.scene.groundPrimitives.length,entities:G.viewer.entities.values.length};
  });
  assert.ok(Math.abs(state.aspect-16/9)<.01);assert.equal(state.overflow,false);
  assert.equal(state.surfaceModeMatches,true);assert.ok(state.maxBorderHeight<.01);assert.equal(state.borders,7955);
  if(state.geo.areaActive){
    assert.equal(state.baseMarker,false);assert.equal(state.basePulse,false);
    assert.ok(state.bounds&&state.bounds.minX>=0&&state.bounds.maxX<=1&&state.bounds.minY>=0&&state.bounds.maxY<=1,'Entire geometry must fit the map');
  }
  return state;
}
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.ok(response.ok());
  console.log('ENTRY_LOADED');
  await page.waitForFunction(()=>window.NG14?.v52Geography?.version==='20261009-r6-ground-geography'&&NG14.countries.get('CHN')?.authoritativeOutline&&NG14.__v52FlagsOverviewClean,null,{timeout:90000});
  console.log('BORDERS_READY');
  const indexes=process.env.GLOBE_INDEXES?process.env.GLOBE_INDEXES.split(',').map(Number):process.env.GLOBE_QUICK?[8,10,11,1,2]:Array.from({length:13},(_,i)=>i);
  for(const i of indexes){
    await page.locator('#timeline button').nth(i).click();
    const state=await settled(i);report.stories.push(state);
    if(i===10)assert.ok(state.labels.includes('北京'),'Beijing city label missing');
    if(i===11){assert.equal(state.geo.state.type,'LineString');assert.ok(state.geo.state.points>100);}
    if(state.geo.areaActive){
      const suffix=state.geo.state.precision==='approximate'?'（范围示意）':state.geo.state.precision==='reference-route'?'（参考路线）':'';
      assert.ok(state.labels.includes(state.geo.state.label+suffix),'Geometry precision label missing');
    }
    await page.screenshot({path:dir+'/top-'+String(i+1).padStart(2,'0')+'.png',fullPage:true});
    console.log('TOP_'+(i+1)+'_PASS',JSON.stringify(state.geo));
  }
  for(const [width,height] of [[360,800],[800,360],[1280,720]]){
    console.log('VIEWPORT_START',width,height);
    await page.setViewportSize({width,height});
    await page.locator('#timeline button').nth(11).click();
    report.checks.push({name:'route-'+width+'x'+height,state:await settled(11)});
    await page.screenshot({path:dir+'/route-'+width+'x'+height+'.png',fullPage:true});
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
  assert.deepEqual(report.errors,[]);
  report.status='PASS';console.log('R6_GEOGRAPHY_PASS');
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);report.lastState=await page.evaluate(()=>({current:window.NG14?.current,news:window.NG14?.news?.[NG14.current],geo:window.NG14?.v52Geography?.getDiagnostics()})).catch(()=>null);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
