import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
const root=path.resolve('public'),fixture=path.resolve('tests/fixtures/r6-daily10-20261014.json');
const payload=JSON.parse(fs.readFileSync(fixture));
const url=process.env.GLOBE_URL||'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=path.resolve(process.env.GLOBE_OUTPUT||'globe-verify-r6-attacks');fs.mkdirSync(dir,{recursive:true});
const report={url,localOverrides:!!process.env.GLOBE_LOCAL,flagCDNBlocked:!!process.env.GLOBE_BLOCK_FLAG_CDN,fixture:path.basename(fixture),fixtureSHA256:crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),checks:[],pageErrors:[],consoleErrors:[],requests:[],status:'RUNNING'};
const browser=await chromium.launch({headless:true,
 ...(process.env.GLOBE_CHROMIUM_PATH?{executablePath:process.env.GLOBE_CHROMIUM_PATH}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
 ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'}}:{})});
let context,page,videoStart=0,releaseWorkers=()=>{};
const log=(name,state)=>{report.checks.push({name,at:new Date().toISOString(),videoOffsetSeconds:videoStart?(Date.now()-videoStart)/1000:null,...state});console.log('PASS',name);};
async function state(){return page.evaluate(()=>{
 const G=NG14,C=Cesium,v=G.viewer,t=v.clock.currentTime,scene=v.scene,rect=scene.canvas.getBoundingClientRect();
 const current=G.news[G.current],a=G.v52Attack?.getDiagnostics(),project=p=>C.SceneTransforms.worldToWindowCoordinates(scene,p);
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

 const within=p=>!!p&&p.x>=0&&p.y>=0&&p.x<=rect.width&&p.y<=rect.height;
 const occluder=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,v.camera.positionWC);
 const countries=(a?[a.attacker,a.victim]:[current.countryIso3]).filter(Boolean).map(iso=>{
  const c=G.countries.get(iso),coords=G.collect(c?.feature?.geometry||{},[]);
  const projected=coords.map(q=>project(C.Cartesian3.fromDegrees(q[0],q[1])));
  let borderPoints=0;for(const e of c?.entities||[])if(e.show)for(const p of e.polyline.positions.getValue(t))if(within(project(p))&&occluder.isPointVisible(p))borderPoints++;
  const fills=G.v51SceneEntities.filter(e=>e.__v52AttackKind==='country-'+iso&&v.entities.contains(e));
  return {iso,exists:!!c,coordinates:coords.length,inside:projected.filter(within).length,screenInside:projected.filter(p=>p&&rect.left+p.x>=0&&rect.left+p.x<=innerWidth&&rect.top+p.y>=0&&rect.top+p.y<=innerHeight).length,borderPoints,
   fills:fills.length,readyFills:fills.filter(gpuReady).length,borderReady:(c?.entities||[]).some(e=>e.show&&gpuReady(e))};
 });
 const flags=[...document.querySelectorAll('img[alt$=" flag"]')].map(e=>({iso:e.alt.split(' ')[0],source:e.dataset.flagSource,visible:getComputedStyle(e).display!=='none',complete:e.complete,naturalWidth:e.naturalWidth,rect:e.getBoundingClientRect().toJSON()}));
 const target=a?.target||{lon:+current.lon,lat:+current.lat};
 const p=project(C.Cartesian3.fromDegrees(target.lon,target.lat,30000));
 const selected=new Set(G.v52StoryBorders.getDiagnostics().countries);
 const effects=G.v51SceneEntities.filter(e=>e.__v52AttackKind==='impact'&&v.entities.contains(e)).map(e=>({width:e.billboard.width.getValue(t),alpha:e.billboard.color.getValue(t).alpha,scale:e.billboard.scale.getValue(t)}));
 return {index:G.current,title:document.querySelector('#title').textContent,news:current,attack:a,countries,flags,effects,
  target:p?{x:rect.x+p.x,y:rect.y+p.y}:null,canvas:rect.toJSON(),viewport:{width:innerWidth,height:innerHeight},cameraHeight:v.camera.positionCartographic.height,
  cameraMoving:!!v.camera._currentFlight,scope:G.v52StoryBorders.getDiagnostics(),
  invalidBorders:G.borderEntities.filter(e=>e.show&&![...e._countryIsos].some(x=>selected.has(x))).length,
  targetPoints:G.v51SceneEntities.filter(e=>e.point&&e.show!==false&&C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(target.lon,target.lat))<200).length,
  labels:G.v51SceneEntities.filter(e=>e.label).map(e=>e.label.text.getValue(t)),
  staleAttackEntities:v.entities.values.filter(e=>e.__v52AttackSerial!=null&&e.__v52AttackSerial!==G.navSerial).length,
  performance:G.v52Performance.getDiagnostics()};
 });}
async function select(index){await page.locator('#timeline button').nth(index).click();}
async function settled(){await page.waitForFunction(()=>NG14.v52Attack?.getDiagnostics()?.stage==='settled',null,{timeout:120000});}
async function flagsReady(isos){await page.waitForFunction(isos=>isos.every(iso=>[...document.querySelectorAll('img[alt$=" flag"]')].some(e=>e.alt===iso+' flag'&&e.complete&&e.naturalWidth>0&&getComputedStyle(e).display!=='none')),isos,{timeout:30000});}
function verifyTop2(s){
 assert.equal(s.index,1);assert.equal(s.attack.attacker,'RUS');assert.equal(s.attack.victim,'UKR');
 assert.equal(s.attack.source,null);assert.equal(s.attack.trajectory,false);assert.equal(s.attack.geometryReady,true);assert.equal(s.attack.geometryTimedOut,false);
 assert.deepEqual(s.scope.countries,['RUS','UKR']);assert.equal(s.invalidBorders,0);
 for(const iso of ['RUS','UKR']){
  const c=s.countries.find(c=>c.iso===iso);assert.ok(c?.exists&&c.fills>0&&c.borderPoints>10,iso+' must be rendered in the viewport');
  assert.equal(c.readyFills,c.fills,iso+' country meshes must be present in ready GPU primitives');assert.equal(c.borderReady,true,iso+' border must be present in a ready GPU primitive');
  const f=s.flags.find(f=>f.iso===iso);assert.equal(f?.source,'bundled',iso+' must not depend on the remote flag CDN');assert.ok(f?.visible&&f.complete&&f.naturalWidth>0,iso+' flag image must be visible');
  assert.ok(f.rect.left>=s.canvas.left&&f.rect.right<=s.canvas.right&&f.rect.top>=s.canvas.top&&f.rect.bottom<=s.canvas.bottom,iso+' flag must remain inside globe');
  assert.ok(!(s.target.x>=f.rect.left-6&&s.target.x<=f.rect.right+6&&s.target.y>=f.rect.top-6&&s.target.y<=f.rect.bottom+6),iso+' flag must not cover the target');
 }
 const victim=s.countries.find(c=>c.iso==='UKR');assert.equal(victim.inside,victim.coordinates,'all victim-country outline vertices must be on screen');
 assert.equal(victim.screenInside,victim.coordinates,'all victim outline vertices must also be visible in the actual browser viewport');
 assert.ok(s.flags.filter(f=>f.visible).every(f=>f.rect.left>=0&&f.rect.right<=s.viewport.width&&f.rect.top>=0&&f.rect.bottom<=s.viewport.height),'flags must be inside the actual browser viewport');
 assert.ok(s.targetPoints>0);assert.equal(s.staleAttackEntities,0);assert.ok(s.labels.includes('基辅'));
}
async function ordinaryReady(index){
 await page.waitForFunction(index=>{
  const G=NG14,C=Cesium,n=G.news[index],t=G.viewer.clock.currentTime;
  return G.current===index&&!G.viewer.camera._currentFlight&&G.v51SceneEntities.some(e=>e.point&&e.show!==false&&e.position&&C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(n.lon,n.lat))<1000);
 },index,{timeout:45000});
}
async function start(viewport,name){
 context=await browser.newContext({viewport,deviceScaleFactor:1,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY,
  ...(process.env.GLOBE_RECORD&&name==='mobile'?{recordVideo:{dir:path.join(dir,'video'),size:viewport}}:{})});
 videoStart=Date.now();page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.stack));
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('news-globe-v52-attack-model')||r.url().includes('news-globe-v14-v51-scene-engine'))report.requests.push({url:r.url(),status:r.status()});});
 if(name==='mobile'){const gate=new Promise(resolve=>{releaseWorkers=resolve;});await page.route('**/Build/Cesium/Workers/**',async route=>{await gate;await route.continue();});}
 if(process.env.GLOBE_BLOCK_FLAG_CDN)await page.route('https://flagcdn.com/**',route=>route.abort());
 if(process.env.GLOBE_LOCAL)await page.route(new URL(url).origin+'/**',route=>{
  const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.gz')?'application/gzip':'application/json'});
  return route.continue();
 });
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.NG14?.v52Attack&&NG14.__v52FlagsOverviewClean&&NG14.countries?.size>0&&document.querySelector('#dailyLockFile'),null,{timeout:120000});
 await page.locator('#settingsBtn').click();await page.locator('#dailyLockFile').setInputFiles(fixture);
 await page.waitForFunction(()=>NG14.news[1]?.title.includes('未获提前预警'));
 if(await page.locator('#closeBtn').isVisible())await page.locator('#closeBtn').click();
 assert.equal(await page.evaluate(()=>NG14.news.length),10);
 log(name+'-direct-file-import',{count:10});
}
async function genericCase(name,story){
 await page.evaluate(story=>{NG14.news[1]=story;},story);
 await select(1);await page.waitForFunction(()=>{const d=NG14.v52Attack.getDiagnostics();return d&&['flight','impact'].includes(d.stage);},null,{timeout:120000});
 const a=story.scenePlan.attackerIso3,b=story.countryIso3;await flagsReady([a,b]);
 const s=await state();assert.equal(s.attack.attacker,a);assert.equal(s.attack.victim,b);
 assert.equal(s.invalidBorders,0);assert.deepEqual(s.scope.countries,[a,b].sort());
 assert.equal(s.attack.trajectory,!!story.sourceLon);
 if(story.sourceLon){
  const paths=await page.evaluate(()=>NG14.v51SceneEntities.filter(e=>e.__v52AttackKind==='trajectory').map(e=>e.polyline.positions.getValue(NG14.viewer.clock.currentTime).map(p=>Cesium.Cartographic.fromCartesian(p).height)));
  assert.equal(paths.length,1);assert.ok(paths[0].every(h=>h>=34000));assert.ok(Math.max(...paths[0])>50000);
  log(name+'-spherical-path',{minimumAltitude:Math.min(...paths[0]),maximumAltitude:Math.max(...paths[0])});
 }
 await page.screenshot({path:path.join(dir,name+'.png')});await settled();
 const final=await state();assert.ok(final.countries.every(c=>c.borderPoints>0&&c.fills>0&&c.readyFills===c.fills&&c.borderReady));assert.ok(final.attack.impactCount>=3);assert.equal(final.attack.pendingTimers,0);
 log(name,final);
}
try{
 for(const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:810}],['landscape',{width:844,height:390}]].filter(([name])=>!process.env.GLOBE_VIEW||process.env.GLOBE_VIEW===name)){
  await start(viewport,name);
  // Exercise the actual navigation path, then warm the two flag images once.
  await select(0);await ordinaryReady(0);await select(1);
  if(name==='mobile'){
   await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics()?.stage==='geometry',null,{timeout:20000});
   const pending=await state();assert.equal(pending.attack.geometryReady,false);assert.equal(pending.attack.impactCount,0);assert.ok(pending.countries.some(c=>c.readyFills<c.fills));log('cold-workers-defer-animation',pending);
   await select(2);assert.equal((await state()).attack,null);assert.equal((await state()).staleAttackEntities,0);log('navigation-cancels-pending-geometry',{});
   await select(1);releaseWorkers();
  }
  await flagsReady(['RUS','UKR']);await settled();
  await select(1);await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics()?.stage==='impact',null,{timeout:120000});await page.waitForTimeout(400);
  const animated=await state();verifyTop2(animated);assert.ok(animated.effects.some(e=>e.width>=80&&e.alpha>.1));
  await page.screenshot({path:path.join(dir,'top2-'+name+'-impact.png')});log('top2-'+name+'-impact',animated);
  await settled();const final=await state();verifyTop2(final);assert.equal(final.attack.pendingTimers,0);assert.equal(final.attack.impactCount,3);
  await page.screenshot({path:path.join(dir,'top2-'+name+'-settled.png')});log('top2-'+name+'-settled',final);
  if(name==='mobile'){await page.waitForTimeout(6000);const held=await state();verifyTop2(held);assert.equal(held.attack.pendingTimers,0);await page.screenshot({path:path.join(dir,'top2-mobile-static-6s.png')});log('top2-mobile-static-six-seconds',held);}
  await select(2);await ordinaryReady(2);assert.equal((await state()).attack,null);assert.equal((await state()).staleAttackEntities,0);log(name+'-top2-to-top3',{});
  await select(1);await settled();verifyTop2(await state());log(name+'-top3-to-top2',{});
  if(name==='mobile'){
   await page.setViewportSize({width:844,height:390});await page.waitForTimeout(1200);verifyTop2(await state());
   await page.setViewportSize(viewport);await page.waitForTimeout(1200);verifyTop2(await state());log('orientation-change',{});
   for(let i=0;i<18;i++)await select(i%3);
   await select(2);await ordinaryReady(2);await page.waitForTimeout(4000);
   const clean=await state();assert.equal(clean.attack,null);assert.equal(clean.staleAttackEntities,0);assert.ok(clean.flags.every(f=>f.iso==='IRN'));log('rapid-switch-cancellation',clean);
   for(let i=0;i<10;i++){
    await select(i);if(i===1){await settled();verifyTop2(await state());}else {await ordinaryReady(i);await flagsReady([payload.news[i].scenePlan?.primaryIso3||payload.news[i].countryIso3]);}
    const s=await state();assert.equal(s.index,i);assert.equal(s.title,payload.news[i].title);assert.equal(s.invalidBorders,0);assert.equal(s.staleAttackEntities,0);
    const primary=payload.news[i].scenePlan?.primaryIso3||payload.news[i].countryIso3;
    assert.ok(s.flags.some(f=>f.iso===primary&&f.source==='bundled'&&f.complete&&f.naturalWidth>0&&f.visible),'actual Top'+(i+1)+' primary flag must render');
    await page.screenshot({path:path.join(dir,'edition-top'+(i+1)+'.png')});log('actual-edition-top'+(i+1),s);
   }
  }
  const video=page.video();await context.close();
  if(video)await video.saveAs(path.join(dir,'top2-mobile.webm'));
 }
 // The same renderer must work without Russia/Ukraine-specific cases.
 await start({width:390,height:844},'generic');
 const base={id:2,title:'通用攻击渲染验收',location:'目标地点',focusLabel:'目标地点',placeType:'city',sceneMode:'MISSILE_ATTACK',eventType:'missile_attack'};
 for(const [name,att,vic,lon,lat,source] of [
  ['israel-iran-unknown','ISR','IRN',51.39,35.69,null],
  ['congo-uganda-unknown','COD','UGA',32.58,.35,null],
  ['india-pakistan-missile','IND','PAK',73.04,33.69,[74.86,31.63]],
  ['israel-iran-drone','ISR','IRN',51.39,35.69,[34.78,32.08]],
  ['dateline-known','USA','JPN',139.69,35.68,[-157.85,21.3]]]){
  await genericCase(name,{...base,countryIso3:vic,lon,lat,attackType:name.includes('drone')?'drone':'missile',
   ...(source?{sourceLon:source[0],sourceLat:source[1]}:{}),scenePlan:{attackerIso3:att,victimIso3:vic,sourceUnconfirmed:!source,sourcePrecision:source?'exact':'unknown'}});
 }
 await page.evaluate(p=>{NG14.news=p.news;},payload);
 await select(1);await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics()?.stage==='impact',null,{timeout:120000});await page.locator('#all').click();await page.waitForTimeout(4200);
 assert.equal((await state()).attack,null);assert.equal((await state()).scope.visibleBorders,0);log('overview-cancels-attack',{});
 await context.close();assert.deepEqual(report.pageErrors,[]);
 assert.ok(!report.consoleErrors.some(x=>/SecurityError|image for billboard|rendering has stopped|DeveloperError/.test(x)),report.consoleErrors.join('\n'));
 report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;try{await page?.screenshot({path:path.join(dir,'failure.png')});}catch{}}
finally{releaseWorkers();fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log('ATTACK_VISUAL_'+report.status);}
