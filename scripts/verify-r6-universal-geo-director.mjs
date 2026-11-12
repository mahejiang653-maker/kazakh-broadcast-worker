import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium,devices} from 'playwright';

const origin='https://kazakh-broadcast-worker.mahejiang653.workers.dev';
const url=origin+'/news-globe-run-20260920-v52-r1.html';
const root=path.resolve('public'),dir=path.resolve('globe-verify-universal-20261112');
fs.mkdirSync(dir,{recursive:true});
const reference=JSON.parse(fs.readFileSync('tests/fixtures/r6-daily10-20261014.json','utf8'));
const news=reference.news.map((n,i)=>({...n,id:'Top'+(i+1),rank:i+1}));
news[8]={id:'Top9',rank:9,title:'轻骑兵太阳能无人机首飞',summary:'我国自主研发的轻骑兵太阳能无人机完成首飞。',
 location:'中国西北地区',focusLabel:'中国西北地区',countryIso3:'CHN',relatedCountryIso3s:['CHN'],
 lon:103.8,lat:36.1,coordinatePrecision:'representative, not exact event location',sceneMode:'POINT',
 eventType:'technology',scenePlan:{primaryIso3:'CHN',finalLocation:true}};
news[9]={id:'Top10',rank:10,title:'新疆塔克什肯口岸通关热度攀升',
 summary:'塔克什肯口岸前十个月客货通关增长。',location:'塔克什肯口岸',focusLabel:'塔克什肯口岸',
 countryIso3:'CHN',relatedCountryIso3s:['CHN','MNG'],countriesIso3:['CHN','MNG'],
 lon:90.8,lat:46.15,coordinatePrecision:'representative, not exact event location',
 eventType:'trade',sceneMode:'POINT',scenePlan:{primaryIso3:'CHN',finalLocation:true}};
const payload={schema:'news-data-lock/v1',meta:{...reference.meta,date:'2026-11-12',
 dataLock:'NG-20261112-BJT1300-TOP10-USER-SELECTED',
 windowStart:'2026-11-11T13:00:00+08:00',windowEnd:'2026-11-12T13:00:00+08:00'},news};

const report={version:'20261112-geo-r1',date:payload.meta.date,scenes:[],errors:[],start:Date.now(),result:'pending'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:412,height:915},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.route('**/*',async route=>{
 const target=new URL(route.request().url());
 if(target.origin===origin){
   const local=path.resolve(root,'.'+target.pathname);
   if(local.startsWith(root+path.sep)&&fs.existsSync(local)&&fs.statSync(local).isFile()){
     const type=local.endsWith('.js')?'application/javascript':local.endsWith('.html')?'text/html':local.endsWith('.json')?'application/json':undefined;
     return route.fulfill({body:fs.readFileSync(local),contentType:type});
   }
 }
 return route.continue();
});
const state=()=>page.evaluate(()=>{
 const G=window.NG14,d=G?.v52GeoDirector?.getState?.(),C=window.Cesium;
 const c=G?.viewer?.camera?.positionCartographic;
 return {index:(G?.current??-1)+1,scene:d?.plan?.scenario,trace:d?.trace||[],status:G?.v52Director?.getState?.()?.status,
 camera:c?{lon:C.Math.toDegrees(c.longitude),lat:C.Math.toDegrees(c.latitude),height:c.height}:null,
 localPolygons:(G?.localHighlightEntities||[]).filter(e=>e.polygon).length,
 baseMarker:G?.markers?.[G.current]?.show||false};
});
async function snap(name){const st=await state();await page.screenshot({path:path.join(dir,name+'.png'),animations:'disabled'});report.scenes.push({name,...st});console.log('V52_GEO_SCREEN',name,JSON.stringify(st).slice(0,2200));return st;}
async function atTrace(type,count=1){
 await page.waitForFunction(({type,count})=>{
   const G=window.NG14;return G?.v52GeoDirector?.getTrace?.().filter(x=>x.type===type).length>=count;
 },{type,count},{timeout:25000});
}
async function select(i){
 await page.locator('#timeline button').nth(i-1).click();
 await page.waitForFunction(i=>NG14.current===i-1&&NG14.started&&!NG14.overviewMode,i,{timeout:20000});
}
try{
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:100000});
 await page.waitForFunction(()=>window.NG14?.viewer&&NG14.countries?.size>0
   &&window.V52GeoSemantic&&NG14.v52GeoDirector&&document.querySelector('#dailyLockFile'),null,{timeout:120000});
 await page.locator('#settingsBtn').click();
 await page.locator('#dailyLockFile').setInputFiles({name:'2026-11-12-news-data-lock-v1-FIXED.json',
  mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await page.waitForFunction(()=>NG14.news?.length===10&&NG14.news[8]?.title==='轻骑兵太阳能无人机首飞',
  null,{timeout:15000});
 const pre=await page.evaluate(()=>{
   const s=window.V52GeoSemantic;
   return {top9:s.analyze(NG14.news[8]).steps.map(x=>x.type),
    top10:s.analyze(NG14.news[9]).steps.map(x=>x.type),
    top10countries:s.analyze(NG14.news[9]).steps.filter(x=>x.iso3).map(x=>x.iso3),
    validation:NG14.validate({news:NG14.news})};
 });
 assert.deepEqual(pre.validation,[]);
 assert.deepEqual(pre.top9,['country-highlight','region-highlight']);
 assert.deepEqual(pre.top10,['country-highlight','country-highlight','point-focus']);
 assert.deepEqual(pre.top10countries,['MNG','CHN']);
 await page.evaluate(()=>NG14.closeSettings?.());
 await select(9);await atTrace('region-highlight');
 const top9=await snap('top9-northwest-area');
 assert.equal(top9.scene,'region');
 assert.equal(top9.baseMarker,false);
 assert.ok(top9.localPolygons>=5,'Northwest must show at least five province polygons');
 assert.equal(top9.trace.some(x=>x.type==='point-focus'),false);
 await select(10);await atTrace('country-highlight',1);
 await snap('top10-mongolia-country');
 await atTrace('country-highlight',2);
 await snap('top10-china-country');
 await atTrace('point-focus');
 const top10=await snap('top10-takeshken-port');
 assert.deepEqual(top10.trace.filter(x=>x.type==='country-highlight').map(x=>x.iso3),['MNG','CHN']);
 assert.equal(top10.trace.at(-1).type,'point-focus');
 assert.equal(top10.trace.at(-1).label,'塔克什肯口岸');
 await page.setViewportSize({width:1280,height:720});
 await snap('top10-desktop-16x9');
 report.result='passed';
 }catch(error){report.result='failed';report.failure=String(error.stack||error);
 try{report.debug=await page.evaluate(()=>({url:location.href,
  mapState:NG14?.v52GeoDirector?.getState?.(),
  director:NG14?.v52Director?.getState?.(),
  navSerial:NG14?.navSerial,overviewMode:NG14?.overviewMode,
  current:NG14?.current,cameraFlight:!!NG14?.viewer?.camera?._currentFlight,
  cameraHeight:NG14?.viewer?.camera?.positionCartographic?.height,
  featureCount:NG14?.chinaLevel1Geo?.features?.length||0,
  marker:NG14?.markers?.[NG14.current]?.show||false}));
  console.error('V52_GEO_DEBUG',JSON.stringify(report.debug).slice(0,20000));
  await page.screenshot({path:path.join(dir,'failure-debug.png')});}catch(e){console.error('V52_GEO_DEBUG_ERROR',String(e))}
 console.error('V52_GEO_VISUAL_FAILED',report.failure);process.exitCode=1;
}finally{
 report.durationMs=Date.now()-report.start;
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
 await browser.close();
}
