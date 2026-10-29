import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/news-globe-v52-director.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function harness(scene=async()=>true,{stored,storageFailure=false}={}){
  let time=0,next=0;
  const timers=new Map(),storage=new Map(),events=new Map(),calls=[];
  if(stored)storage.set('news-globe-v52-director-timing-v1',JSON.stringify(stored));
  const setTimer=(fn,ms)=>{const id=++next;timers.set(id,{fn,due:time+Number(ms)});return id;};
  const camera={flyTo(options){calls.push(options);},flyToBoundingSphere(sphere,options){calls.push(options);},cancelFlight(){}};
  const G={navSerial:1,current:0,news:[{id:1,title:'一',scenePlan:{}},{id:2,title:'二',scenePlan:{}}],
    started:true,overviewMode:false,playing:false,playTimer:null,viewer:{camera},
    wait:(ms,s)=>new Promise(resolve=>setTimer(()=>resolve(s===G.navSerial),ms)),
    runSequence:(...args)=>scene(G,...args),
    focus(index){G.navSerial++;G.current=index;G.started=true;G.overviewMode=false;G.lastRun=G.runSequence(G.news[index],'CHN',G.navSerial);},
    overview(){G.navSerial++;G.overviewMode=true;},clearArc(){},
    pause(){G.playing=false;if(G.playTimer)timers.delete(G.playTimer);G.playTimer=null;},
    schedule(){},storyDuration:()=>1000,
  };
  const originalWait=G.wait,originalCamera=camera.flyTo;
  const window={NG14:G,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
  vm.runInNewContext(source,{window,performance:{now:()=>time},setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(storageFailure)throw Error('denied');storage.set(key,value);}}});
  const start=()=>G.runSequence(G.news[G.current],'CHN',G.navSerial);
  const tick=async ms=>{
    const end=time+ms;await flush();let count=0;
    for(;;){
      const item=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(!item)break;
      if(++count>10000)throw Error('Unbounded timer loop');
      time=item[1].due;timers.delete(item[0]);item[1].fn();await flush();
    }
    time=end;await flush();
  };
  return {G,d:G.v52Director,timers,storage,events,calls,camera,start,tick,originalWait,originalCamera,
    now:()=>time,invoke:fn=>fn()};
}

test('default playback preserves news and legacy hold duration',async()=>{
  const h=harness(async(G,n,iso,s)=>G.wait(1000,s));
  const news=JSON.stringify(h.G.news),done=h.start();
  await h.tick(999);assert.equal(h.d.getState().status,'running');
  await h.tick(1);assert.equal(await done,true);
  assert.equal(h.d.getState().status,'complete');assert.equal(h.timers.size,0);
  assert.equal(JSON.stringify(h.G.news),news);
  assert.equal(h.d.getSettings().travel,1);assert.equal(h.d.getSettings().finalHold,0);
});

test('pause freezes remaining hold time and resume consumes exactly that remainder',async()=>{
  let advances=0;
  const h=harness(async(G,n,iso,s)=>{if(!await G.wait(1000,s))return false;advances++;return true;});
  const done=h.start();await h.tick(400);h.d.requestPause();
  assert.equal(h.d.getState().paused,true);assert.equal(h.timers.size,0);
  await h.tick(10000);assert.equal(advances,0);
  h.d.resume();await h.tick(599);assert.equal(advances,0);
  await h.tick(1);assert.equal(await done,true);assert.equal(advances,1);
});

test('an already queued hold callback cannot finish a resumed take early',async()=>{
  const h=harness(async(G,n,iso,s)=>G.wait(1000,s));
  const done=h.start(),stale=[...h.timers.values()][0].fn;
  await h.tick(400);h.d.requestPause();h.d.resume();
  h.invoke(stale);await flush();assert.equal(h.d.getState().status,'running');
  await h.tick(599);assert.equal(h.d.getState().status,'running');
  await h.tick(1);assert.equal(await done,true);assert.equal(h.timers.size,0);
});

test('cancelling a pending pause and repeated resume calls never duplicate a live timer',async()=>{
  const h=harness(async(G,n,iso,s)=>{G.v52Director.stage('event',s,{effects:true});return G.wait(1000,s);});
  const done=h.start();await h.tick(400);h.d.requestPause();h.d.resume();h.d.resume();
  assert.equal(h.timers.size,1);
  await h.tick(600);assert.equal(await done,true);assert.equal(h.timers.size,0);
});

test('a pause requested in flight is admitted only after camera arrival',async()=>{
  let effects=0;
  const h=harness(async(G,n,iso,s)=>{
    const completed=await new Promise(resolve=>G.viewer.camera.flyTo({duration:2,complete:()=>resolve(true),cancel:()=>resolve(false)}));
    if(!completed)return false;
    if(!await G.v52Director.checkpoint('location',s))return false;
    effects++;return true;
  });
  const done=h.start();h.d.requestPause();
  assert.equal(h.d.getState().paused,false);assert.equal(h.d.getState().pauseRequested,true);
  await h.tick(3000);assert.equal(effects,0);
  h.calls[0].complete();await flush();
  assert.equal(h.d.getState().paused,true);assert.equal(effects,0);
  h.d.resume();await flush();assert.equal(await done,true);assert.equal(effects,1);
});

test('cancelling a camera flight remains a failed stage, even with pending pause',async()=>{
  let effects=0;
  const h=harness(async G=>{
    const ok=await new Promise(resolve=>G.viewer.camera.flyTo({duration:2,complete:()=>resolve(true),cancel:()=>resolve(false)}));
    if(!ok)return false;effects++;return true;
  });
  const done=h.start();h.d.requestPause();h.calls[0].cancel();await flush();
  assert.equal(await done,false);assert.equal(effects,0);
  assert.equal(h.d.getState().status,'cancelled');assert.equal(h.d.getState().pauseRequested,false);
});

test('a legacy scene cannot complete before its unawaited camera movement finishes',async()=>{
  const h=harness(async G=>{G.viewer.camera.flyTo({duration:4});return true;});
  const done=h.start();await flush();h.d.requestPause();
  await h.tick(1000);assert.equal(h.d.getState().status,'running');assert.equal(h.d.getState().paused,false);
  h.calls[0].complete();await h.tick(50);
  assert.equal(h.d.getState().phase,'end');assert.equal(h.d.getState().paused,true);
  h.d.resume();await flush();assert.equal(await done,true);assert.equal(h.timers.size,0);
});

test('teardown invalidates legacy continuations that only check the navigation serial',async()=>{
  let changed=false;
  const h=harness(async(G,n,iso,s)=>{await G.wait(1000,s);if(s===G.navSerial)changed=true;return true;});
  const done=h.start();h.d.dispose();await flush();
  assert.equal(await done,false);assert.equal(changed,false);assert.equal(h.timers.size,0);
});

test('an attack already in motion completes before admitting its requested pause',async()=>{
  let phase='flight';
  const h=harness(async(G,n,iso,s)=>{G.v52Director.stage('event',s,{effects:true});return true;});
  h.G.v52Attack={getDiagnostics:()=>({serial:h.G.navSerial,stage:phase})};
  const done=h.start();await flush();h.d.requestPause();
  await h.tick(3000);assert.equal(h.d.getState().paused,false);assert.equal(h.d.getState().status,'running');
  phase='settled';await h.tick(100);
  assert.equal(h.d.getState().phase,'end');assert.equal(h.d.getState().paused,true);
  h.d.resume();await flush();assert.equal(await done,true);assert.equal(h.timers.size,0);
});

test('carrier-style timed effects do not freeze halfway through their animation',async()=>{
  const h=harness(async(G,n,iso,s)=>{G.v52Director.stage('event',s,{effects:true});return G.wait(3600,s);});
  const done=h.start();await h.tick(500);h.d.requestPause();
  await h.tick(3000);assert.equal(h.d.getState().paused,false);
  await h.tick(100);assert.equal(h.d.getState().paused,true);assert.equal(h.d.getState().effects,false);
  h.d.resume();await flush();assert.equal(await done,true);
});

test('replay cancels paused work and keeps the selected news and its data unchanged',async()=>{
  const advanced=[];
  const h=harness(async(G,n,iso,s)=>{if(!await G.wait(1000,s))return false;advanced.push(s);return true;});
  h.G.current=1;const data=JSON.stringify(h.G.news),first=h.start();
  const stale=[...h.timers.values()][0].fn;
  h.d.requestPause();assert.equal(h.d.replay(),true);
  assert.equal(await first,false);assert.equal(h.G.current,1);assert.equal(h.d.getState().serial,2);
  h.invoke(stale);await h.tick(1000);assert.equal(await h.G.lastRun,true);
  assert.deepEqual(advanced,[2]);assert.equal(JSON.stringify(h.G.news),data);assert.equal(h.timers.size,0);
});

test('replay from overview returns to the previously selected news',async()=>{
  const h=harness();h.G.current=1;h.G.overviewMode=true;
  h.d.replay();await flush();
  assert.equal(h.G.current,1);assert.equal(h.G.overviewMode,false);assert.equal(await h.G.lastRun,true);
});

test('overview and teardown release pending holds, effect polls and all owned timers',async()=>{
  const h=harness(async(G,n,iso,s)=>G.wait(5000,s));
  const done=h.start();h.d.requestPause();h.G.overview();
  assert.equal(await done,false);assert.equal(h.d.getState().status,'idle');assert.equal(h.timers.size,0);
  h.G.overviewMode=false;h.G.v52Attack={getDiagnostics:()=>({serial:h.G.navSerial,stage:'impact'})};
  const second=h.start();await h.tick(5000);assert.ok(h.timers.size);
  h.d.dispose();assert.equal(await second,false);assert.equal(h.timers.size,0);
  assert.equal(h.G.wait,h.originalWait);assert.equal(h.camera.flyTo,h.originalCamera);
  assert.equal(h.events.size,0);h.d.dispose();assert.equal(h.d.getState().disposed,true);
});

test('late async completion cannot modify a replacement scene',async()=>{
  let firstResolve;
  const h=harness(async(G,n,iso,s)=>s===1?new Promise(resolve=>{firstResolve=resolve;}):G.wait(1000,s));
  const first=h.start();h.G.focus(1);
  firstResolve(true);await flush();assert.equal(await first,false);
  assert.equal(h.d.getState().serial,2);assert.equal(h.d.getState().status,'running');
  await h.tick(1000);assert.equal(await h.G.lastRun,true);
});

test('timing changes are validated, persisted separately, and snapshot at story start',async()=>{
  const h=harness(async(G,n,iso,s)=>G.wait(1000,s));
  const first=h.start(),saved={travel:2,country:3,admin:2,location:.5,finalHold:2};
  assert.equal(h.d.saveSettings(saved).persisted,true);
  assert.equal(h.d.getState().timing.country,1);
  await h.tick(1000);assert.equal(await first,true);
  h.G.focus(1);assert.equal(h.d.getState().timing.country,3);
  await h.tick(2999);assert.equal(h.d.getState().status,'running');
  await h.tick(1);assert.equal(h.d.getState().phase,'end');
  await h.tick(2000);assert.equal(await h.G.lastRun,true);
  assert.deepEqual([...h.storage.keys()],['news-globe-v52-director-timing-v1']);
  assert.throws(()=>h.d.saveSettings({...saved,country:0}),/倍率/);
  assert.throws(()=>h.d.saveSettings({...saved,travel:Infinity}),/倍率/);
  assert.throws(()=>h.d.saveSettings({...saved,finalHold:61}),/60/);
  assert.equal(h.d.getSettings().country,3);
  h.d.resetSettings();assert.equal(h.d.getSettings().country,1);
});

test('bad stored settings fall back safely and storage denial is reported honestly',()=>{
  const h=harness(undefined,{stored:{travel:100},storageFailure:true});
  assert.equal(h.d.getSettings().travel,1);
  assert.equal(h.d.saveSettings({travel:2,country:1,admin:1,location:1,finalHold:0}).persisted,false);
  assert.equal(h.d.getSettings().travel,2);
});

test('camera timing preserves destination, cancellation callbacks and caller options',async()=>{
  const h=harness(async G=>new Promise(resolve=>G.viewer.camera.flyToBoundingSphere({id:'sphere'},
    {destination:'same',duration:2,complete:()=>resolve(true),cancel:()=>resolve(false)})));
  h.d.saveSettings({travel:2,country:1,admin:1,location:1,finalHold:0});
  const done=h.start();assert.equal(h.calls[0].duration,4);assert.equal(h.calls[0].destination,'same');
  h.calls[0].cancel();await flush();assert.equal(await done,false);
});

test('auto-play waits for a long scene and cannot advance while it is paused',async()=>{
  const h=harness(async(G,n,iso,s)=>G.wait(2000,s));
  h.start();h.G.playing=true;h.G.schedule();
  await h.tick(500);h.d.requestPause();await h.tick(10000);
  assert.equal(h.G.current,0);assert.equal(h.d.getState().paused,true);
  h.d.resume();await h.tick(1499);assert.equal(h.G.current,0);
  await h.tick(501);assert.equal(h.G.current,1);h.G.pause();h.d.dispose();
});

test('pausing a completed scene preserves the remaining auto-play countdown',async()=>{
  const h=harness();await h.start();h.G.playing=true;h.G.schedule();
  await h.tick(300);h.d.requestPause();await h.tick(5000);
  assert.equal(h.G.current,0);h.d.resume();
  await h.tick(699);assert.equal(h.G.current,0);
  await h.tick(501);assert.equal(h.G.current,1);h.G.pause();h.d.dispose();
});

test('the director waits for the optional site sequence and cancels it on navigation',async()=>{
  const h=harness();let finish;const calls=[];
  h.G.v52EventDetail={prepare:(n,s)=>calls.push(['prepare',s]),
    run:(n,s)=>{calls.push(['run',s]);return new Promise(r=>{finish=r;});},
    cancel:()=>calls.push(['cancel']),setPaused:()=>{}};
  const done=h.start();await flush();
  assert.ok(calls.some(x=>x[0]==='prepare'));assert.ok(calls.some(x=>x[0]==='run'));
  assert.equal(h.d.getState().status,'running');
  finish(true);await flush();assert.equal(await done,true);
  h.G.focus(1);assert.ok(calls.some(x=>x[0]==='cancel'));
});
test('the existing scene receives the detail module’s safe map view while the detail uses the original story',async()=>{
  let baseStory,detailStory;
  const h=harness(async(G,n)=>{baseStory=n;return true;});
  h.G.v52EventDetail={prepare(){},cancel(){},setPaused(){},
    storyForMap:n=>({...n,safeView:true}),run:async n=>{detailStory=n;return true;}};
  assert.equal(await h.start(),true);
  assert.equal(baseStory.safeView,true);assert.equal(detailStory.safeView,undefined);
});
test('the director reports a same-story cancelled detail flight instead of completing',async()=>{
  const h=harness();
  h.G.v52EventDetail={prepare(){},cancel(){},setPaused(){},run:async()=>false};
  assert.equal(await h.start(),false);
  assert.equal(h.d.getState().status,'cancelled');
  assert.notEqual(h.d.getState().phase,'end');
});
