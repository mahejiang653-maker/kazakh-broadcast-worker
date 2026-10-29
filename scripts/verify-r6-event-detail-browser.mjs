import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const curl=promisify(execFile),root=path.resolve('public');
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/v52-event-detail-sites.json','utf8'));
const out=process.env.V52_QA_DIR||'/tmp/v52-event-detail-qa';fs.mkdirSync(out,{recursive:true});
const mime=p=>p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')||p.endsWith('.geojson')?'application/json':p.endsWith('.png')?'image/png':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.html')?'text/html':'application/octet-stream';
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/api/globe-config'){res.setHeader('Content-Type','application/json');res.end('{}');return;}
  // Exercise the existing production geography service instead of silently
  // replacing the state/city lookup with a 404 in this static preview.
  if(name==='/api/geo-highlight'){
    const url='https://kazakh-broadcast-worker.mahejiang653.workers.dev'+req.url;
    curl('curl',['--silent','--show-error','--fail','--location','--max-time','25',url],{encoding:'buffer',maxBuffer:12*1024*1024})
      .then(({stdout})=>{res.setHeader('Content-Type','application/json');res.end(stdout);})
      .catch(()=>res.writeHead(502).end());
    return;
  }
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime(file));res.end(data);});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const report={results:[],errors:[],imageryRequests:0,imagerySuccess:0,photoSuccess:0};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('response',response=>{
  const url=response.url();
  if(/arcgisonline\.com\/.*\/tile\//.test(url)){report.imageryRequests++;if(response.ok())report.imagerySuccess++;}
  if(url.includes('thumb.wikimedia.org')&&response.ok())report.photoSuccess++;
});
// Optional local environment bridge: Cesium comes from the exact official npm
// release and curl performs TLS-verified external requests through the managed
// proxy. CI browsers use the ordinary CDN and imagery URLs directly.
if(process.env.V52_LOCAL_CESIUM_DIR){
  const cesiumRoot=path.resolve(process.env.V52_LOCAL_CESIUM_DIR),cache=new Map();
  await page.route('https://**/*',async route=>{
    const url=route.request().url();
    const prefix='https://cdn.jsdelivr.net/npm/cesium@1.145.0/Build/Cesium/';
    if(url.startsWith(prefix)){
      const file=path.resolve(cesiumRoot,decodeURIComponent(new URL(url).pathname.split('/Build/Cesium/')[1]));
      if(file.startsWith(cesiumRoot+path.sep)&&fs.existsSync(file))return route.fulfill({path:file,contentType:mime(file),headers:{'access-control-allow-origin':'*'}});
    }
    try{
      let promise=cache.get(url);
      if(!promise){promise=curl('curl',['--silent','--show-error','--fail','--location','--max-time','25','--compressed',url],{encoding:'buffer',maxBuffer:30*1024*1024}).then(x=>x.stdout);cache.set(url,promise);}
      const body=await promise;
      const type=body[0]===0xff&&body[1]===0xd8?'image/jpeg':body[0]===0x89&&body[1]===0x50?'image/png':url.includes('json')||body[0]===123?'application/json':mime(new URL(url).pathname);
      await route.fulfill({status:200,body,contentType:type,headers:{'access-control-allow-origin':'*'}});
    }catch{await route.abort('failed').catch(()=>{});}
  });
}
try{
  await page.goto(`http://127.0.0.1:${address.port}/news-globe-run-20260920-v52-r1.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.NG14?.viewer&&window.NG14?.v52Director&&window.NG14?.v52EventDetail&&window.NG14?.countries?.size>0&&document.querySelector('#dailyLockFile'),null,{timeout:120000});
  const payload={meta:{date:'2026-10-28',edition:'test-only',dataLock:'TEST-NOT-NEWS'},news:Array.from({length:10},(_,i)=>({...fixtures[i%4],id:i+1,cameraPreset:{approachDuration:.7,siteDuration:.7,detailDuration:6}}))};
  await page.locator('#settingsBtn').click();
  await page.locator('#jsonInput').fill(JSON.stringify(payload));
  await page.locator('#applyBtn').click();
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.NG14?.viewer&&window.NG14?.v52Director&&window.NG14?.v52EventDetail&&window.NG14?.countries?.size>0&&document.querySelector('#dailyLockFile'),null,{timeout:120000});
  const imported=await page.evaluate(payload=>{
    const G=window.NG14,errors=G.validate(payload);
    G.v52Director.saveSettings({travel:.25,country:1,admin:.25,location:.25,finalHold:0});
    window.__detailStages=[];const stage=G.v52Director.stage;G.v52Director.stage=(p,s,...rest)=>{window.__detailStages.push({p,s});return stage(p,s,...rest);};
    return {errors,count:G.news.length,resolution:G.viewer.resolutionScale,firstTitle:G.news[0].title};
  },payload);
  assert.deepEqual(imported.errors,[]);assert.equal(imported.count,10);assert.equal(imported.firstTitle,fixtures[0].title);assert.ok(imported.resolution<=1.35);
  const indexes=process.env.V52_ONLY_SCENE?[Number(process.env.V52_ONLY_SCENE)-1]:[0,1,2,3];
  for(const i of indexes){
    await page.evaluate(index=>window.NG14.focus(index,true),i);
    await page.waitForFunction(index=>{const G=window.NG14;return G.current===index&&G.__v52CountryFrame?.serial===G.navSerial&&!G.v52Director.getState().moving;},i,{timeout:60000});
    const country=await page.evaluate(()=>{const G=window.NG14,iso=G.news[G.current].countryIso3;
      return {iso,flags:G.v51SceneEntities.filter(e=>e.__v52StoryFlag&&e.show!==false).map(e=>e.__v52FlagIso),
        borders:(G.countries.get(iso)?.entities||[]).filter(e=>e.show&&e.polyline).length};});
    assert.ok(country.flags.includes(country.iso),JSON.stringify(country));
    assert.ok(country.borders>0,JSON.stringify(country));
    await page.waitForFunction(index=>{const G=window.NG14,s=G.v52Director.getState();return G.current===index&&s.index===index&&['complete','cancelled','failed'].includes(s.status);},i,{timeout:100000});
    let tilesSettled=true;
    const waitStarted=Date.now();
    try{await page.waitForFunction(()=>window.NG14.viewer.scene.globe.tilesLoaded,null,{timeout:25000});}catch{tilesSettled=false;}
    const result=await page.evaluate(()=>{
      const G=window.NG14,C=window.Cesium,n=G.news[G.current],s=G.v52Director.getState(),c=G.viewer.camera.positionCartographic;
      const p=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,C.Cartesian3.fromDegrees(n.lon,n.lat));
      const canvas=G.viewer.scene.canvas;
      return {title:n.title,status:s.status,precision:n.locationPrecision,lon:C.Math.toDegrees(c.longitude),lat:C.Math.toDegrees(c.latitude),height:c.height,
        center:p?{x:p.x/canvas.clientWidth,y:p.y/canvas.clientHeight}:null,stages:window.__detailStages.filter(x=>x.s===G.navSerial).map(x=>x.p),
        photo:document.querySelector('.v52-detail-photo')?.classList.contains('visible')||false,
        caption:document.querySelector('.v52-detail-caption')?.innerText||'',mapAspect:canvas.clientWidth/canvas.clientHeight,
        trace:(G.getV52SceneTrace?.()||[]).filter(x=>x.serial===G.navSerial).map(x=>({type:x.type,name:x.name||x.location||''})),
        links:[...document.querySelectorAll('.v52-detail-caption a')].map(a=>a.href),
        tilesLoaded:G.viewer.scene.globe.tilesLoaded,
        renderTiles:(G.viewer.scene.globe._surface?._tilesToRender||[]).map(t=>({level:t.level,imagery:(t.data?.imagery||[]).map(i=>({ready:i.readyImagery?.state,loading:i.loadingImagery?.state}))})).slice(0,12)};
    });
    result.tilesSettled=tilesSettled;
    result.tileWaitMs=Date.now()-waitStarted;result.country=country;
    assert.equal(result.status,'complete',JSON.stringify(result));assert.ok(result.stages.includes('country'),JSON.stringify(result));
    assert.ok(result.stages.includes('approach')&&result.stages.includes('site'),JSON.stringify(result));
    assert.ok(Math.abs(result.lon-fixtures[i].lon)<.02&&Math.abs(result.lat-fixtures[i].lat)<.02,JSON.stringify(result));
    assert.ok(result.height<40000&&result.height>300,JSON.stringify(result));
    assert.ok(result.center&&Math.abs(result.center.x-.5)<.15&&Math.abs(result.center.y-.5)<.15,JSON.stringify(result));
    assert.ok(Math.abs(result.mapAspect-16/9)<.04,JSON.stringify(result));
    const requiredAdmin=i===0?'伊利诺伊州':i===2?'霍尔果斯市':null;
    if(requiredAdmin)assert.ok(result.trace.some(x=>x.type==='admin-visible-hold'&&x.name===requiredAdmin),
      'the verified intermediate location did not display: '+JSON.stringify(result.trace));
    if(!fixtures[i].detailImage)assert.equal(result.photo,false);
    if(fixtures[i].detailImage){assert.ok(result.photo,'verified photo did not display: '+JSON.stringify(result));assert.ok(result.caption.includes(fixtures[i].detailImage.date));
      assert.ok(result.links.includes(fixtures[i].detailImage.sourceUrl)&&result.links.includes(fixtures[i].detailImage.licenseUrl));}
    report.results.push(result);await page.screenshot({path:path.join(out,`site-${i+1}.png`),fullPage:true});
    console.log('SCENE',JSON.stringify(result));
  }
  if(!process.env.V52_ONLY_SCENE){
    await page.evaluate(fixture=>{
      const G=window.NG14;
      G.news[8]={...fixture,id:9,title:'测试：新加坡与印度尼西亚双国镜头',region:'新加坡/印度尼西亚',
        country:'新加坡/印度尼西亚',detailEnabled:false,scenePlan:{primaryIso3:'SGP',finalLocation:true}};
      G.focus(8,true);
    },fixtures[3]);
    await page.waitForFunction(()=>{const G=window.NG14,s=G.v52Director.getState();return G.current===8&&s.index===8&&s.status==='complete';},null,{timeout:100000});
    const pair=await page.evaluate(()=>{const G=window.NG14;
      return {flags:[...new Set(G.v51SceneEntities.filter(e=>e.__v52StoryFlag&&e.show!==false).map(e=>e.__v52FlagIso))],
        sgBorders:(G.countries.get('SGP')?.entities||[]).filter(e=>e.show&&e.polyline).length,
        idBorders:(G.countries.get('IDN')?.entities||[]).filter(e=>e.show&&e.polyline).length,
        synchronous:G.__v52DualFinal?.serial===G.navSerial&&G.__v52DualFinal.flagsSynchronous};});
    assert.ok(pair.flags.includes('SGP')&&pair.flags.includes('IDN'),JSON.stringify(pair));
    assert.ok(pair.sgBorders>0&&pair.idBorders>0&&pair.synchronous,JSON.stringify(pair));
    console.log('TWO_COUNTRY',JSON.stringify(pair));
    await page.evaluate(()=>window.NG14.focus(3,true));
    await page.waitForFunction(()=>window.NG14.current===3,null,{timeout:10000});
    await page.locator('#directorReplay').click();
    await page.waitForFunction(()=>window.NG14.v52Director.getState().phase==='detail',null,{timeout:100000});
    await page.locator('#directorPause').click();
    await page.waitForFunction(()=>window.NG14.v52Director.getState().paused,null,{timeout:30000});
    const pausedSerial=await page.evaluate(()=>window.NG14.navSerial);
    assert.equal(await page.locator('.v52-detail-photo.paused').count(),1);
    await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.NG14.navSerial),pausedSerial);
    await page.locator('#directorPause').click();
    await page.waitForFunction(()=>!window.NG14.v52Director.getState().paused,null,{timeout:10000});
    await page.locator('#play').click();
    await page.waitForFunction(()=>window.NG14.current===4,null,{timeout:60000});
    assert.equal(await page.locator('.v52-detail-photo').count(),0);
    await page.locator('#play').click();
    await page.locator('#next').click();await page.waitForFunction(()=>window.NG14.current===5,null,{timeout:10000});
    await page.locator('#prev').click();await page.waitForFunction(()=>window.NG14.current===4,null,{timeout:10000});
    await page.route('https://example.invalid/**',route=>route.abort('failed'));
    await page.evaluate(fixture=>{const G=window.NG14;
      G.news[9]={...fixture,id:10,title:'测试：图片加载失败',detailImage:{...fixture.detailImage,url:'https://example.invalid/missing.jpg'},
        cameraPreset:{approachDuration:.7,siteDuration:.7,detailDuration:2}};G.focus(9,true);
    },fixtures[3]);
    await page.waitForFunction(()=>{const G=window.NG14,s=G.v52Director.getState();return G.current===9&&s.index===9&&s.status==='complete';},null,{timeout:100000});
    assert.equal(await page.locator('.v52-detail-photo').count(),0);
    // Cancellation by direct user interaction must restore the current map's
    // annotations; a cancelled flight is not a completed scene.
    await page.evaluate(fixture=>{const G=window.NG14;
      G.news[6]={...fixture,id:7,cameraPreset:{approachDuration:1,siteDuration:10,detailDuration:2}};G.focus(6,true);
    },fixtures[3]);
    await page.waitForFunction(()=>{const s=window.NG14.v52Director.getState();return s.phase==='site'&&s.moving;},null,{timeout:100000});
    await page.evaluate(()=>window.NG14.viewer.camera.cancelFlight());
    await page.waitForFunction(()=>window.NG14.v52Director.getState().status==='cancelled',null,{timeout:10000});
    const restored=await page.evaluate(()=>window.NG14.v51SceneEntities.some(e=>e.show!==false));
    assert.equal(restored,true,'annotations were not restored after the cancelled closeup');
    // A settled attack must stop owning resize before its real-site closeup.
    await page.evaluate(fixture=>{const G=window.NG14;window.__syntheticSeen=false;
      window.__syntheticWatch=setInterval(()=>{if(G.v51SceneEntities.some(e=>['trajectory','projectile','impact'].includes(e.__v52AttackKind)&&e.show!==false))window.__syntheticSeen=true;},50);
      G.news[7]={...fixture,id:8,sceneMode:'DRONE_ATTACK',attackType:'drone',sourceUnconfirmed:true,
        scenePlan:{primaryIso3:'UKR',victimIso3:'UKR',sourceUnconfirmed:true},
        cameraPreset:{approachDuration:1,siteDuration:4,detailDuration:6}};G.focus(7,true);
    },fixtures[1]);
    await page.waitForFunction(()=>{const s=window.NG14.v52Director.getState();return s.phase==='site'&&s.moving;},null,{timeout:120000});
    await page.setViewportSize({width:410,height:844});
    await page.waitForFunction(()=>window.NG14.v52Director.getState().status==='complete',null,{timeout:100000});
    await page.waitForTimeout(800);
    const attack=await page.evaluate(()=>{clearInterval(window.__syntheticWatch);const G=window.NG14;
      return {height:G.viewer.camera.positionCartographic.height,synthetic:window.__syntheticSeen,diagnostics:G.v52Attack?.getDiagnostics()};});
    assert.ok(attack.height<12000,JSON.stringify(attack));assert.equal(attack.synthetic,false);assert.equal(attack.diagnostics,null);
    assert.equal(await page.locator('.v52-detail-photo.visible').count(),1);
    console.log('ATTACK_RESIZE_AND_CANCEL',JSON.stringify(attack));
    // City and region precision must never use a facility photo or altitude.
    for(const [precision,minHeight] of [['city',18000],['region',70000]]){
      await page.evaluate(({fixture,precision})=>{const G=window.NG14;
        G.news[5]={...fixture,id:6,locationPrecision:precision,cameraPreset:{approachDuration:1,siteDuration:1,detailDuration:1}};G.focus(5,true);
      },{fixture:fixtures[3],precision});
      await page.waitForFunction(()=>window.NG14.v52Director.getState().status==='complete',null,{timeout:100000});
      const height=await page.evaluate(()=>window.NG14.viewer.camera.positionCartographic.height);
      assert.ok(height>=minHeight-1,precision+': '+height);assert.equal(await page.locator('.v52-detail-photo').count(),0);
    }
    await page.evaluate(fixture=>{const G=window.NG14;
      G.news[5]={...fixture,id:6,sceneMode:'COUNTRY',noPoint:true,scenePlan:{primaryIso3:'SGP',finalLocation:false}};G.focus(5,true);
    },fixtures[3]);
    await page.waitForFunction(()=>window.NG14.v52Director.getState().status==='complete',null,{timeout:100000});
    assert.equal(await page.locator('.v52-detail-photo').count(),0);
    console.log('CONTROLS import, reload, replay, detail pause/resume, autoplay, next, previous, failed image: PASS');
    console.log('PRECISION city, region and country-only: PASS');
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  assert.ok(report.imagerySuccess>0,'real Esri satellite tiles were not retrieved');
  console.log('NETWORK',JSON.stringify({imageryRequests:report.imageryRequests,imagerySuccess:report.imagerySuccess,photoSuccess:report.photoSuccess}));
}catch(error){report.errors.push(error.stack||error.message);console.error('VERIFY_FAILED',error.stack||error.message);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
