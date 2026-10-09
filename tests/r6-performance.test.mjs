import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/news-globe-v52-r6-performance.js',import.meta.url),'utf8');
function event(){const listeners=new Set();return {listeners,addEventListener(fn){listeners.add(fn);return()=>listeners.delete(fn);},raise(...args){for(const fn of [...listeners])fn(...args);}};}
function harness(load=async()=>{}){
  let now=0,renders=0,checks=0,suspends=0,resumes=0,id=0;
  const timers=new Map(),windowEvents=new Map(),documentEvents=new Map();
  const target=map=>({addEventListener(name,fn){if(!map.has(name))map.set(name,new Set());map.get(name).add(fn);},removeEventListener(name,fn){map.get(name)?.delete(fn);}});
  const collectionChanged=event(),postUpdate=event(),moveStart=event(),moveEnd=event();
  const values=[...Array.from({length:8000},()=>({polyline:{positions:{isConstant:true}}}))];
  let reads=0;
  const viewer={clock:{currentTime:0},scene:{globe:{},requestRender(){renders++;},postUpdate},camera:{moveStart,moveEnd,
      positionWC:{x:0,y:0,z:1000000},directionWC:{x:0,y:0,z:-1},upWC:{x:0,y:1,z:0}},
    entities:{get values(){reads++;return values;},collectionChanged,suspendEvents(){suspends++;},resumeEvents(){resumes++;}}};
  const G={viewer,current:0,navSerial:1,started:true,overviewMode:false,initViewer:async()=>42,loadBorders:load,updateOcclusion(){checks++;}};
  const window={...target(windowEvents),NG14:G,Cesium:{},innerWidth:390,devicePixelRatio:3,matchMedia:()=>({matches:false})};
  const document={...target(documentEvents),hidden:false};
  const context=vm.createContext({window,document,performance:{now:()=>now},setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout(key){timers.delete(key);}});
  vm.runInContext(source,context);
  return {G,viewer,window,document,context,postUpdate,moveStart,moveEnd,collectionChanged,timers,windowEvents,documentEvents,
    get reads(){return reads;},get renders(){return renders;},get checks(){return checks;},get suspends(){return suspends;},get resumes(){return resumes;},
    tick(ms=60){now+=ms;G.updateOcclusion();postUpdate.raise();},
    changed(e){collectionChanged.raise(viewer.entities,[],[],[e]);},add(e){values.push(e);collectionChanged.raise(viewer.entities,[e],[],[]);},
    remove(e){values.splice(values.indexOf(e),1);collectionChanged.raise(viewer.entities,[],[e],[]);},
    fire(name,e){for(const fn of [...(windowEvents.get(name)||[])])fn(e);},
    drain(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();},
  };
}
test('mobile pixel budget changes during movement and restores after the last movement',async()=>{
  const h=harness();assert.equal(await h.G.initViewer(),42);
  assert.equal(h.viewer.resolutionScale,1.3);assert.equal(h.viewer.targetFrameRate,30);
  assert.equal(h.viewer.scene.requestRenderMode,true);assert.equal(h.viewer.scene.maximumRenderTimeChange,Infinity);
  h.tick();h.viewer.camera.positionWC.x+=10;h.tick();assert.equal(h.viewer.resolutionScale,1);
  h.tick(120);h.viewer.camera.positionWC.x+=10;h.tick(120);assert.equal(h.viewer.resolutionScale,1);
  h.tick(300);assert.equal(h.viewer.resolutionScale,1.3);
  h.moveStart.raise();h.tick(300);assert.equal(h.viewer.resolutionScale,1.3,'Resolution-only move events do not lower quality again');
  h.window.innerWidth=1280;h.fire('resize');h.drain();assert.equal(h.viewer.resolutionScale,1.5);assert.equal(h.viewer.targetFrameRate,45);
});
test('static scenes become idle but visible, added and later-assigned animations keep drawing',async()=>{
  const h=harness();await h.G.initViewer();h.tick();const idle=h.renders;
  for(let i=0;i<60;i++)h.tick();assert.equal(h.renders,idle);assert.equal(h.reads,1);
  const e={show:false,position:{isConstant:false},point:{}};h.add(e);h.tick();const hidden=h.renders;
  h.tick();assert.equal(h.renders,hidden);
  e.show=true;h.changed(e);h.tick();const active=h.renders;h.tick();assert.ok(h.renders>active);
  h.remove(e);h.tick();const removed=h.renders;h.tick();assert.equal(h.renders,removed);
  const pulse={ellipse:{semiMajorAxis:{isConstant:true}}};h.add(pulse);h.tick();
  pulse.ellipse.semiMajorAxis={isConstant:false};h.changed(pulse);h.tick();const moving=h.renders;h.tick();assert.ok(h.renders>moving);
  h.document.hidden=true;const background=h.renders;h.tick();assert.equal(h.renders,background);
});
test('occlusion skips an unchanged camera while navigation is updated immediately',async()=>{
  const h=harness();await h.G.initViewer();h.tick();const initial=h.checks;
  for(let i=0;i<60;i++)h.tick();assert.equal(h.checks,initial);
  h.G.navSerial++;h.tick();assert.equal(h.checks,initial+1);
  h.viewer.camera.positionWC.x+=10;h.tick();h.tick();h.tick();assert.ok(h.checks>=initial+3);
  h.document.hidden=true;const hidden=h.checks;h.tick();assert.equal(h.checks,hidden);
});
test('loading batches events even on failure; page teardown cancels callbacks without breaking bfcache',async()=>{
  const h=harness(async()=>{throw new Error('fixture failure');});await h.G.initViewer();
  await assert.rejects(h.G.loadBorders(),/fixture failure/);assert.equal(h.suspends,1);assert.equal(h.resumes,1);
  h.fire('resize');assert.equal(h.timers.size,1);
  h.fire('pagehide',{persisted:true});assert.equal(h.postUpdate.listeners.size,1);
  vm.runInContext(source,h.context);assert.equal(h.postUpdate.listeners.size,1);
  h.fire('pagehide',{persisted:false});assert.equal(h.timers.size,0);
  for(const e of [h.postUpdate,h.moveStart,h.moveEnd,h.collectionChanged])assert.equal(e.listeners.size,0);
  assert.equal(h.G.v52Performance.getDiagnostics().disposed,true);
});
