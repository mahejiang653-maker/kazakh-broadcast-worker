import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const url=process.env.GLOBE_URL||'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html';
const dir=process.env.GLOBE_OUTPUT||'globe-verify-r6-story-borders';fs.mkdirSync(dir,{recursive:true});
const report={url,localOverrides:!!process.env.GLOBE_LOCAL,status:'RUNNING',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,...(process.env.GLOBE_CHROMIUM_PATH?{executablePath:process.env.GLOBE_CHROMIUM_PATH}:{}),
  ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,ignoreHTTPSErrors:!!process.env.GLOBE_TRUST_PROXY});
if(process.env.GLOBE_LOCAL) {
  const root=path.resolve('public');
  await page.route(new URL(url).origin+'/**',route=>{
    const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
    if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,body:fs.readFileSync(file),
      contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')||file.endsWith('.geojson')?'application/json':'application/gzip'});
    return route.continue();
  });
}
page.on('pageerror',e=>report.errors.push(e.message));
async function check(name,expected) {
  const state=await page.evaluate(()=>{
    const G=NG14,v=G.viewer,t=v.clock.currentTime;
    const selected=new Set(G.v52StoryBorders.getDiagnostics().countries);
    const borders=G.borderEntities.filter(e=>e.show);
    const expected=new Set([...selected].flatMap(iso=>G.countries.get(iso)?.entities||[]));
    return {scope:G.v52StoryBorders.getDiagnostics(),index:G.current,overview:G.overviewMode,
      invalid:borders.filter(e=>![...e._countryIsos].some(iso=>selected.has(iso))).length,
      missing:G.overviewMode?0:[...expected].filter(e=>!e.show).length,
      sharedUSA:borders.filter(e=>e._countryIsos.has('USA')&&e._countryIsos.has('CAN')).length,
      canadaOnly:borders.filter(e=>e._countryIsos.has('CAN')&&!e._countryIsos.has('USA')).length,
      mexicoOnly:borders.filter(e=>e._countryIsos.has('MEX')&&!e._countryIsos.has('USA')).length,
      scale:v.resolutionScale,sse:v.scene.globe.maximumScreenSpaceError,msaa:v.scene.msaaSamples,
      width:new Set(borders.map(e=>e.polyline.width.getValue(t))).size?Math.max(...borders.map(e=>e.polyline.width.getValue(t))):0,
      elevated:G.borderEntities.every(e=>!e.polyline.clampToGround.getValue(t)),
      geometryPreserved:G.borderEntities.every(e=>window.__storyBorderPositions.get(e)===e.polyline.positions.getValue(t)),
      geography:G.v52Geography.getDiagnostics()};
  });
  assert.equal(state.invalid,0);assert.equal(state.missing,0);
  assert.equal(state.scale,2.2);assert.equal(state.sse,.75);assert.equal(state.msaa,4);
  assert.equal(state.elevated,true);assert.equal(state.geometryPreserved,true);
  assert.equal(state.geography.featureDisplay,'point');assert.equal(state.geography.borderDisplay,'elevated');
  assert.equal(state.scope.totalBorders,7955);
  if(expected)assert.deepEqual(state.scope.countries,[...expected].sort());
  report.checks.push({name,...state});console.log('STORY_BORDERS_CHECK',name,JSON.stringify(state));return state;
}
async function finalReady(index) {
  await page.waitForFunction(index=>{
    const G=NG14,C=Cesium,t=G.viewer.clock.currentTime,n=G.news[index];
    return G.current===index&&!G.overviewMode&&!G.viewer.camera._currentFlight&&
      G.v51SceneEntities.some(e=>e.show!==false&&e.point&&e.position&&
        C.Cartesian3.distance(C.Ellipsoid.WGS84.scaleToGeodeticSurface(e.position.getValue(t)),C.Cartesian3.fromDegrees(n.lon,n.lat))<5000);
  },index,{timeout:45000});
}
try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.NG14?.v52StoryBorders&&NG14.__v52FlagsOverviewClean&&NG14.countries.get('CHN')?.authoritativeOutline,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>NG14.v52StoryBorders.version),'20261011-r6-story-borders-r10');
  await page.evaluate(()=>{
    const G=NG14;window.__storyBorderNews=G.news;
    window.__storyBorderPositions=new Map(G.borderEntities.map(e=>[e,e.polyline.positions.getValue(G.viewer.clock.currentTime)]));
    G.news=G.news.map(n=>({...n}));
    G.news[0]={id:1,title:'飓风逼近美国墨西哥湾，油气企业撤离人员。',location:'美国墨西哥湾',focusLabel:'墨西哥湾',
      country:'美国 · 墨西哥',countryIso3:'USA',lon:-89,lat:26,height:4500000,sceneMode:'POINT',scenePlan:{primaryIso3:'USA',finalLocation:true}};
    G.pause();
  });
  await page.locator('#timeline button').nth(0).click();
  await check('usa-introduction',['USA']);
  await finalReady(0);await page.waitForTimeout(1000);
  const usa=await check('usa-gulf-final-point',['USA']);
  assert.ok(usa.sharedUSA>0);assert.equal(usa.canadaOnly,0);assert.equal(usa.mexicoOnly,0);assert.equal(usa.width,.63);
  // Pull back in the test page so the screenshot actually contains all three
  // countries; the story's camera behavior in the application stays untouched.
  await page.evaluate(()=>NG14.viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(-99,35,17000000),
    orientation:{heading:0,pitch:-Math.PI/2,roll:0}}));
  await page.waitForTimeout(5000);
  await page.screenshot({path:dir+'/usa-only-mobile.png',fullPage:true});
  await page.evaluate(()=>{NG14.clearLocal();NG14.setCountry('MEX',true);NG14.setCountry('CAN',false);});
  await check('cleanup-and-stale-country-reset',['USA']);
  await page.evaluate(()=>{
    NG14.news[1]={id:2,title:'中法战略对话',location:'北京',focusLabel:'北京',countryIso3:'CHN',lon:116.4,lat:39.9,
      sceneMode:'POINT',scenePlan:{primaryIso3:'CHN',finalLocation:true}};
    NG14.news[2]={id:3,title:'乌克兰与俄罗斯会谈',location:'基辅',focusLabel:'基辅',countryIso3:'UKR',lon:30.52,lat:50.45,
      sceneMode:'POINT',scenePlan:{primaryIso3:'UKR',participants:['UKR','RUS'],finalLocation:true}};
  });
  await page.locator('#timeline button').nth(1).click();await check('china-france',['CHN','FRA']);
  await page.locator('#timeline button').nth(2).click();await check('ukraine-russia',['RUS','UKR']);
  for(let i=0;i<20;i++) {
    await page.locator('#timeline button').nth(i%3).click();
    await check('rapid-'+i,i%3===0?['USA']:i%3===1?['CHN','FRA']:['UKR','RUS']);
  }
  await page.locator('#timeline button').nth(0).click();await finalReady(0);await page.waitForTimeout(1500);await check('late-callbacks',['USA']);
  await page.locator('#all').click();await page.waitForTimeout(1500);
  const overview=await check('overview');assert.equal(overview.scope.visibleBorders,0);
  await page.evaluate(()=>{NG14.news=window.__storyBorderNews;});
  for(let i=0;i<13;i++) {await page.locator('#timeline button').nth(i).click();await check('current-edition-'+(i+1));}
  assert.deepEqual(report.errors,[]);report.status='PASS';
} catch(error) {report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally {fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log('STORY_BORDERS_'+report.status);}
