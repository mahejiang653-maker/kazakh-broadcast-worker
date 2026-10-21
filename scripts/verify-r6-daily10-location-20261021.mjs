import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve('public');
const url='https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=path.resolve('globe-verify-20261021');
fs.mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/r6-daily10-20261014.json','utf8'));
const stories=fixture.news.map(n=>structuredClone(n));
function change(i, fields){Object.assign(stories[i-1],fields);return stories[i-1];}
change(1,{id:1,title:'中国总理抵达圣彼得堡，中俄第三十一次总理定期会晤将举行',
 location:'俄罗斯圣彼得堡普尔科沃机场',focusLabel:'圣彼得堡普尔科沃机场',
 lon:30.27,lat:59.8,placeType:'机场',countryIso3:'RUS',sceneMode:'DIPLOMACY',
 scenePlan:{primaryIso3:'RUS',contextCountries:['CHN'],finalLocation:true}});
change(5,{id:5,title:'加沙多处遭袭，当地医疗人员称至少四人死亡',
 location:'加沙城与汗尤尼斯',focusLabel:'加沙城与汗尤尼斯',
 lon:34.4668,lat:31.5017,placeType:'城市',countryIso3:'PSE',sceneMode:'POINT',
 scenePlan:{primaryIso3:'PSE',finalLocation:true},
 eventSites:[
 {location:'加沙城',label:'加沙城（涉事城市）',lon:34.4668,lat:31.5017,countryIso3:'PSE'},
 {location:'汗尤尼斯',label:'汗尤尼斯（涉事城市）',lon:34.3063,lat:31.3462,countryIso3:'PSE'}
 ]});
change(6,{id:6,title:'美乌代表在奥斯陆会谈，美特使计划赴俄继续磋商',
 location:'挪威奥斯陆',focusLabel:'奥斯陆',lon:10.7522,lat:59.9139,
 placeType:'城市',countryIso3:'NOR',sceneMode:'DIPLOMACY',
 scenePlan:{primaryIso3:'NOR',contextCountries:['USA','UKR'],finalLocation:true}});
change(7,{id:7,title:'中国科技企业芯片订单',location:'中国（国家范围）',
 focusLabel:'中国',lon:null,lat:null,countryIso3:'CHN',sceneMode:'COUNTRY',
 placeType:'国家',noPoint:true,scenePlan:{primaryIso3:'CHN',finalLocation:false}});
change(8,{id:8,title:'Terafab芯片制造项目目标',location:'美国（国家范围）',
 focusLabel:'美国',lon:null,lat:null,countryIso3:'USA',sceneMode:'COUNTRY',
 placeType:'国家',noPoint:true,scenePlan:{primaryIso3:'USA',finalLocation:false}});
change(9,{id:9,title:'新疆棉花采摘交售调查',location:'新疆维吾尔自治区',focusLabel:'新疆',
 lon:85.2,lat:41.5,countryIso3:'CHN',sceneMode:'ADMIN_REGION',
 placeType:'自治区',noPoint:true,
 scenePlan:{primaryIso3:'CHN',finalLocation:false,adminChain:[
 {location:'新疆维吾尔自治区',focusLabel:'新疆',placeType:'自治区',lon:85.2,lat:41.5}]}});
const pack={meta:{...fixture.meta,date:'2026-10-21',dataLock:'20261021-CST1300-DAILY10-V52-QA',
 windowStart:'2026-10-20T13:00:00+08:00',windowEnd:'2026-10-21T13:00:00+08:00'},news:stories};
const report={edition:pack.meta.date,cases:[],errors:[],failed:null};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,
 ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
page.on('pageerror',e=>report.errors.push(e.message));

await page.route('**/*',async route=>{
 const target=new URL(route.request().url());
 if(target.origin===new URL(url).origin){
   const local=path.resolve(root,'.'+target.pathname);
   if(local.startsWith(root+path.sep)&&fs.existsSync(local)&&fs.statSync(local).isFile()){
     const type=local.endsWith('.js')?'application/javascript':local.endsWith('.html')?'text/html':local.endsWith('.json')?'application/json':local.endsWith('.gz')?'application/gzip':undefined;
     return route.fulfill({body:fs.readFileSync(local),contentType:type});
   }
 }
 return route.continue();
});
async function capture(id){
 const st=await page.evaluate(()=>{
   const G=window.NG14,C=window.Cesium,d=G?.v52Director?.getState?.();
   const n=G.news[G.current],cam=G.viewer.camera,geo=G.viewer.scene;
   const v=C.Cartesian3.fromDegrees(Number(n.lon)||0,Number(n.lat)||0);
   const proj=Number.isFinite(n.lon)&&Number.isFinite(n.lat)?C.SceneTransforms.worldToWindowCoordinates(geo,v):null;
   const canvas=geo.canvas;
   return {index:G.current+1,mode:n.sceneMode,title:n.title,serial:G.navSerial,
    director:d,events:G.getV52SceneTrace?.().filter(e=>e.serial===G.navSerial).map(e=>({type:e.type,iso:e.iso,mode:e.mode,name:e.name,location:e.location,reason:e.reason})),
    cam:{lon:C.Math.toDegrees(cam.positionCartographic.longitude),lat:C.Math.toDegrees(cam.positionCartographic.latitude),
      height:cam.positionCartographic.height,moving:!!cam._currentFlight},
    center:proj?{x:proj.x/canvas.clientWidth,y:proj.y/canvas.clientHeight}:null,
    baseMarker:!!G.markers?.[G.current],basePulse:!!G.pulses?.[G.current],
    scenePoints:(G.v51SceneEntities||[]).filter(e=>e.point&&e.show!==false).length,
    provincePolygons:(G.localHighlightEntities||[]).filter(e=>e.polygon&&G.viewer.entities.contains(e)).length};
 });
 report.cases.push({id,...st});
 await page.screenshot({path:path.join(dir,id+'.png')});
 console.log('SCENE_QA',id,JSON.stringify(st).slice(0,3500));
 return st;
}
function near(s,lon,lat,tol=.35){
 assert.ok(Math.abs(s.cam.lon-lon)<tol && Math.abs(s.cam.lat-lat)<tol,
  'camera did not reach locality ('+lon+','+lat+'): '+JSON.stringify(s.cam));
 assert.ok(s.center&&Math.abs(s.center.x-.5)<.20&&Math.abs(s.center.y-.5)<.20,
  'site not centered in viewport');
}
async function visit(index,id,{target=null,timeout=80000}={}){
 await page.locator('#timeline button').nth(index-1).click();
 await page.waitForFunction(i=>{
   const G=window.NG14;return G.current===i-1&&G.started&&!G.overviewMode;
 },index,{timeout:15000});
 if(target){
   await page.waitForFunction(([lon,lat])=>{
    const G=window.NG14,C=window.Cesium;
    if(G.viewer.camera._currentFlight)return false;
    const cp=G.viewer.camera.positionCartographic;
    return Math.abs(C.Math.toDegrees(cp.longitude)-lon)<.2 &&
       Math.abs(C.Math.toDegrees(cp.latitude)-lat)<.2;
   },target,{timeout});
 } else {
   await page.waitForFunction(()=>{
     const G=window.NG14,d=G.v52Director?.getState?.();
     return !G.viewer.camera._currentFlight && d&&['complete','cancelled','failed'].includes(d.status);
   },null,{timeout});
 }
 const s=await capture(id);
 assert.ok(s.director?.status!=='cancelled'&&s.director?.status!=='failed',
  'camera stage was cancelled: '+JSON.stringify(s.director));
 return s;
}
try{
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.NG14?.viewer&&NG14.countries?.size>0
   &&document.querySelector('#dailyLockFile')&&NG14.v52Director,null,{timeout:120000});
 await page.locator('#settingsBtn').click();
 await page.locator('#dailyLockFile').setInputFiles({
   name:'2026-10-21-Top10-QA.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(pack))
 });
 await page.waitForFunction(()=>NG14.news?.length===10 && NG14.news[0]?.title.includes('圣彼得堡'),
  null,{timeout:10000});
 const imported=await page.evaluate(()=>({
   errors:NG14.validate({news:NG14.news}),noPoint7:NG14.news[6].noPoint,noPoint8:NG14.news[7].noPoint,
   noPoint9:NG14.news[8].noPoint
 }));
 assert.equal(imported.errors.length,0);
 assert.equal(imported.noPoint7,true);assert.equal(imported.noPoint8,true);assert.equal(imported.noPoint9,true);
 // These are positive assertions about final visual state, not just title/flag presence.
 const top1=await visit(1,'top1-airport',{target:[30.27,59.8]});
 near(top1,30.27,59.8);
 assert.ok(top1.events.some(x=>x.type==='diplomacy-country'&&x.iso==='CHN'));
 assert.ok(top1.events.some(x=>x.type==='diplomacy-country'&&x.iso==='RUS'));
 const top6=await visit(6,'top6-oslo',{target:[10.7522,59.9139]});
 near(top6,10.7522,59.9139);
 for(const i of [7,8]){
   const s=await visit(i,'top'+i+'-country');
   assert.equal(s.baseMarker,false,'fake red marker for Top'+i);
   assert.equal(s.basePulse,false,'fake pulse for Top'+i);
   assert.equal(s.scenePoints,0,'fake scene point for Top'+i);
 }
 const top9=await visit(9,'top9-xinjiang');
 assert.equal(top9.baseMarker,false);
 assert.ok(top9.provincePolygons>0,'Xinjiang regional polygon is absent');
 const top5=await visit(5,'top5-two-cities',{target:[34.3063,31.3462]});
 near(top5,34.3063,31.3462);
 assert.equal(top5.events.filter(x=>x.type==='multi-location').length,2);
 assert.deepEqual(report.errors,[]);
 report.status='PASS';
 console.log('SCENE_QA_20261021_PASS 6/6');
}catch(error){
 report.status='FAIL';report.failed=String(error.stack||error);
 console.error('SCENE_QA_20261021_FAIL',report.failed);
 await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
 process.exitCode=1;
}finally{
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
 await browser.close();
}
