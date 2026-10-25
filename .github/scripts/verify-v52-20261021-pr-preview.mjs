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
    document.querySelector('#dailyLockFile')&&window.NG14?.v52Director&&
    !!document.querySelector('#timeline button'),
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
    try{
      await page.waitForFunction(i=>{
        const G=window.NG14,s=G.v52Director?.getState();
        return G.current===i && s?.index===i &&
          ['complete','cancelled','failed'].includes(s.status);
      },index,{timeout:45000});
    }catch(error){
      const diag=await page.evaluate(()=>{
        const G=window.NG14;return {current:G?.current,serial:G?.navSerial,overview:G?.overviewMode,
          director:G?.v52Director?.getState?.(),trace:G?.getV52SceneTrace?.()?.slice(-20),
          cameraFlying:!!G?.viewer?.camera?._currentFlight,
          pendingOverview:G?.v52OverviewCleanup?.getDiagnostics?.(),
          countryIso3:[...(G?.countries?.keys?.()||[])].slice(0,8),
          ready:!!G?.viewer,globeLevel1:G?.chinaLevel1Geo?.features?.length};
      });
      console.log('SCENE_TIMEOUT_DIAG',JSON.stringify(diag));
      report.sceneTimeout=diag;
      throw error;
    }
    const n=await page.evaluate(inspect);
    const mistakes=[];
    if(n.status!=='complete')mistakes.push('scene ended '+n.status);
    if(n.dataCount!==10)mistakes.push('top10 count');
    if(!n.displayedTitle?.includes(n.title))mistakes.push('title out of sync');
    if(index===0||index===5){
      if(!n.trace.some(stage=>stage==='two-country-location'||stage==='two-country-locality'))mistakes.push('missing city-venue final stage');
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

  // Country camera regression: the imported record claims the hierarchy was
  // already shown, but a new navigation must first frame all mainland France.
  await page.evaluate(()=>{
    const G=window.NG14,previous=G.news[5];
    G.news[5]={...previous,id:6,title:'法国全境然后巴黎',location:'巴黎',focusLabel:'巴黎',
      countryIso3:'FRA',lon:2.3522,lat:48.8566,placeType:'城市',
      sceneMode:'POINT',noPoint:false,
      scenePlan:{primaryIso3:'FRA',hierarchyPresented:true,finalLocation:true}};
    G.focus(5,true);
  });
  await page.waitForFunction(()=>{
    const G=window.NG14,frame=G.__v52CountryFrame;
    return G.current===5&&frame?.serial===G.navSerial&&frame?.iso==='FRA' &&
      !G.viewer.camera._currentFlight;
  },null,{timeout:50000});
  const france=await page.evaluate(()=>{
    const G=window.NG14,C=window.Cesium,c=G.countries.get('FRA'),
      canvas=G.viewer.scene.canvas;
    const geometry=c?.feature?.geometry;
    const polygons=geometry?.type==='MultiPolygon'?geometry.coordinates:
      geometry?.type==='Polygon'?[geometry.coordinates]:[];
    const area=ring=>Math.abs(ring.reduce((n,p,i)=>{
      const q=ring[(i+1)%ring.length];return n+p[0]*q[1]-q[0]*p[1];
    },0)/2);
    const main=polygons.map(p=>p[0]).filter(Boolean).sort((a,b)=>area(b)-area(a))[0]||[];
    const projected=main.map(p=>C.SceneTransforms.worldToWindowCoordinates(
      G.viewer.scene,C.Cartesian3.fromDegrees(p[0],p[1])));
    const inside=projected.filter(p=>p&&p.x>=8&&p.y>=8&&
      p.x<=canvas.clientWidth-8&&p.y<=canvas.clientHeight-8).length;
    return {iso:G.__v52CountryFrame.iso,inside,total:main.length,
      metropolitanPolygonCount:polygons.length,
      overseasVertices:polygons.flatMap(poly=>poly[0]||[]).filter(p=>
        p[0]<-7||p[0]>11||p[1]<40||p[1]>52.5).length,
      cameraHeight:G.viewer.camera.positionCartographic.height,navSerial:G.navSerial};
  });
  report.franceCountryOverview=france;
  assert.ok(france.total>=4,'real metropolitan France polygon must be loaded');
  assert.equal(france.metropolitanPolygonCount,2,'France should show mainland plus Corsica only');
  assert.equal(france.overseasVertices,0,'French Guiana and overseas territories must not appear in France outlines');
  assert.equal(france.inside,france.total,'all mainland France outline vertices must fit the mobile canvas');
  await page.screenshot({path:dir+'/france-country-overview.png',fullPage:true});
  await page.waitForFunction(()=>{
    const G=window.NG14,state=G.v52Director?.getState?.();
    return G.current===5&&state?.status==='complete';
  },null,{timeout:50000});
  const franceFinal=await page.evaluate(inspect);
  report.franceLocation=franceFinal;
  assert.equal(franceFinal.status,'complete');
  assert.ok(franceFinal.center&&Math.abs(franceFinal.center.x-.5)<.25 &&
    Math.abs(franceFinal.center.y-.5)<.25,'Paris must be centered only after France overview');
  await page.screenshot({path:dir+'/france-paris-final.png',fullPage:true});
  console.log('FRANCE_CAMERA_PASS',JSON.stringify({overview:france,cameraFinal:franceFinal.center}));
  // Dedicated regression from the 2026-10-25 Android Top8 screenshot:
  // real Singapore+Indonesia interiors clipped inside WHITE national borders,
  // synchronous red-first blue-second fill/flag finale, full small-country outline.
  await page.evaluate(()=>{
    const G=window.NG14;
    G.news[7]={...G.news[7],
      id:8,title:'印尼削减对新加坡天然气管道出口',
      location:'新加坡/印度尼西亚',focusLabel:'新加坡/印度尼西亚',
      region:'新加坡/印度尼西亚',country:'新加坡/印度尼西亚',
      countryIso3:'IDN',placeType:'地区',sceneMode:'REGION',
      lon:104.02,lat:1.35,noPoint:false,
      scenePlan:{primaryIso3:'IDN',finalLocation:true,regionalContext:true}};
    G.focus(7,true);
  });
  await page.waitForFunction(()=>{
    const G=window.NG14,state=G.v52Director?.getState?.();
    return G.current===7&&state?.status==='complete';
  },null,{timeout:75000});
  const dual=await page.evaluate(()=>{
    const G=window.NG14,n=G.news[7],entities=G.v51SceneEntities||[];
    return {
      singaporeGeometry:G.countries.get('SGP')?.feature?.geometry?.type||'',
      sgNationalEdges:G.countries.get('SGP')?.entities?.length||0,
      singaporeBorder:G.v52StoryBorders?.getDiagnostics()?.singaporeStatus||'',
      stages:G.getV52SceneTrace?.().filter(e=>e.serial===G.navSerial&&e.type==='authored-country-overview').map(e=>e.iso)||[],
      flags:[...new Set(entities.filter(e=>e.billboard&&e.show!==false).map(e=>e.__v52FlagIso).filter(Boolean))],
      nationalFills:entities.filter(e=>e.__v52TerritoryFill).map(e=>{
        const c=e.polygon?.material?.color?.getValue?.(G.viewer.clock.currentTime);
        return {iso:e.__v52CountryIso,red:c?.red||0,blue:c?.blue||0,
          alpha:c?.alpha||0,clipped:!!e.polygon?.hierarchy};
      }),
      finalSync:G.__v52DualFinal?.flagsSynchronous===true,
      frameCountries:G.__v52DualFinal?.frameCountries||[],
      whiteBorders:{
        singapore:G.countries.get('SGP')?.entities?.filter(e=>e.show&&e.polyline).length||0,
        indonesia:G.countries.get('IDN')?.entities?.filter(e=>e.show&&e.polyline).length||0
      },
      originalPlace:n.location,
      finalAnnotation:G.v52FinalAnnotationGuard?.getDiagnostics?.()
    };
  });
  report.singaporeIndonesia=dual;
  console.log('SINGAPORE_INDONESIA_DUAL_COUNTRY',JSON.stringify(dual));
  assert.ok(dual.sgNationalEdges>0&&dual.singaporeGeometry,'Singapore needs a real outline, not a point');
  assert.deepEqual(dual.stages,['SGP','IDN'],'both countries must receive independent full-country camera stages');
  assert.ok(dual.flags.includes('SGP')&&dual.flags.includes('IDN'),'two flags must remain at the final location');
  assert.ok(dual.nationalFills.some(e=>e.iso==='SGP'&&e.red>e.blue&&e.clipped),'Singapore must be red within its real polygon');
  assert.ok(dual.nationalFills.some(e=>e.iso==='IDN'&&e.blue>e.red&&e.clipped),'Indonesia must be blue within its real polygon');
  assert.ok(dual.whiteBorders.singapore>0&&dual.whiteBorders.indonesia>0,'both national white borders must remain in final scene');
  assert.ok(dual.finalSync,'both country flags must be created before final camera movement');
  assert.ok(dual.frameCountries.includes('SGP'),'last camera must fit the entire Singapore territory');
  await page.screenshot({path:dir+'/singapore-indonesia-dual-flags.png',fullPage:true});
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
