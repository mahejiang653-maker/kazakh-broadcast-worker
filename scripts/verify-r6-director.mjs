import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const url=process.env.GLOBE_URL||'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const out=path.resolve(process.env.GLOBE_OUTPUT||'globe-verify-r6-director');
fs.mkdirSync(out,{recursive:true});
const payload=JSON.parse(fs.readFileSync('tests/fixtures/r6-daily10-20261014.json'));
payload.news.splice(2,2,...JSON.parse(fs.readFileSync('tests/fixtures/r6-attack-stages-20261016.json')).cases);
const file=path.join(out,'import-regression.json');fs.writeFileSync(file,JSON.stringify(payload));
const report={url,localOverrides:!!process.env.GLOBE_LOCAL,startedAt:new Date().toISOString(),checks:[],pageErrors:[],consoleErrors:[],status:'RUNNING'};
const browser=await chromium.launch({headless:true,
  ...(process.env.GLOBE_CHROMIUM_PATH?{executablePath:process.env.GLOBE_CHROMIUM_PATH}:{}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'}}:{})});
console.log('BROWSER_READY');
let page,context;
const pass=(name,data={})=>{report.checks.push({name,...data});console.log('PASS',name);};
const state=()=>page.evaluate(()=>({director:NG14.v52Director.getState(),attack:NG14.v52Attack.getDiagnostics(),
  serial:NG14.navSerial,index:NG14.current,playing:NG14.playing,overview:NG14.overviewMode,
  moving:!!NG14.viewer.camera._currentFlight,
  stale:NG14.viewer.entities.values.filter(e=>e.__v52AttackSerial!=null&&e.__v52AttackSerial!==NG14.navSerial).length,
  controls:document.querySelectorAll('#v52DirectorControls').length}));
const paused=phase=>page.waitForFunction(phase=>{
  const d=NG14.v52Director.getState();return d.paused&&d.phase===phase;
},phase,{timeout:120000});
// Observe an animated phase and click its real DOM handler in the same browser
// task. A separate Playwright click can arrive after a short camera flight on
// a busy software-GPU runner, which correctly requests an end-of-effects pause.
async function pauseDuring(kind){
  const handle=await page.waitForFunction(kind=>{
    const d=NG14.v52Director.getState(),a=NG14.v52Attack.getDiagnostics();
    const moving=!!NG14.viewer.camera._currentFlight;
    const ready=kind==='target'?a?.stage==='target-approach'&&moving:
      kind==='ordinary'?d.phase==='location'&&moving:a?.stage==='impact'&&d.effects;
    if(!ready)return false;
    const button=document.getElementById('directorPause');
    if(button.disabled||d.pauseRequested)return false;
    button.click();
    return {phase:d.phase,moving,effects:d.effects,pauseRequested:NG14.v52Director.getState().pauseRequested};
  },kind,{timeout:120000});
  const observed=await handle.jsonValue();await handle.dispose();
  assert.equal(observed.pauseRequested,true);
  if(kind==='effects')assert.equal(observed.effects,true);
  else assert.equal(observed.moving,true);
  return observed;
}
const select=index=>page.locator('#timeline button').nth(index).click();
const shot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
async function openSettings(){
  await page.waitForFunction(()=>typeof document.getElementById('settingsBtn')?.onclick==='function',null,{timeout:120000});
  await page.locator('#settingsBtn').click();
  await page.locator('#drawerBackdrop.show').waitFor({state:'visible'});
  if(!await page.locator('#directorTimingSettings').getAttribute('open')){
    if(!await page.locator('#directorTiming-travel').isVisible())await page.locator('#directorTimingSettings summary').click();
  }
}
async function setTiming(values){
  for(const [key,value] of Object.entries(values))await page.locator('#directorTiming-'+key).fill(String(value));
  await page.locator('#directorSaveTiming').click();
  assert.match(await page.locator('#directorTimingMessage').textContent(),/已保存/);
}
try{
  const views=[['desktop',{width:1440,height:810}],['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]];
  for(const [name,viewport] of views.filter(([name])=>!process.env.GLOBE_DIRECTOR_VIEW||name===process.env.GLOBE_DIRECTOR_VIEW)){
    console.log('OPENING',name);
    context=await browser.newContext({viewport,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
    page=await context.newPage();
    page.on('pageerror',e=>report.pageErrors.push(e.stack));
    page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
    if(process.env.GLOBE_LOCAL)await page.route(new URL(url).origin+'/**',route=>{
      const root=path.resolve('public'),file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
      if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/json'});
      return route.continue();
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    console.log('PAGE_LOADED',name);
    await page.waitForFunction(()=>window.NG14?.v52Director&&NG14.countries?.size>0&&document.querySelector('#dailyLockFile')&&typeof document.getElementById('settingsBtn')?.onclick==='function',null,{timeout:120000});
    await page.locator('#settingsBtn').click();await page.locator('#dailyLockFile').setInputFiles(file);
    await page.waitForFunction(()=>NG14.news[2]?.location==='梁赞');
    if(await page.locator('#closeBtn').isVisible())await page.locator('#closeBtn').click();
    await select(2);await page.locator('#directorPause').click();await paused('country');
    let s=await state();assert.equal(s.attack.impactCount,0);assert.equal(s.moving,false);assert.equal(s.controls,1);
    const serial=s.serial;
    await page.waitForTimeout(1200);s=await state();assert.equal(s.serial,serial);assert.equal(s.attack.stage,'country-overview');
    assert.equal(s.director.pendingTimers,0);await shot(name+'-paused-country');pass(name+'-pause-country',s);
    await page.locator('#directorPause').click();
    const targetRequest=await pauseDuring('target');await paused('location');
    s=await state();assert.equal(s.attack.impactCount,0);assert.equal(s.moving,false);pass(name+'-pause-at-target-before-effects',s);
    await page.locator('#directorPause').click();
    const effectRequest=await pauseDuring('effects');await paused('end');
    s=await state();assert.equal(s.attack.impactCount,3);assert.equal(s.attack.pendingTimers,0);assert.equal(s.stale,0);
    await shot(name+'-paused-end');pass(name+'-effects-complete-before-pause',{...s,targetRequest,effectRequest});
    // The existing attack parser normalizes derived scene fields on first selection.
    // Replay must preserve the already-normalized records, including all facts.
    const data=await page.evaluate(()=>JSON.stringify(NG14.news));
    await page.locator('#directorReplay').click();
    assert.equal((await state()).index,2);assert.ok((await state()).serial>serial);
    assert.equal(await page.evaluate(()=>JSON.stringify(NG14.news)),data);pass(name+'-single-story-replay');

    if(name==='desktop'){
      await openSettings();await setTiming({travel:.5,country:2,admin:1.5,location:.5,finalHold:1});
      assert.equal((await state()).director.timing.country,1,'settings must not alter an in-progress take');
      await page.locator('#closeBtn').click();await page.locator('#directorReplay').click();
      await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics()?.stage==='country-overview'&&!NG14.viewer.camera._currentFlight,null,{timeout:120000});
      const holdStart=Date.now();
      await page.waitForFunction(()=>NG14.v52Attack.getDiagnostics()?.stage==='target-approach');
      assert.ok(Date.now()-holdStart>=2500,'2x country hold must actually extend the shot');
      pass('saved-timing-controls-actual-hold',{observedHoldMs:Date.now()-holdStart});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.NG14?.v52Director&&NG14.countries?.size>0,null,{timeout:120000});
      assert.equal(await page.evaluate(()=>NG14.v52Director.getSettings().country),2);pass('timing-survives-reload');
      await openSettings();await page.locator('#directorResetTiming').click();
      assert.equal(await page.locator('#directorTiming-country').inputValue(),'1');
      await page.locator('#closeBtn').click();
      await select(2);await page.locator('#directorPause').click();await paused('country');
      await page.locator('#play').click();assert.equal((await state()).playing,true);
      await page.locator('#directorReplay').click();assert.equal((await state()).playing,false);pass('replay-stops-auto-play');
      await select(0);await page.locator('#directorPause').click();await paused('country');
      await page.locator('#directorPause').click();
      await pauseDuring('ordinary');await paused('location');
      s=await state();assert.equal(s.attack,null);assert.equal(s.index,0);assert.equal(s.moving,false);
      pass('ordinary-location-can-pause-after-arrival',s);
      await page.locator('#next').click();assert.equal((await state()).index,1);
      assert.equal((await state()).director.paused,false);pass('next-leaves-paused-ordinary-scene');

      // Synthetic renderer fixture in this isolated browser only, not a daily-news publication.
      await page.evaluate(()=>{
        const feature=NG14.chinaLevel1Geo.features.find(f=>/新疆/.test(JSON.stringify(f.properties)));
        if(!feature)throw Error('Bundled China province fixture unavailable');
        NG14.news[8]={...NG14.news[8],title:'行政区分镜工程回归',location:'新疆维吾尔自治区',
          focusLabel:'新疆维吾尔自治区',placeType:'province',sceneMode:'ADMIN',forceAdminChain:true,
          scenePlan:{primaryIso3:'CHN',finalLocation:false,forceAdminChain:true,adminChain:[{
            name:'新疆维吾尔自治区',location:'新疆维吾尔自治区',focusLabel:'新疆维吾尔自治区',
            placeType:'省',focusGeometry:feature.geometry,lon:87.6,lat:43.8}]}};
      });
      await select(8);await page.waitForFunction(()=>NG14.v52Director.getState().phase==='admin',null,{timeout:120000});
      await page.locator('#directorPause').click();await paused('admin');
      s=await state();assert.equal(s.moving,false);
      assert.ok(await page.evaluate(()=>NG14.localHighlightEntities.length>0));
      pass('admin-stage-keeps-actual-province-geometry-while-paused',s);
      for(let i=0;i<12;i++)await page.locator(i%2?'#next':'#prev').click();
      await select(3);await page.locator('#directorPause').click();await paused('country');
      s=await state();assert.equal(s.index,3);assert.equal(s.stale,0);assert.equal(s.director.serial,s.serial);
      pass('rapid-navigation-cancels-old-director-work',s);
      await page.locator('#all').click();await page.waitForTimeout(1200);
      s=await state();assert.equal(s.overview,true);assert.equal(s.playing,false);assert.equal(s.attack,null);
      assert.equal(s.director.status,'idle');assert.equal(s.director.pendingTimers,0);pass('overview-cleans-paused-scene',s);
    }
    const layout=await page.evaluate(()=>{
      const ids=['directorReplay','directorPause'];
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:ids.map(id=>({id,...document.getElementById(id).getBoundingClientRect().toJSON()}))};
    });
    assert.ok(layout.scrollWidth<=viewport.width);
    assert.ok(layout.buttons.every(b=>b.x>=0&&b.x+b.width<=viewport.width));
    await openSettings();await setTiming({});
    await shot(name+'-settings');
    await page.locator('#closeBtn').scrollIntoViewIfNeeded();assert.ok(await page.locator('#closeBtn').isVisible());
    await page.locator('#closeBtn').click();pass(name+'-responsive-controls-and-settings',layout);
    await context.close();context=null;
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);
  try{report.failureState=await state();await shot('failure');}catch{}
}finally{
  report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'director-report.json'),JSON.stringify(report,null,2));
  await context?.close();await browser.close();console.log('DIRECTOR_'+report.status);
}
