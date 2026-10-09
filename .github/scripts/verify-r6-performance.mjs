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
      scale:v.resolutionScale,sse:v.scene.globe.maximumScreenSpaceError,requestRenderMode:v.scene.requestRenderMode,
      performance:G.v52Performance?.getDiagnostics(),geography:G.v52Geography.getDiagnostics()};
  });
  report.checks.push({name,...result});console.log(name,JSON.stringify(result));return result;
}
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.ok(response.ok());
  await page.waitForFunction(()=>window.NG14?.__v52FlagsOverviewClean&&NG14.countries.get('CHN')?.authoritativeOutline,null,{timeout:90000});
  await page.locator('#timeline button').nth(8).click();
  await page.waitForFunction(()=>NG14.current===8&&!NG14.viewer.camera._currentFlight&&NG14.v52Geography.getDiagnostics().detailEntities>0,null,{timeout:60000});
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
  await sample('stockholm-settled');
  await page.locator('#timeline button').nth(11).click();
  await page.waitForFunction(()=>NG14.current===11&&!NG14.viewer.camera._currentFlight&&NG14.v52Geography.getDiagnostics().state?.status==='ready',null,{timeout:60000});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1800);
  const route=await sample('route-idle');await page.screenshot({path:dir+'/route.png',fullPage:true});
  // A visible CallbackProperty must keep drawing; static roads must become idle.
  const moving=await page.evaluate(async()=>{
    const v=NG14.viewer,C=Cesium,start=performance.now();let renders=0;
    const remove=v.scene.postRender.addEventListener(()=>renders++);
    const entity=v.entities.add({position:new C.CallbackProperty(()=>C.Cartesian3.fromDegrees(84+(performance.now()-start)/30000,43,0),false),point:{pixelSize:9,color:C.Color.YELLOW}});
    await new Promise(r=>setTimeout(r,1500));v.entities.remove(entity);remove();return renders;
  });report.callbackAnimationFrames=moving;
  await page.locator('#all').click();await page.waitForTimeout(5500);const overview=await sample('overview-idle');
  if(!baseline){
    assert.ok(style.width>=1.5,'Normal borders must be legible');
    assert.equal(mutations,0,'An unchanged viewport must not rebuild detailed borders');
    assert.ok(route.scale<=1.35&&route.requestRenderMode,'Mobile rendering profile did not apply');
    assert.ok(route.renders<=8,'A static route should stop continuously rendering');
    assert.ok(moving>=8,'Callback animations froze in request rendering mode');
    assert.ok(overview.renders<=8,'Overview must also stop continuously rendering');
  }
  assert.deepEqual(report.errors,[]);await assertConsoleHealth(page,report);report.status='PASS';console.log('R6_PERFORMANCE_PASS');
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
