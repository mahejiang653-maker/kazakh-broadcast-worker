import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {trackConsoleHealth,assertConsoleHealth} from './r6-imagery-recovery.mjs';

const url='https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=process.env.GLOBE_OUTPUT||'globe-verify-r6-performance';fs.mkdirSync(dir,{recursive:true});
const baseline=!!process.env.GLOBE_BASELINE;
const report={status:'RUNNING',baseline,localOverrides:!!process.env.GLOBE_LOCAL,consoleErrors:[],errors:[],checks:[]};
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
if(process.env.GLOBE_LOCAL){
  const origin=new URL(url).origin,root=path.resolve('public');
  await page.route(origin+'/**',route=>{
    const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.continue();
    const contentType=file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':file.endsWith('.gz')?'application/gzip':undefined;
    return route.fulfill({status:200,body:fs.readFileSync(file),...(contentType?{contentType}:{})});
  });
}
page.on('pageerror',e=>report.errors.push(e.message));trackConsoleHealth(page,report);
async function sample(name){
  const result=await page.evaluate(async()=>{
    const G=NG14,v=G.viewer;let renders=0,updates=0;
    const removeRender=v.scene.postRender.addEventListener(()=>renders++),removeUpdate=v.scene.postUpdate.addEventListener(()=>updates++);
    const start=performance.now();await new Promise(r=>setTimeout(r,4000));
    removeRender();removeUpdate();
    return {seconds:(performance.now()-start)/1000,renders,updates,pixels:v.scene.canvas.width*v.scene.canvas.height,
      scale:v.resolutionScale,sse:v.scene.globe.maximumScreenSpaceError,msaaSamples:v.scene.msaaSamples,requestRenderMode:v.scene.requestRenderMode,
      performance:G.v52Performance?.getDiagnostics(),geography:G.v52Geography.getDiagnostics()};
  });
  report.checks.push({name,...result});console.log(name,JSON.stringify(result));return result;
}
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.ok(response.ok());
  await page.waitForFunction(()=>window.NG14?.__v52FlagsOverviewClean&&NG14.countries.get('CHN')?.authoritativeOutline,null,{timeout:90000});
  await page.locator('#timeline button').nth(8).click();
  await page.waitForFunction(()=>NG14.current===8&&!NG14.viewer.camera._currentFlight&&NG14.v51SceneEntities.some(e=>e.point&&e.show!==false),null,{timeout:60000});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:15000}).catch(()=>{});
  await page.screenshot({path:dir+'/stockholm.png',fullPage:true});
  const style=await page.evaluate(()=>{
    const t=NG14.viewer.clock.currentTime;const b=NG14.borderEntities[0];
    return {width:b.polyline.width.getValue(t),material:b.polyline.material.getValue(t)};
  });report.borderStyle=style;
  let mutations=0;await page.evaluate(()=>{window.__perfBorderMutations=0;window.__perfRemove=NG14.viewer.entities.collectionChanged.addEventListener((_,a,r)=>{window.__perfBorderMutations+=a.length+r.length;});});
  for(let i=0;i<4;i++){await page.evaluate(()=>NG14.viewer.camera.moveEnd.raiseEvent());await page.waitForTimeout(600);}
  mutations=await page.evaluate(()=>{window.__perfRemove();return window.__perfBorderMutations;});
  report.repeatedViewportMutations=mutations;
  const stockholm=await sample('stockholm-settled');
  await page.evaluate(()=>{
    window.__perfFlightQuality=[];
    window.__perfRemoveFlight=NG14.viewer.scene.postUpdate.addEventListener(()=>{
      const v=NG14.viewer;
      if(v.camera._currentFlight)window.__perfFlightQuality.push([v.resolutionScale,v.scene.globe.maximumScreenSpaceError,v.scene.msaaSamples]);
    });
  });
  await page.locator('#timeline button').nth(11).click();
  await page.waitForFunction(()=>NG14.current===11&&!NG14.viewer.camera._currentFlight&&NG14.v51SceneEntities.some(e=>e.point&&e.show!==false),null,{timeout:60000});
  report.flightQuality=await page.evaluate(()=>{window.__perfRemoveFlight();return window.__perfFlightQuality;});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1800);
  const route=await sample('duku-point');await page.screenshot({path:dir+'/duku-point.png',fullPage:true});
  assert.equal(route.geography.featureDisplay,'point');assert.equal(route.geography.areaActive,false);
  assert.equal(route.geography.depthTestAgainstTerrain,true);
  assert.equal(route.geography.borderDisplay,'elevated');
  assert.equal(route.geography.detailEntities,0);
  assert.equal(route.geography.cachedBands,0);
  await page.evaluate(()=>{
    const G=NG14,C=Cesium,n=G.news[G.current];
    G.viewer.camera.setView({destination:C.Cartesian3.fromDegrees(n.lon,n.lat,9000000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
    G.viewer.camera.moveEnd.raiseEvent();G.viewer.scene.requestRender();
  });
  await page.waitForTimeout(600);
  report.highBorderStyle=await page.evaluate(()=>{
    const v=NG14.viewer,t=v.clock.currentTime;
    return {height:v.camera.positionCartographic.height,width:NG14.borderEntities[0].polyline.width.getValue(t),scale:v.resolutionScale,detailEntities:NG14.v52Geography.getDiagnostics().detailEntities};
  });
  assert.equal(report.highBorderStyle.width,.63);assert.equal(report.highBorderStyle.scale,2.2);
  assert.equal(report.highBorderStyle.detailEntities,0);assert.ok(report.highBorderStyle.height>8000000);
  await page.screenshot({path:dir+'/high-borders.png',fullPage:true});
  await page.locator('#all').click();await page.waitForTimeout(5500);const overview=await sample('overview-idle');
  // Start from an idle overview so existing point pulses cannot conceal a frozen animation.
  const moving=await page.evaluate(async()=>{
    const v=NG14.viewer,C=Cesium,start=performance.now();let renders=0,finish;
    const positions=[],done=new Promise(resolve=>{finish=resolve;});
    const entity=v.entities.add({position:new C.CallbackProperty(()=>C.Cartesian3.fromDegrees(84+(performance.now()-start)/30000,43,0),false),point:{pixelSize:9,color:C.Color.YELLOW}});
    const remove=v.scene.postRender.addEventListener(()=>{
      renders++;const p=entity.position.getValue(v.clock.currentTime);positions.push([p.x,p.y,p.z]);
      if(renders>=4)finish();
    });
    // Check distinct rendered animation states; GPU speed is not a correctness requirement.
    const timer=setTimeout(finish,10000);await done;clearTimeout(timer);v.entities.remove(entity);remove();
    return {frames:renders,positions,seconds:(performance.now()-start)/1000};
  });report.callbackAnimation=moving;
  if(!baseline){
    assert.equal(style.width,.63,'Normal borders should be 150% of the original 0.42 pixel width');
    assert.equal(style.material.outlineWidth,.09,'The light border outline should remain unchanged');
    assert.equal(mutations,0,'An unchanged viewport must not rebuild detailed borders');
    for(const snapshot of [stockholm,route,overview])assert.deepEqual([snapshot.scale,snapshot.sse,snapshot.msaaSamples],[2.2,.75,4],'Original mobile pixel density and detail must be preserved');
    assert.ok(report.flightQuality.length>0,'Quality must also be measured while the camera moves');
    for(const quality of report.flightQuality)assert.deepEqual(quality,[2.2,.75,4],'Camera movement must not lower image quality');
    assert.ok(route.requestRenderMode,'On-demand rendering did not apply');
    assert.ok(route.renders>0,'Point pulse animations must keep drawing');
    assert.ok(moving.frames>=4&&new Set(moving.positions.map(p=>p.join(','))).size>=4,'Callback animations must render distinct moving states');
    assert.ok(overview.renders<=8,'Overview must also stop continuously rendering');
  }
  assert.deepEqual(report.errors,[]);await assertConsoleHealth(page,report);report.status='PASS';console.log('R6_PERFORMANCE_PASS');
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
