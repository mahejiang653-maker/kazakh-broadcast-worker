import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';

const url=process.env.GLOBE_URL||'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const out=path.resolve(process.env.GLOBE_OUTPUT||'globe-verify-r6-attack-stages');
fs.mkdirSync(out,{recursive:true});
const cases=JSON.parse(fs.readFileSync('tests/fixtures/r6-attack-stages-20261016.json')).cases;
const payload=JSON.parse(fs.readFileSync('tests/fixtures/r6-daily10-20261014.json'));
payload.meta={...payload.meta,dataLock:'R6-ATTACK-STAGES-REGRESSION',regressionOnly:true};
payload.news.splice(2,2,...cases); // Keep navigation at the reported Top3 and Top4 positions.
const fixture=path.join(out,'import-regression.json');fs.writeFileSync(fixture,JSON.stringify(payload));
const report={url,startedAt:new Date().toISOString(),localOverrides:!!process.env.GLOBE_LOCAL,
 fixtureNote:'Recovered Top3/Top4 fields inserted into the existing ten-story regression fixture; not the full original Oct16 edition.',
 checks:[],pageErrors:[],consoleErrors:[],consoleWarnings:[],resources:[],status:'RUNNING'};
const browser=await chromium.launch({headless:true,
 ...(process.env.GLOBE_CHROMIUM_PATH?{executablePath:process.env.GLOBE_CHROMIUM_PATH}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
 ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'}}:{})});
let page,context;
const pass=(name,data={})=>{report.checks.push({name,at:new Date().toISOString(),...data});console.log('PASS',name);};
async function state(){return page.evaluate(()=>{
 const G=NG14,C=Cesium,v=G.viewer,t=v.clock.currentTime,rect=v.scene.canvas.getBoundingClientRect(),a=G.v52Attack.getDiagnostics();
 const target=a?.target||G.news[G.current];
 const p=C.SceneTransforms.worldToWindowCoordinates(v.scene,C.Cartesian3.fromDegrees(target.lon,target.lat,30000));
 const project=q=>C.SceneTransforms.worldToWindowCoordinates(v.scene,q);
 const within=q=>q&&q.x>=0&&q.y>=0&&q.x<=rect.width&&q.y<=rect.height;
 const occluder=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,v.camera.positionWC);
 const gpuReady=e=>{
  const visit=primitive=>{
   if(typeof primitive.get==='function'&&Number.isInteger(primitive.length)){
    for(let i=0;i<primitive.length;i++)if(visit(primitive.get(i)))return true;return false;
   }
   if(primitive.ready&&typeof primitive.getGeometryInstanceAttributes==='function'){
    try{const attrs=primitive.getGeometryInstanceAttributes(e);return !!attrs&&(!attrs.show||attrs.show[0]!==0);}catch{}
   }return false;
  };return visit(v.scene.primitives);
 };
 const scope=G.v52StoryBorders.getDiagnostics();
 const measure=document.createElement('canvas').getContext('2d');
 const countryNames=[a?.attacker,a?.victim].filter(Boolean).map(iso=>G.countryName(iso));
 return {index:G.current,serial:G.navSerial,title:document.querySelector('#title').textContent,attack:a,
  cameraMoving:!!v.camera._currentFlight,cameraHeight:v.camera.positionCartographic.height,
  target:p?{x:p.x,y:p.y,visible:occluder.isPointVisible(C.Cartesian3.fromDegrees(target.lon,target.lat,30000))}:null,
  canvas:rect.toJSON(),viewport:{width:innerWidth,height:innerHeight},scope,
  countries:(a?[a.attacker,a.victim]:[]).filter(Boolean).map(iso=>{
   const c=G.countries.get(iso),fills=G.v51SceneEntities.filter(e=>e.__v52TerritoryFill&&e.__v52CountryIso===iso&&v.entities.contains(e));
   return {iso,fills:fills.length,readyFills:fills.filter(gpuReady).length,
    outlineSegments:(c?.entities||[]).filter(e=>e.polyline).length,
    visibleBorderPoints:(c?.entities||[]).filter(e=>e.show&&e.polyline).flatMap(e=>e.polyline.positions.getValue(t)).filter(p=>within(project(p))&&occluder.isPointVisible(p)).length};
  }),
  flags:[...document.querySelectorAll('img[alt$=" flag"]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>({iso:e.alt.split(' ')[0],complete:e.complete,width:e.naturalWidth,rect:e.getBoundingClientRect().toJSON()})),
  labels:G.v51SceneEntities.filter(e=>e.label).map(e=>e.label.text.getValue(t)),
  countryLabels:G.v51SceneEntities.filter(e=>e.label&&countryNames.includes(e.label.text.getValue(t))).map(e=>{
   const l=e.label,p=project(e.position.getValue(t)),offset=l.pixelOffset.getValue(t),text=l.text.getValue(t);
   measure.font=l.font.getValue(t);const half=measure.measureText(text).width/2+9;
   return {text,anchorVisible:within(p)&&occluder.isPointVisible(e.position.getValue(t)),
    left:p.x+offset.x-half,right:p.x+offset.x+half,top:p.y+offset.y-13,bottom:p.y+offset.y+13};
  }),
  invalidBorders:G.borderEntities.filter(e=>e.show&&![...e._countryIsos].some(iso=>scope.countries.includes(iso))).length,
  staleEntities:v.entities.values.filter(e=>e.__v52AttackSerial!=null&&e.__v52AttackSerial!==G.navSerial).length,
  entityCount:v.entities.values.length};
 });}
async function stage(name,{still=false}={}){
 await page.waitForFunction(({name,still})=>NG14.v52Attack.getDiagnostics()?.stage===name&&(!still||!NG14.viewer.camera._currentFlight),{name,still},{timeout:120000});
 return state();
}
async function select(index){await page.locator('#timeline button').nth(index).click();}
async function screenshot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
function verify(s,index,scope){
 assert.equal(s.index,index);assert.equal(s.title,cases[index-2].title);assert.equal(s.serial,s.attack.serial);
 assert.deepEqual([...s.scope.countries].sort(),scope.slice().sort());
 assert.equal(s.invalidBorders,0);assert.equal(s.staleEntities,0);
 assert.equal(s.attack.source,null);assert.equal(s.attack.trajectory,false);
 // The no-red-fill V52 renderer intentionally removes sovereign polygon meshes.
 // Verify real white border geometry remains available for both countries.
 assert.ok(s.countries.every(c=>c.fills>0),'each attack participant must have a real clipped sovereign colour polygon');
 assert.ok(s.countries.every(c=>c.outlineSegments>0),'countries must have real white-outline geometry');
 assert.ok(s.flags.every(f=>scope.includes(f.iso)),'no unrelated national flags');
 for(const label of s.countryLabels.filter(l=>l.anchorVisible)){
  assert.ok(label.left>=0&&label.right<=s.canvas.width&&label.top>=0&&label.bottom<=s.canvas.height,'country label must not be clipped: '+label.text);
 }
}
async function completeCase(index,name){
 await select(index);
 const overview=await stage('country-overview',{still:true});verify(overview,index,index===2?['UKR','RUS']:['YEM']);
 assert.ok(overview.countries.every(c=>c.visibleBorderPoints>0),'each involved country must be visible during overview');
 assert.equal(overview.attack.impactCount,0);assert.equal(overview.attack.geometryReady,true);
 await screenshot(name+'-overview');pass(name+'-country-overview',overview);
  // Use a fresh take for the transient impact capture: software WebGL can
  // finish the animation while encoding the preceding full-page screenshot.
  await select(index);
 const impact=await stage('impact');verify(impact,index,index===2?['UKR','RUS']:['YEM']);
 assert.ok(impact.target?.visible);assert.ok(Math.abs(impact.target.x-impact.canvas.width/2)<impact.canvas.width*.2);
 assert.ok(Math.abs(impact.target.y-impact.canvas.height/2)<impact.canvas.height*.2);
 assert.ok(impact.cameraHeight<overview.cameraHeight,'camera must approach the actual impact location');
 assert.ok(impact.labels.includes(cases[index-2].location));
 await screenshot(name+'-impact');pass(name+'-target-approach',impact);
 const final=await stage('settled');verify(final,index,index===2?['UKR','RUS']:['YEM']);
 assert.equal(final.attack.impactCount,3);assert.equal(final.attack.pendingTimers,0);
 await screenshot(name+'-settled');pass(name+'-three-impacts-and-idle',final);
 return final;
}
try{
 const views=[['desktop',{width:1440,height:810}],['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]];
 for(const [name,viewport] of views.filter(([name])=>!process.env.GLOBE_STAGE_VIEW||process.env.GLOBE_STAGE_VIEW===name)){
  context=await browser.newContext({viewport,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
  page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());if(m.type()==='warning')report.consoleWarnings.push(m.text());});
  page.on('response',r=>{if(/news-globe-v52-attack-model|news-globe-v14-v51-scene-engine/.test(r.url()))report.resources.push({url:r.url(),status:r.status()});});
  if(process.env.GLOBE_LOCAL)await page.route(new URL(url).origin+'/**',route=>{
   const root=path.resolve('public'),file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/json'});
   return route.continue();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.NG14?.v52Attack&&NG14.countries?.size>0&&document.querySelector('#dailyLockFile'),null,{timeout:120000});
  await page.locator('#settingsBtn').click();await page.locator('#dailyLockFile').setInputFiles(fixture);
  await page.waitForFunction(()=>NG14.news[2]?.location==='梁赞');
  if(await page.locator('#closeBtn').isVisible())await page.locator('#closeBtn').click();
  pass(name+'-file-import',{stories:await page.evaluate(()=>NG14.news.length)});
  await completeCase(2,name+'-top3');await completeCase(3,name+'-top4');
  if(name==='desktop'){
   await page.locator('#prev').click();await stage('settled');assert.equal((await state()).index,2);pass('previous-top4-to-top3');
   await page.locator('#next').click();await stage('settled');assert.equal((await state()).index,3);pass('next-top3-to-top4');
   for(const phase of ['country-overview','target-approach']){
    await select(2);await stage(phase);await page.evaluate(()=>NG14.viewer.camera.cancelFlight());
    const cancelled=await stage('cancelled');assert.equal(cancelled.attack.impactCount,0);
    await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics().playbackReady);
    assert.equal((await state()).attack.impactCount,0);pass('cancelled-'+phase,cancelled);
   }
   await select(2);await stage('target-approach');await page.setViewportSize({width:390,height:844});
   await stage('settled');verify(await state(),2,['UKR','RUS']);pass('resize-during-approach');
   for(const size of [{width:844,height:390},{width:390,height:844},{width:1100,height:700}]){
    await page.setViewportSize(size);await page.waitForTimeout(1600);
    const s=await state();verify(s,2,['UKR','RUS']);assert.ok(s.target?.visible);assert.equal(s.cameraMoving,false);
    await screenshot('resize-'+size.width+'x'+size.height);pass('resize-'+size.width+'x'+size.height,s);
   }
   await page.setViewportSize(viewport);
   for(let i=0;i<24;i++)await page.locator(i%2?'#next':'#prev').click();
   await select(3);await stage('settled');verify(await state(),3,['YEM']);pass('rapid-navigation-latest-wins',await state());
   const ids=await page.evaluate(()=>NG14.v51SceneEntities.map(e=>e.id));
   await select(0);await page.waitForFunction(()=>NG14.current===0&&!NG14.viewer.camera._currentFlight&&NG14.v51SceneEntities.some(e=>e.point));
   await page.waitForTimeout(4000);const clean=await state();assert.equal(clean.attack,null);assert.equal(clean.staleEntities,0);
   assert.equal(await page.evaluate(ids=>ids.filter(id=>NG14.viewer.entities.getById(id)).length,ids),0);pass('attack-to-ordinary-complete-entity-cleanup',clean);
   await select(2);await stage('impact');await page.locator('#all').click();await page.waitForTimeout(3500);
   const overview=await state();assert.equal(overview.attack,null);assert.equal(overview.staleEntities,0);assert.equal(overview.scope.visibleBorders,0);
   pass('overview-cancels-animation-and-cleans',overview);await screenshot('clean-overview');
  }
  await context.close();context=null;
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);try{await screenshot('failure');report.failureState=await state();}catch{}}
finally{
 report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'stages-report.json'),JSON.stringify(report,null,2));
 await context?.close();await browser.close();console.log('ATTACK_STAGES_'+report.status);
}
