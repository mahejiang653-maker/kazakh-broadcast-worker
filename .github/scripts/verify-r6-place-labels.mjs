import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {trackConsoleHealth,assertConsoleHealth} from './r6-imagery-recovery.mjs';

const version='20261010-r6-stable-place-labels-r8';
const url=process.env.GLOBE_URL||'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=process.env.GLOBE_OUTPUT||'globe-verify-r6-place-labels';fs.mkdirSync(dir,{recursive:true});
const report={url,version,localOverrides:!!process.env.GLOBE_LOCAL,status:'RUNNING',cases:[],errors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
if(process.env.GLOBE_LOCAL){
  const root=path.resolve('public');await page.route(new URL(url).origin+'/**',route=>{
    const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
    if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/gzip'});
    return route.continue();
  });
}
page.on('pageerror',e=>report.errors.push(e.message));trackConsoleHealth(page,report);
const finalReady=async(index,text)=>{
  await page.waitForFunction(({index,text})=>{
    const G=NG14,t=G.viewer.clock.currentTime;
    return G.current===index&&!G.overviewMode&&!G.viewer.camera._currentFlight&&G.v51SceneEntities.some(e=>e.label?.text.getValue(t)===text);
  },{index,text},{timeout:45000});
  await page.waitForTimeout(250);
};
async function begin(index){
  await page.evaluate(()=>{NG14.pause();window.__placeLog.frames=[];});
  await page.locator('#timeline button').nth(index).click();
  return page.evaluate(()=>NG14.navSerial);
}
async function caseResult(name,serial,expected){
  const data=await page.evaluate(serial=>{
    const G=NG14,C=Cesium,t=G.viewer.clock.currentTime,n=G.news[G.current];
    const label=G.v51SceneEntities.find(e=>e.label?.text.getValue(t)===n.focusLabel);
    const point=G.v51SceneEntities.find(e=>e.point&&C.Cartesian3.distance(e.position.getValue(t),label.position.getValue(t))<1);
    const widths=[...new Set(G.borderEntities.map(e=>e.polyline.width.getValue(t)))];
    const heights=G.borderEntities.flatMap(e=>e.polyline.positions.getValue(t).slice(0,2)).map(p=>C.Cartographic.fromCartesian(p).height);
    return {frames:__placeLog.frames.filter(f=>f.serial===serial),navSerial:G.navSerial,anchorDistance:point?C.Cartesian3.distance(point.position.getValue(t),label.position.getValue(t)):null,
      geo:G.v52Geography.getDiagnostics(),quality:G.v52Performance.getDiagnostics(),widths,minBorderHeight:Math.min(...heights),maxBorderHeight:Math.max(...heights),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  },serial);
  const stages=data.frames.map(f=>f.names).filter((names,i,all)=>i===0||JSON.stringify(names)!==JSON.stringify(all[i-1]));
  assert.deepEqual(stages,expected.map(s=>[s]),name+': no label reversal or empty rendered stage');
  assert.equal(data.navSerial,serial);assert.ok(data.anchorDistance<.001,'Label and red point must share their world anchor');
  assert.equal(data.geo.featureDisplay,'point');assert.equal(data.geo.borderDisplay,'elevated');assert.equal(data.geo.detailEntities,0);
  assert.deepEqual(data.widths,[.63]);assert.ok(Math.abs(data.minBorderHeight-18000)<.01);assert.ok(Math.abs(data.maxBorderHeight-22000)<.01);
  assert.equal(data.quality.scale,2.2);assert.equal(data.quality.sse,.75);assert.equal(data.quality.msaaSamples,4);assert.equal(data.overflow,false);
  report.cases.push({name,stages,...data});await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});
  console.log(name+'_PASS',JSON.stringify(stages));
}
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.ok(response.ok());
  await page.waitForFunction(version=>window.NG14?.countries?.get('CHN')?.authoritativeOutline&&NG14.__v52FlagsOverviewClean&&document.querySelector('script[src*="news-globe-v52-hard-rules.js?v='+version+'"]'),version,{timeout:90000});
  console.log('BORDERS_AND_R8_READY');
  await page.evaluate(()=>{
    const G=NG14,C=Cesium,read=p=>p?.getValue?p.getValue(G.viewer.clock.currentTime):p;
    window.__placeLog={frames:[],offsets:[],originalStory:G.news[11],areaDelay:0,pending:false};
    const resolve=G.resolveArea;
    G.resolveArea=async function(...args){const delay=__placeLog.areaDelay;if(delay){__placeLog.pending=true;await new Promise(r=>setTimeout(r,delay));__placeLog.pending=false;}return resolve.apply(this,args);};
    G.viewer.scene.preRender.addEventListener(()=>{
      const labels=[...G.v51SceneEntities,G.localLabelEntity].filter(e=>e?.label&&e.show!==false&&G.viewer.entities.contains(e));
      const names=labels.map(e=>read(e.label.text)),serial=G.navSerial,last=__placeLog.frames.at(-1);
      if(!last||last.serial!==serial||JSON.stringify(last.names)!==JSON.stringify(names))__placeLog.frames.push({at:performance.now(),serial,names,height:G.viewer.camera.positionCartographic.height});
      for(const e of labels)if(read(e.label.text)==='独库公路'){
        const anchor=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,e.position.getValue(G.viewer.clock.currentTime)),offset=read(e.label.pixelOffset);
        if(anchor)__placeLog.offsets.push({serial,id:e.id,offset:{x:offset.x,y:offset.y},anchor:{x:anchor.x,y:anchor.y},scale:G.viewer.resolutionScale});
      }
    });
  });

  await page.evaluate(()=>__placeLog.areaDelay=800);
  let serial=await begin(11);await finalReady(11,'独库公路');await caseResult('manual-delayed-province',serial,['中国','新疆','独库公路']);
  await page.evaluate(()=>__placeLog.areaDelay=0);
  serial=await begin(11);
  await page.waitForFunction(()=>NG14.localLabelEntity?.label?.text.getValue(NG14.viewer.clock.currentTime)==='新疆',null,{timeout:18000});
  await page.locator('#play').click();assert.equal(await page.evaluate(()=>NG14.navSerial),serial,'Play must not replay focus');
  await finalReady(11,'独库公路');await caseResult('play-during-province',serial,['中国','新疆','独库公路']);
  const labelId=await page.evaluate(()=>NG14.v51SceneEntities.find(e=>e.label?.text.getValue(NG14.viewer.clock.currentTime)==='独库公路').id);
  for(let i=0;i<3;i++){await page.locator('#play').click();await page.locator('#play').click();}
  assert.equal(await page.evaluate(()=>NG14.navSerial),serial);
  assert.equal(await page.evaluate(()=>NG14.v51SceneEntities.find(e=>e.label?.text.getValue(NG14.viewer.clock.currentTime)==='独库公路').id),labelId);
  await page.evaluate(()=>NG14.pause());

  // The other supported import format has its hierarchy inside scenePlan.
  await page.evaluate(()=>{const n=__placeLog.originalStory;NG14.news[11]={...n,scenePlan:{...n.scenePlan,adminChain:n.adminChain}};});
  serial=await begin(11);await finalReady(11,'独库公路');await caseResult('imported-plan-hierarchy',serial,['中国','新疆','独库公路']);
  await page.evaluate(()=>NG14.news[11]=__placeLog.originalStory);

  await page.evaluate(()=>__placeLog.areaDelay=1600);await begin(11);
  await page.waitForFunction(()=>__placeLog.pending,null,{timeout:16000});
  serial=await begin(10);await finalReady(10,'北京');await page.waitForTimeout(2000);
  await caseResult('cancel-province-to-beijing',serial,['中国','北京']);
  await page.evaluate(()=>__placeLog.areaDelay=0);

  // Interrupt several stages using the real controls, then check the survivor.
  for(let i=0;i<8;i++){await page.locator('#next').click();await page.locator('#prev').click();}
  serial=await begin(11);await finalReady(11,'独库公路');await caseResult('rapid-navigation',serial,['中国','新疆','独库公路']);
  await page.evaluate(()=>__placeLog.offsets=[]);
  for(const [width,height,pitch,range] of [[360,800,-90,305000],[800,360,-55,550000],[390,844,-72,800000],[390,844,-90,305000]]){
    await page.setViewportSize({width,height});
    await page.evaluate(({pitch,range})=>{const C=Cesium;NG14.viewer.camera.lookAt(C.Cartesian3.fromDegrees(84.4,43.15,30000),new C.HeadingPitchRange(0,C.Math.toRadians(pitch),range));NG14.viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);NG14.viewer.scene.requestRender();},{pitch,range});
    await page.waitForTimeout(600);
    await page.screenshot({path:dir+'/camera-'+width+'x'+height+'-'+Math.abs(pitch)+'.png',fullPage:true});
  }
  const offsets=await page.evaluate(()=>__placeLog.offsets);assert.ok(offsets.length>=4);
  assert.equal(new Set(offsets.map(s=>s.id)).size,1,'Moving the camera must keep the same label entity');
  assert.equal(new Set(offsets.map(s=>JSON.stringify(s.offset))).size,1,'The name must not flip to another side of its point');
  assert.ok(offsets.every(s=>s.scale===2.2));report.cases.push({name:'camera-and-resize',samples:offsets.length,offset:offsets[0].offset});
  await page.locator('#all').click();await page.waitForTimeout(5500);
  assert.equal(await page.evaluate(()=>NG14.v51SceneEntities.length),0);assert.equal(await page.evaluate(()=>NG14.localLabelEntity),null);
  report.cases.push({name:'overview-cleanup'});assert.deepEqual(report.errors,[]);await assertConsoleHealth(page,report);
  report.status='PASS';console.log('R6_PLACE_LABELS_PASS');
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
