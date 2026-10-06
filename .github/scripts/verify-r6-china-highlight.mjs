import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const dir='globe-verify-r6-china-highlight';fs.mkdirSync(dir,{recursive:true});
const report={status:'RUNNING',commit:process.env.GITHUB_SHA,checks:[],errors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
try{
  await page.goto('https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.NG14?.viewer&&NG14.v52ChinaBoundaryOwnership&&NG14.__v52FlagsOverviewClean&&NG14.countries.get('CHN')?.authoritativeOutline,null,{timeout:90000});
  report.actualURL=page.url();
  await page.waitForTimeout(5500);
  for(const [width,height]of [[1280,900],[360,800]]){
    await page.setViewportSize({width,height});
    // Test the existing COUNTRY branch of the active engine in isolation so a
    // subsequent event zoom cannot make a transient screenshot look like a pass.
    // The actual news array and production camera code are never edited.
    await page.evaluate(async()=>{
      const G=NG14;G.pause();G.viewer.camera.cancelFlight();G.navSerial++;G.overviewMode=false;
      const n={...G.news[0],sceneMode:'COUNTRY',countryIso3:'CHN',countryOnly:true,noPoint:true,
        adminChain:[],forceAdminChain:false,secondaryCountryIso3:null,
        scenePlan:{...G.news[0].scenePlan,primaryIso3:'CHN',participants:[],contextCountries:[],adminChain:[],finalLocation:false,regionalContext:false}};
      await G.runSequence(n,'CHN',G.navSerial);
    });
    await page.waitForFunction(()=>NG14.viewer.scene.globe.tilesLoaded,null,{timeout:15000}).catch(()=>{});
    await page.waitForTimeout(1500);
    const state=await page.evaluate(()=>{
      const G=NG14,C=Cesium,t=C.JulianDate.now(),canvas=G.viewer.scene.canvas;
      const fills=G.v51SceneEntities.filter(e=>e.polygon);
      const center=C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene,C.Cartesian3.fromDegrees(103.8,35.4));
      const primitives=G.viewer.scene.primitives;
      return {fills:fills.length,outline:G.v52ChinaBoundaryOwnership.getDiagnostics(),
        cameraHeight:G.viewer.camera.positionCartographic.height,flight:!!G.viewer.camera._currentFlight,
        center:center&&{x:center.x/canvas.clientWidth,y:center.y/canvas.clientHeight},
        mainlandVertices:fills.find(e=>e.polygon.hierarchy.getValue(t).positions.length>1000)?.polygon.hierarchy.getValue(t).positions.length,
        aspect:canvas.clientWidth/canvas.clientHeight,primitives:primitives.length,
        renderedPolygons:Array.from({length:primitives.length},(_,i)=>primitives.get(i)).filter(p=>p.ready&&p.geometryInstances?.some?.(g=>g.geometry?.constructor?.name==='PolygonGeometry')).length,
        storyCount:G.news.length,title:G.news[0].title};
    });
    assert.equal(state.fills,514);assert.equal(state.mainlandVertices,30144);
    assert.equal(state.outline.removedGenericEdges,177);assert.equal(state.flight,false);
    assert.ok(state.cameraHeight>3000000,'Country screenshot is still at event zoom');
    assert.ok(state.center&&Math.abs(state.center.x-.5)<.15&&Math.abs(state.center.y-.5)<.15,'Country camera did not settle');
    assert.ok(Math.abs(state.aspect-16/9)<.01);assert.equal(state.storyCount,13);
    await page.screenshot({path:dir+'/china-highlight-'+width+'x'+height+'.png',fullPage:true});
    report.checks.push({width,height,state});
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
  report.status='PASS';console.log('R6_CHINA_HIGHLIGHT_STABLE_PASS');
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}
finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
