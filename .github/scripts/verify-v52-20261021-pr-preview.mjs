import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const dir='globe-20261021-pr-preview';
fs.mkdirSync(dir,{recursive:true});
const base='http://127.0.0.1:8765/news-globe-run-20260920-v52-r1.html';
const report={fixture:'2026-10-21 V52 10-story regression',url:base,results:[],pageErrors:[],errors:[]};
const at=(id,title,location,iso,lon,lat,sceneMode='POINT',extras={})=>({
  id,title,location,focusLabel:location,countryIso3:iso,lon,lat,sceneMode,
  placeType:sceneMode==='COUNTRY'?'国家':'城市',date:'2026-10-21',
  scenePlan:{primaryIso3:iso,finalLocation:sceneMode!=='COUNTRY'},...extras
});
const news=[
  at(1,'中国总理抵达圣彼得堡','普尔科沃机场','RUS',30.27,59.8,'DIPLOMACY',
    {placeType:'机场',scenePlan:{primaryIso3:'RUS',finalLocation:true,contextCountries:['CHN']}}),
  at(2,'特朗普谈乌克兰谈判','华盛顿白宫','USA',-77.0365,38.8977),
  at(3,'美国股票收盘','纽约','USA',-74.0113,40.7075),
  at(4,'哈尔科夫无人机事件','科罗蒂奇','UKR',36.09,49.98),
  at(5,'加沙多处袭击','加沙城、汗尤尼斯','PSE',34.4668,31.5017,'POINT',
    {eventSites:[{location:'加沙城',label:'加沙城（涉事城市）',lon:34.4668,lat:31.5017,countryIso3:'PSE'},
      {location:'汗尤尼斯',label:'汗尤尼斯（涉事城市）',lon:34.3063,lat:31.3462,countryIso3:'PSE'}]}),
  at(6,'美乌奥斯陆会谈','奥斯陆','NOR',10.7522,59.9139,'DIPLOMACY',
    {scenePlan:{primaryIso3:'NOR',finalLocation:true,contextCountries:['USA','UKR']}}),
  at(7,'中国科技企业芯片订单','中国','CHN',null,null,'COUNTRY',{noPoint:true}),
  at(8,'Terafab计划','美国','USA',null,null,'COUNTRY',{noPoint:true}),
  at(9,'新疆棉花调查','新疆维吾尔自治区','CHN',85.2,41.5,'ADMIN_REGION',
    {noPoint:true,placeType:'自治区',scenePlan:{primaryIso3:'CHN',finalLocation:false,
      adminChain:[{location:'新疆维吾尔自治区',focusLabel:'新疆',placeType:'自治区',lon:85.2,lat:41.5}]}}),
  at(10,'新疆党代会主席团会议','乌鲁木齐','CHN',87.6168,43.8256)
];
const payload={meta:{date:'2026-10-21',edition:'daily-10',dataLock:'20261021-CST1300-DAILY10-R2'},
  news};
let browser, page;
const inspect=()=>{
  const G=window.NG14, C=window.Cesium, n=G.news[G.current],
    view=G.viewer,canvas=view?.scene?.canvas,point=(n.lon!=null&&n.lat!=null)?
      C.Cartesian3.fromDegrees(n.lon,n.lat):null,
    xy=point?C.SceneTransforms.worldToWindowCoordinates(view.scene,point):null,
    status=G.v52Director?.getState()||{};
  return {index:G.current+1,id:n.id,title:n.title,status:status.status,
    phase:status.phase,mode:n.sceneMode,noPoint:!!n.noPoint,
    marker:!!G.markers?.[G.current], redMarkers:(G.markers||[]).filter(Boolean).length,
    ownRedMarkerVisible:!!G.markers?.[G.current]?.show,
    trace:(G.getV52SceneTrace?.()||[]).filter(e=>e.serial===G.navSerial).map(e=>e.type),
    adminPolygons:(G.localHighlightEntities||[]).filter(e=>!!e.polygon).length,
    globeCountryFeatures:G.chinaLevel1Geo?.features?.length||0,
    center:xy&&canvas?{x:xy.x/canvas.clientWidth,y:xy.y/canvas.clientHeight}:null,
    cameraMoving:!!view.camera._currentFlight,
    subtitle:document.querySelector('#directorStatus')?.textContent,
    dataCount:G.news.length,
    displayedTitle:document.querySelector('#title')?.textContent};
};
try{
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000});
  await page.waitForFunction(()=>window.NG14?.viewer&&window.NG14?.news?.length===10&&
    document.querySelector('#jsonInput')&&window.NG14?.v52Director,
    null,{timeout:100000});
  const state=await page.evaluate(p=>{
    const G=window.NG14,area=G.$('jsonInput');
    area.value=JSON.stringify(p);
    const bad=G.validate(p);
    if(bad.length)return {valid:false,bad};
    G.applySettings();
    return {valid:true,count:G.news.length,noPoint:G.news.map(x=>!!x.noPoint)};
  },payload);
  assert.equal(state.valid,true,JSON.stringify(state.bad));
  assert.equal(state.count,10);
  assert.equal(state.noPoint[6],true);
  assert.equal(state.noPoint[7],true);
  assert.equal(state.noPoint[8],true);
  for(const index of [0,4,5,6,7,8]){
    await page.evaluate(i=>window.NG14.focus(i,true),index);
    await page.waitForFunction(i=>{
      const G=window.NG14,s=G.v52Director?.getState();
      return G.current===i && s?.index===i &&
        ['complete','cancelled','failed'].includes(s.status);
    },index,{timeout:65000});
    const n=await page.evaluate(inspect);
    const mistakes=[];
    if(n.status!=='complete')mistakes.push('scene ended '+n.status);
    if(n.dataCount!==10)mistakes.push('top10 count');
    if(!n.displayedTitle?.includes(n.title))mistakes.push('title out of sync');
    if(index===0||index===5){
      if(!n.trace.includes('two-country-location'))mistakes.push('missing city-venue final stage');
      if(!n.center||Math.abs(n.center.x-.5)>.25||Math.abs(n.center.y-.5)>.25)mistakes.push('not framed at venue');
    }
    if(index===4&&n.trace.filter(s=>s==='multi-location').length!==2)
      mistakes.push('not both affected cities');
    if(index===6||index===7){
      if(n.marker||n.ownRedMarkerVisible)mistakes.push('fabricated country-only marker');
    }
    if(index===8){
      if(n.marker)mistakes.push('fabricated province marker');
      if(n.adminPolygons===0||!n.trace.includes('admin-hierarchy-complete'))
        mistakes.push('Xinjiang real boundary not drawn');
    }
    n.mistakes=mistakes;report.results.push(n);
    await page.screenshot({path:dir+'/top-'+String(index+1).padStart(2,'0')+'.png',fullPage:true});
    if(mistakes.length)report.errors.push('Top'+(index+1)+': '+mistakes.join('; '));
    console.log('TOP'+(index+1),JSON.stringify({status:n.status,trace:n.trace,center:n.center,polygons:n.adminPolygons,mistakes}));
  }
  // Diagnose first-story cancellation separately from an intrinsic venue error.
  // Replaying Top1 from a settled Top9 camera distinguishes startup/overview
  // interference from the normal China -> Russia -> airport scene path.
  await page.evaluate(()=>window.NG14.focus(0,true));
  await page.waitForFunction(()=>{
    const G=window.NG14,s=G.v52Director?.getState();
    return G.current===0&&s?.index===0&&['complete','cancelled','failed'].includes(s.status);
  },null,{timeout:65000});
  const replay=await page.evaluate(inspect);
  report.top1Replay=replay;
  await page.screenshot({path:dir+'/top-01-replay.png',fullPage:true});
  console.log('TOP1_REPLAY',JSON.stringify(replay));
  assert.deepEqual(report.errors,[],report.errors.join('; '));
  report.status='PASS';
}catch(e){
  report.status='FAIL';
  report.errors.push(e.stack||String(e));
  console.error(e);
  if(page)await page.screenshot({path:dir+'/failed.png',fullPage:true}).catch(()=>{});
  process.exitCode=1;
}finally{
  fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));
  await browser?.close();
}
