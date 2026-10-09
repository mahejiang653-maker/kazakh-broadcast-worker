import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium} from 'playwright';

const context = {window:{}};
vm.runInNewContext(fs.readFileSync('public/news-globe-data-20260920-v52-r1.js','utf8'),context);
const expected = context.window.NG14;
const url = 'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir = 'globe-verify-r6';
fs.mkdirSync(dir,{recursive:true});
const report = {url,date:expected.meta.date,lock:expected.DAILY_LOCK,commit:process.env.GITHUB_SHA||null,
  status:'RUNNING',stories:[],checks:[],errors:[],consoleErrors:[],
  limits:['Chromium sizes emulate a phone; this is not Android hardware QA.','Timer/RAF counts are observations, not proof of GPU disposal or zero leaks.']};
let browser,page;

async function waitForDeployment(){
  if(!process.env.GITHUB_ACTIONS)return;
  const api='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/actions/runs?head_sha='+process.env.GITHUB_SHA+'&per_page=50';
  for(let i=0;i<70;i++){
    const r=await fetch(api,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});
    assert.ok(r.ok,'Cannot read deployment status: '+r.status);
    const {workflow_runs:runs}=await r.json(),ci=runs.find(r=>r.name==='CI'&&r.event==='push');
    if(ci?.status==='completed'){assert.equal(ci.conclusion,'success','CI deployment failed');report.deploymentRun=ci.html_url;return;}
    await new Promise(resolve=>setTimeout(resolve,6000));
  }
  throw Error('Timed out waiting for this commit to deploy');
}
function inspect(){
  const G=window.NG14,C=window.Cesium,n=G?.news?.[G.current],box=document.querySelector('.map-frame')?.getBoundingClientRect();
  if(!G?.viewer||!n||!box)return {ready:false};
  const canvas=G.viewer.scene.canvas,p=C.Cartesian3.fromDegrees(+n.lon,+n.lat),t=C.JulianDate.now();
  const xy=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p);
  const ids=Array.from(document.querySelectorAll('[id]'),e=>e.id);
  return {ready:true,index:G.current,id:n.id,title:n.title,uiTitle:document.getElementById('title')?.textContent,
    mode:n.sceneMode,lon:+n.lon,lat:+n.lat,height:G.viewer.camera.positionCartographic.height,
    center:xy?{x:xy.x/canvas.clientWidth,y:xy.y/canvas.clientHeight}:null,
    markerVisible:(G.v51SceneEntities||[]).some(e=>{
      if(e.show===false||!e.point||e.point.show?.getValue(t)===false)return false;
      const position=e.position?.getValue(t),surface=position&&C.Ellipsoid.WGS84.scaleToGeodeticSurface(position);
      return surface&&C.Cartesian3.distance(surface,p)<5000;
    }),
    aspect:box.width/box.height,canvasFits:Math.abs(canvas.clientWidth-box.width)<2&&Math.abs(canvas.clientHeight-box.height)<2,
    controlsOutside:['prev','next','play','all'].every(id=>{const r=document.getElementById(id)?.getBoundingClientRect();return r&&(r.top>=box.bottom-1||r.bottom<=box.top+1);}),
    logoOutside:(document.querySelector('.brand')?.getBoundingClientRect().bottom||Infinity)<=box.top+1,
    duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),overflow:document.documentElement.scrollWidth>window.innerWidth+1,
    overview:G.overviewMode,entities:G.viewer.entities.values.length,geography:G.v52Geography?.getDiagnostics(),
    sceneEntities:['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities'].reduce((sum,k)=>sum+(G[k]?.length||0),0),
    markersVisible:[...(G.markers||[]),...(G.pulses||[])].filter(e=>e.show!==false).length,
    collision:G.v52ScreenCollision?.getDiagnostics(),cleanup:G.v52OverviewCleanup?.getDiagnostics(),
    pointEntities:G.viewer.entities.values.filter(e=>e.point).length,labelEntities:G.viewer.entities.values.filter(e=>e.label).length,
    pending:window.__R6_QA_PENDING__?.()};
}
async function settled(index){
  await page.waitForFunction(index=>{
    const G=window.NG14,C=window.Cesium,n=G?.news?.[G.current];
    if(!G?.viewer||G.current!==index||G.overviewMode||G.viewer.camera._currentFlight||!n)return false;
    if(G.v52Geography?.kind(n)){
      const geo=G.v52Geography.getDiagnostics();
      return geo.state?.serial===G.navSerial&&geo.state.status==='ready';
    }
    const p=C.Cartesian3.fromDegrees(+n.lon,+n.lat),xy=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,p),canvas=G.viewer.scene.canvas,t=C.JulianDate.now();
    if(!xy||Math.abs(xy.x/canvas.clientWidth-.5)>.03||Math.abs(xy.y/canvas.clientHeight-.5)>.03)return false;
    // Base/visited markers can already be visible during country highlights.
    // finalLocation creates the current event's point in the existing V51 scene list.
    return (G.v51SceneEntities||[]).some(e=>{
      if(e.show===false||!e.point||e.point.show?.getValue(t)===false)return false;
      const position=e.position?.getValue(t),surface=position&&C.Ellipsoid.WGS84.scaleToGeodeticSurface(position);
      if(!surface||C.Cartesian3.distance(surface,p)>=5000)return false;
      const marker=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,position);
      return marker&&Math.abs(marker.x/canvas.clientWidth-.5)<=.03&&Math.abs(marker.y/canvas.clientHeight-.5)<=.03;
    });
  },index,{timeout:35000});
  await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:15000}).catch(()=>{});
  const state=await page.evaluate(inspect);
  assert.ok(state.uiTitle.includes(state.title),'Story text and scene disagree');
  assert.ok(Number.isFinite(state.height)&&state.height>0,'Invalid camera');
  assert.ok(Math.abs(state.aspect-16/9)<.01&&state.canvasFits,'Viewport/canvas mismatch');
  assert.ok(state.controlsOutside&&state.logoOutside&&!state.overflow,'UI bounds failed');
  assert.deepEqual(state.duplicateIds,[],'Duplicate DOM ids');
  assert.equal(state.collision?.indexedPoints,state.pointEntities,'Point index lost or retained an entity');
  assert.equal(state.collision?.indexedLabels,state.labelEntities,'Label index lost or retained an entity');
  assert.equal(state.collision?.disposed,false,'Collision listener disposed during an active page');
  assert.equal(state.cleanup?.pendingTimers,0,'Overview cleanup still scheduled in a story');
  return state;
}
try{
  await waitForDeployment();
  // Normal defaults: no security flags and no forced WebGL backend.
  browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:412,height:915}});
  await page.addInitScript(()=>{
    const sets={timeout:new Set(),interval:new Set(),raf:new Set()};
    const st=window.setTimeout,si=window.setInterval,raf=window.requestAnimationFrame;
    const ct=window.clearTimeout,ci=window.clearInterval,cr=window.cancelAnimationFrame;
    window.setTimeout=function(cb,ms,...args){if(typeof cb!=='function')return st.call(this,cb,ms,...args);let id;id=st.call(this,(...v)=>{sets.timeout.delete(id);cb.apply(window,v);},ms,...args);sets.timeout.add(id);return id;};
    window.setInterval=function(...args){const id=si.apply(this,args);sets.interval.add(id);return id;};
    window.clearTimeout=function(id){sets.timeout.delete(id);sets.interval.delete(id);return ct.call(this,id);};
    window.clearInterval=function(id){sets.timeout.delete(id);sets.interval.delete(id);return ci.call(this,id);};
    window.requestAnimationFrame=function(cb){let id;id=raf.call(this,t=>{sets.raf.delete(id);cb(t);});sets.raf.add(id);return id;};
    window.cancelAnimationFrame=function(id){sets.raf.delete(id);return cr.call(this,id);};
    window.__R6_QA_PENDING__=()=>Object.fromEntries(Object.entries(sets).map(([k,s])=>[k,s.size]));
  });
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(r?.ok(),'Production page unreachable');
  report.actualURL=page.url();
  await page.waitForFunction(()=>window.NG14?.viewer&&NG14.news?.length===13&&NG14.__v52FlagsOverviewClean&&document.getElementById('next')?.onclick,null,{timeout:90000});
  const edition=await page.evaluate(()=>({date:NG14.meta?.date,key:NG14.DATA_KEY,lock:NG14.DAILY_LOCK,retiredController:!!NG14.__v52AuthoritativeController,titles:NG14.news.map(n=>n.title)}));
  assert.equal(edition.date,expected.meta.date);assert.equal(edition.key,expected.DATA_KEY);assert.equal(edition.lock,expected.DAILY_LOCK);
  assert.equal(edition.retiredController,false,'Retired post-controller loaded');
  assert.deepEqual(edition.titles,Array.from(expected.demo,n=>n.title));
  report.edition=edition;
  const borders=await page.evaluate(()=>({
    ownership:NG14.v52ChinaBoundaryOwnership?.getDiagnostics(),
    count:NG14.borderEntities.length,
    canonical:NG14.countries.get('CHN').entities.every(e=>e._chinaAuthoritativeOutline&&NG14.viewer.entities.contains(e)),
    stale:NG14.borderEntities.some(e=>!NG14.viewer.entities.contains(e)),
    cache:[...document.querySelectorAll('script[src]')].map(e=>e.getAttribute('src')).filter(s=>/china-border-ownership|v51-scene-engine/.test(s)),
  }));
  assert.equal(borders.ownership?.removedGenericEdges,177,'Neighbor-side China frontier was not replaced');
  assert.equal(borders.ownership?.authoritativeRings,514,'Authoritative territory/island rings were lost');
  assert.equal(borders.count,7955);assert.equal(borders.canonical,true);assert.equal(borders.stale,false);
  assert.ok(borders.cache.some(s=>s.includes('china-border-ownership')&&s.endsWith('?v=20261007-r6-china-border-ownership')));
  assert.ok(borders.cache.some(s=>s.includes('v51-scene-engine')&&s.endsWith('?v=20261009-r6-ground-geography')));
  report.checks.push({name:'single-authoritative-china-boundary',state:borders});
  for(let i=0;i<13;i++){
    await page.locator('#next').click();
    const state=await settled(i);report.stories.push(state);
    await page.screenshot({path:dir+'/top-'+String(i+1).padStart(2,'0')+'.png',fullPage:true});
    console.log('R6_TOP_'+(i+1)+'_PASS',state.mode,state.lon,state.lat);
  }
  await page.locator('#prev').click();await settled(11);
  await page.locator('#next').click();await settled(12);
  for(let i=0;i<30;i++)await page.locator('#next').click();
  for(let i=0;i<10;i++)await page.locator('#prev').click();
  report.checks.push({name:'prev-next-and-40-rapid-clicks',state:await settled((12+20)%13)});
  for(const [width,height]of [[360,800],[800,360],[390,844],[1280,720]]){
    await page.setViewportSize({width,height});
    report.checks.push({name:'viewport-'+width+'x'+height,state:await settled((12+20)%13)});
    await page.screenshot({path:dir+'/viewport-'+width+'x'+height+'.png',fullPage:true});
  }
  for(let i=0;i<8;i++)await page.locator('#all').click();
  const replacedOverview=await page.evaluate(inspect);
  assert.ok(replacedOverview.cleanup.pendingTimers<=9,'Repeated overview requests accumulated cleanup jobs');
  await page.locator('#next').click();
  report.checks.push({name:'eight-overviews-then-story',state:await settled((12+21)%13)});
  await page.locator('#all').click();
  await page.waitForTimeout(5500); // R6's existing overview cleanup schedules work through 5 seconds.
  const overview=await page.evaluate(inspect);
  assert.equal(overview.overview,true);assert.equal(overview.sceneEntities,0);assert.equal(overview.markersVisible,0);
  assert.equal(overview.cleanup.pendingTimers,0,'Final overview cleanup jobs did not drain');
  assert.equal(overview.collision.indexedPoints,overview.pointEntities);
  assert.equal(overview.collision.indexedLabels,overview.labelEntities);
  await page.screenshot({path:dir+'/overview.png',fullPage:true});
  report.checks.push({name:'overview-cleanup',state:overview});
  // Dedicated screenshots use the actual production Cesium scene. These camera
  // destinations are test views only; no production camera/event data is changed.
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#timeline button').nth(0).click();
  await page.waitForFunction(()=>NG14.v51SceneEntities.filter(e=>e.polygon).length===514&&!NG14.viewer.camera._currentFlight,null,{timeout:35000});
  const countryFill=await page.evaluate(()=>({fills:NG14.v51SceneEntities.filter(e=>e.polygon).length,
    rings:NG14.countries.get('CHN').authoritativeOutline.geometry.coordinates.length}));
  assert.equal(countryFill.fills,countryFill.rings);
  await page.screenshot({path:dir+'/china-country-highlight.png',fullPage:true});
  report.checks.push({name:'china-country-fill-aligned',state:countryFill});
  await settled(0);
  await page.locator('#all').click();await page.waitForTimeout(5500);
  for(const [name,lon,lat,height]of [
    ['china-national',103.5,35.5,18000000],['china-border-northwest',82.3,45.2,420000],
    ['china-border-northeast',132.7,47.9,450000],['china-border-korea',126.1,41.0,450000],
    ['china-border-southwest',93.4,28.6,900000],['china-border-vietnam',107.1,22.1,380000],
    ['china-taiwan',121.0,24.0,1600000],['china-south-sea',112.0,14.0,3400000],
  ]){
    await page.evaluate(({lon,lat,height})=>{
      const C=Cesium;NG14.viewer.camera.cancelFlight();
      NG14.viewer.camera.setView({destination:C.Cartesian3.fromDegrees(lon,lat,height),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0}});
    },{lon,lat,height});
    await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:12000}).catch(()=>{});
    await page.waitForTimeout(500);
    await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});
    const state=await page.evaluate(inspect);
    assert.equal(state.sceneEntities,0);assert.equal(state.markersVisible,0);
    assert.ok(Math.abs(state.aspect-16/9)<.01&&state.canvasFits&&!state.overflow);
    report.checks.push({name,state});
  }
  await page.setViewportSize({width:360,height:800});
  await page.locator('#timeline button').nth(11).click();
  const chinaMobile=await settled(11);
  await page.screenshot({path:dir+'/china-border-mobile.png',fullPage:true});
  report.checks.push({name:'china-border-mobile',state:chinaMobile});
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.consoleErrors,[]);
  report.status='PASS';console.log('R6_PRODUCTION_13_13_PASS',expected.DAILY_LOCK);
}catch(error){
  report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;
  if(page){report.lastState=await page.evaluate(inspect).catch(()=>null);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
  console.error(report.error);
}finally{
  fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));
  await browser?.close();
}
