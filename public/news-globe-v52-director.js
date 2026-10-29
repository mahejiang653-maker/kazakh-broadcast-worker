/* V52 playback controls. Scene geometry and news data remain owned by the existing engine. */
(function(G){
  'use strict';
  if(!G || G.v52Director) return;
  const VERSION='20261018-director-v1',KEY='news-globe-v52-director-timing-v1';
  const DEFAULTS=Object.freeze({travel:1,country:1,admin:1,location:1,finalHold:0});
  const PHASES={country:'国家总览',admin:'行政区',location:'实际地点',event:'事件效果',approach:'地点推进',site:'地点特写',detail:'地点影像',end:'结束画面'};
  const originals={},restorers=[],listeners=[];
  let active=null,disposed=false,attachTimer=null,settings=readSettings(),ui=null;
  const now=()=>performance.now();
  const live=run=>!!run && !disposed && active===run && !run.cancelled && run.serial===G.navSerial && !G.overviewMode;

  function validate(value){
    if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('分镜设置无效');
    const result={};
    for(const key of Object.keys(DEFAULTS)){
      const n=value[key];
      if(typeof n!=='number' || !Number.isFinite(n) || n<(key==='finalHold'?0:.25) || n>(key==='finalHold'?60:4))
        throw new Error(key==='finalHold'?'结束停留须为0～60秒':'时长倍率须为0.25～4');
      result[key]=n;
    }
    return result;
  }
  function readSettings(){
    try{return validate(JSON.parse(localStorage.getItem(KEY)));}catch{return {...DEFAULTS};}
  }
  function state(){
    const run=active;
    return {version:VERSION,serial:run?.serial??null,index:run?.index??null,
      phase:run?.phase??null,phaseLabel:PHASES[run?.phase]||'',status:run?.status||'idle',
      paused:!!run?.paused,pauseRequested:!!run?.pauseRequested,
      moving:!!run?.flights.size,effects:!!run?.effects,
      pendingWaits:run?.waiters.size||0,pendingTimers:run?.timers.size||0,
      timing:{...(run?.timing||settings)},disposed};
  }
  function notify(){
    G.v52EventDetail?.setPaused?.(!!active?.paused);
    if(ui){
      const s=state(),enabled=!!active&&!disposed&&!G.overviewMode;
      ui.pause.disabled=!enabled||s.status==='cancelled'||s.status==='failed';
      ui.pause.textContent=s.paused?'继续分镜':s.pauseRequested?'取消暂停':'暂停分镜';
      ui.pause.setAttribute('aria-pressed',String(s.paused||s.pauseRequested));
      ui.replay.disabled=disposed || !G.news?.length;
      let text='选择新闻后可重播、暂停分镜';
      if(enabled){
        text=s.phaseLabel;
        if(s.paused)text+=' · 已暂停';
        else if(s.pauseRequested)text+=' · 将在当前移动或效果结束后暂停';
        else if(s.status==='complete')text+=' · 播放完毕';
        else if(s.status==='cancelled')text+=' · 镜头已取消，可重播';
        else if(s.status==='failed')text+=' · 播放失败，可重播';
        else text+=' · '+(s.moving?'镜头移动中':s.effects?'播放中':'展示中');
      }
      ui.status.textContent=text;
    }
  }
  function later(run,fn,ms){
    const id=setTimeout(()=>{run.timers.delete(id);if(live(run))fn();},Math.max(0,ms));
    run.timers.add(id);return id;
  }
  function clearTimer(run,id){if(id!=null){clearTimeout(id);run.timers.delete(id);}}
  function pausedTime(run){return run.pauseMs+(run.paused?now()-run.pausedAt:0);}
  function freeze(run){
    if(!live(run)||run.paused)return;
    run.paused=true;run.pausedAt=now();
    for(const w of run.waiters){
      if(w.timer!=null){w.remaining=Math.max(0,w.remaining-(now()-w.started));w.epoch++;clearTimer(run,w.timer);w.timer=null;}
    }
    notify();
  }
  function maybePause(run){
    if(live(run)&&run.pauseRequested&&!run.flights.size&&!run.effects &&
      (run.waiters.size || run.status==='complete'))freeze(run);
  }
  function delay(run,ms,{scaled=true,effect=false}={}){
    if(!live(run))return Promise.resolve(false);
    const multiplier=scaled?(run.timing[run.phase]||1):1;
    return new Promise(resolve=>{
      const w={remaining:Math.max(0,ms*multiplier),timer:null,started:0,epoch:0,finished:false,start:null,finish:null};
      w.finish=ok=>{if(w.finished)return;w.finished=true;w.epoch++;clearTimer(run,w.timer);run.waiters.delete(w);resolve(ok);};
      const arm=(ms,complete)=>{
        const epoch=++w.epoch;w.started=now();
        w.timer=later(run,()=>{if(w.finished||w.epoch!==epoch)return;w.timer=null;complete();},ms);
      };
      w.start=()=>{
        if(w.finished||w.timer!=null)return;
        if(!live(run)){w.finish(false);return;}
        // Carrier motion and camera flights finish before a pause is admitted.
        if(w.remaining<=0 && effect)run.effects=false;
        maybePause(run);
        if(run.paused)return;
        if(w.remaining<=0){
          if(run.pauseRequested&&(run.flights.size||run.effects)){
            arm(50,()=>w.start());return;
          }
          w.finish(true);return;
        }
        arm(w.remaining,()=>{w.remaining=0;w.start();});
      };
      run.waiters.add(w);w.start();
    });
  }
  function cancel(){
    G.v52EventDetail?.cancel?.();
    const run=active;if(!run)return;
    run.cancelled=true;
    for(const id of run.timers)clearTimeout(id);
    run.timers.clear();
    for(const w of [...run.waiters])w.finish(false);
    for(const finish of [...run.pending])finish(false);
    run.pending.clear();run.flights.clear();active=null;notify();
  }
  function begin(serial){
    if(active?.serial===serial&&!active.cancelled)return active;
    cancel();
    active={serial,index:G.current,phase:'country',status:'running',timing:{...settings},
      cancelled:false,paused:false,pauseRequested:false,pausedAt:0,pauseMs:0,
      waiters:new Set(),timers:new Set(),pending:new Set(),flights:new Set(),effects:false};
    notify();return active;
  }
  function stage(phase,serial,{effects=false}={}){
    const run=active;if(!live(run)||run.serial!==serial)return false;
    run.phase=PHASES[phase]?phase:'location';run.effects=effects;notify();return true;
  }
  function checkpoint(phase,serial){
    const run=active;if(!live(run)||run.serial!==serial)return Promise.resolve(false);
    stage(phase,serial);return delay(run,0,{scaled:false});
  }
  function requestPause(){
    const run=active;if(!live(run)||run.status==='cancelled'||run.status==='failed')return false;
    run.pauseRequested=true;maybePause(run);notify();return true;
  }
  function resume(){
    const run=active;if(!live(run))return false;
    run.pauseRequested=false;
    if(run.paused){run.pauseMs+=now()-run.pausedAt;run.paused=false;}
    for(const w of [...run.waiters])w.start();
    notify();return true;
  }
  function replace(name,make){
    const before=G[name];if(typeof before!=='function')return;
    originals[name]=before;const after=make(before);G[name]=after;
    restorers.push(()=>{if(G[name]===after)G[name]=before;});
  }
  function installCamera(){
    const camera=G.viewer?.camera;if(!camera)return false;
    for(const [name,slot] of [['flyTo',0],['flyToBoundingSphere',1]]){
      const before=camera[name];if(typeof before!=='function')continue;
      const after=function(...args){
        const run=active;if(!live(run))return before.apply(this,args);
        const options={...(args[slot]||{})},id={};
        if(Number.isFinite(options.duration)&&options.duration>0)options.duration*=run.timing.travel;
        const end=fn=>function(...values){
          run.flights.delete(id);maybePause(run);notify();return fn?.apply(this,values);
        };
        options.complete=end(options.complete);options.cancel=end(options.cancel);
        args[slot]=options;run.flights.add(id);notify();
        try{return before.apply(this,args);}catch(error){run.flights.delete(id);throw error;}
      };
      camera[name]=after;restorers.push(()=>{if(camera[name]===after)camera[name]=before;});
    }
    return true;
  }
  function waitForAttack(run){
    return new Promise(resolve=>{
      let done=false;
      const finish=ok=>{if(done)return;done=true;run.pending.delete(finish);resolve(ok);};
      run.pending.add(finish);
      const check=()=>{
        if(!live(run)){finish(false);return;}
        const attack=G.v52Attack?.getDiagnostics();
        if(!attack||attack.serial!==run.serial){finish(true);return;}
        if(['cancelled','geometry-unavailable'].includes(attack.stage)){finish(false);return;}
        if(attack.stage==='settled'){run.effects=false;finish(true);return;}
        later(run,check,100);
      };check();
    });
  }
  function waitForCamera(run){
    if(!run.flights.size)return Promise.resolve(live(run));
    return new Promise(resolve=>{
      const finish=ok=>{run.pending.delete(finish);resolve(ok);};
      run.pending.add(finish);
      const check=()=>{
        if(!live(run)){finish(false);return;}
        if(!run.flights.size){finish(true);return;}
        later(run,check,50);
      };check();
    });
  }

  replace('wait',before=>function(ms,serial){
    const run=active;
    return live(run)&&run.serial===serial?delay(run,ms,{effect:run.effects}):before.call(this,ms,serial);
  });
  replace('focus',before=>function(...args){
    cancel();G.viewer?.camera?.cancelFlight?.();return before.apply(this,args);
  });
  replace('overview',before=>function(...args){
    G.pause?.();cancel();return before.apply(this,args);
  });
  replace('flashAdmin',before=>async function(step,iso,serial,hold=2600,...args){
    const run=active;
    if(!live(run)||run.serial!==serial)return before.call(this,step,iso,serial,hold,...args);
    stage('admin',serial);
    const result=await before.call(this,step,iso,serial,hold*run.timing.admin,...args);
    if(!live(run)||result===false)return false;
    if(!await waitForCamera(run))return false;
    return await checkpoint('admin',serial)?result:false;
  });
  replace('runSequence',before=>async function(story,iso,serial){
    if(disposed||serial!==G.navSerial)return false;
    const run=begin(serial);
    try{
      G.v52EventDetail?.prepare?.(story,serial);
      const mapStory=G.v52EventDetail?.storyForMap?.(story)||story;
      const result=await before.call(this,mapStory,iso,serial);
      if(!live(run))return false;
      if(result===false || !await waitForAttack(run)){
        if(live(run)){run.status='cancelled';run.pauseRequested=false;notify();}
        return false;
      }
      if(!live(run))return false;
      if(!await waitForCamera(run))return false;
      // The optional sequence is part of this run, so autoplay and pause wait
      // for it. A failed image or optional closeup leaves the map usable.
      let detailResult=true;
      try{detailResult=await G.v52EventDetail?.run?.(story,serial);}catch(error){
        console.warn('[V52 detail] using the current map view',error);
        G.v52EventDetail?.cancel?.();
      }
      if(!live(run))return false;
      if(detailResult===false){run.status='cancelled';run.pauseRequested=false;notify();return false;}
      stage('end',serial);
      if(!await delay(run,run.timing.finalHold*1000,{scaled:false}))return false;
      if(!live(run))return false;
      run.status='complete';notify();return result;
    }catch(error){
      if(live(run)){run.status='failed';run.pauseRequested=false;notify();}
      throw error;
    }
  });
  // Keep the existing minimum news dwell, and also wait for the actual scene.
  // A paused hold consumes neither its remaining time nor the auto-play countdown.
  replace('schedule',()=>function(){
    if(G.playTimer)clearTimeout(G.playTimer);G.playTimer=null;
    if(!G.playing)return;
    const serial=G.navSerial,run=active,start=now(),pausedAtStart=run?pausedTime(run):0;
    const duration=G.storyDuration(G.news[G.current]);
    const advance=()=>{
      G.playTimer=null;
      if(disposed||!G.playing||serial!==G.navSerial||G.overviewMode)return;
      const remaining=duration-(now()-start-(run?pausedTime(run)-pausedAtStart:0));
      const attack=G.v52Attack?.getDiagnostics();
      if(remaining>0 || (run&&live(run)&&(run.status==='running'||run.paused||run.pauseRequested)) ||
        (attack?.serial===serial&&attack.playbackReady===false)){
        G.playTimer=setTimeout(advance,Math.min(500,Math.max(50,remaining)));return;
      }
      if(G.current>=G.news.length-1){G.overview();return;}
      G.focus(G.current+1,true);G.schedule();
    };
    G.playTimer=setTimeout(advance,Math.max(0,duration));
  });

  function replay(){
    if(disposed||!G.news?.length)return false;
    const index=G.started?G.current:0;
    G.pause?.();G.clearArc?.();G.focus(index,true);return true;
  }
  function saveSettings(value){
    const next=validate(value);let persisted=true;
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{persisted=false;}
    settings=next;return {settings:{...settings},persisted};
  }
  function listen(target,name,handler,options){
    target?.addEventListener?.(name,handler,options);
    listeners.push(()=>target?.removeEventListener?.(name,handler,options));
  }
  function mount(){
    if(typeof document==='undefined'||!document.querySelector)return;
    const parent=document.querySelector('.control-card'),drawer=document.querySelector('.drawer');
    if(!parent||!drawer)return;
    const style=document.createElement('style');style.id='v52DirectorStyle';
    style.textContent='.v52-director{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.v52-director button{white-space:nowrap;padding:0 8px}.v52-director-status{grid-column:1/-1;max-width:330px;font-size:11px;line-height:1.5;color:#a9cadc;overflow-wrap:anywhere}.v52-director-settings{flex:none;margin:8px 0;font-size:12px}.drawer:has(.v52-director-settings[open]){display:block;overflow-y:auto}.drawer:has(.v52-director-settings[open]) .drawer-buttons{position:static}.v52-director-settings summary{cursor:pointer;color:#9fe5ff;padding:6px 0}.v52-director-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 2px}.v52-director-fields label{display:block;font-size:12px}.v52-director-fields input{display:block;margin-top:4px;min-height:36px}.v52-director-settings p{font-size:11px;line-height:1.5;color:#a9cadc}.v52-director-settings button{font-size:12px;margin:6px 6px 0 0}.v52-director-settings [role=status]{font-size:11px;line-height:1.5;margin-top:5px;color:#bfeeff}';
    document.head.appendChild(style);
    const controls=document.createElement('div');controls.id='v52DirectorControls';controls.className='v52-director';
    controls.innerHTML='<button id="directorReplay" type="button">重播本条</button><button id="directorPause" type="button" aria-pressed="false">暂停分镜</button><div id="directorStatus" class="v52-director-status" role="status" aria-live="polite"></div>';
    parent.appendChild(controls);
    const panel=document.createElement('details');panel.id='directorTimingSettings';panel.className='v52-director-settings';
    panel.innerHTML='<summary>分镜时长设置</summary><p>1倍为原有时长，2倍更慢，0.5倍更快。保存后从下一条或重播时生效。</p><div class="v52-director-fields"></div><button id="directorSaveTiming" type="button">保存分镜时长</button><button id="directorResetTiming" type="button">恢复默认时长</button><div id="directorTimingMessage" role="status"></div>';
    const fields=panel.querySelector('.v52-director-fields');
    const labels={travel:'镜头移动时长（倍）',country:'国家画面停留（倍）',admin:'行政区画面停留（倍）',location:'地点画面停留（倍）',finalHold:'结束画面额外停留（秒）'};
    for(const [key,labelText] of Object.entries(labels)){
      const label=document.createElement('label');label.textContent=labelText;
      const input=document.createElement('input');input.type='number';input.id='directorTiming-'+key;
      input.min=key==='finalHold'?'0':'0.25';input.max=key==='finalHold'?'60':'4';input.step='0.25';
      input.value=String(settings[key]);label.appendChild(input);fields.appendChild(label);
    }
    drawer.insertBefore(panel,document.getElementById('tokenInput')?.previousElementSibling||drawer.firstChild);
    ui={pause:controls.querySelector('#directorPause'),replay:controls.querySelector('#directorReplay'),status:controls.querySelector('#directorStatus')};
    const fill=()=>{for(const key of Object.keys(DEFAULTS))panel.querySelector('#directorTiming-'+key).value=String(settings[key]);};
    const message=panel.querySelector('#directorTimingMessage');
    listen(ui.replay,'click',replay);
    listen(ui.pause,'click',()=>active?.pauseRequested?resume():requestPause());
    listen(panel.querySelector('#directorSaveTiming'),'click',()=>{
      try{
        const value={};for(const key of Object.keys(DEFAULTS)){
          const raw=panel.querySelector('#directorTiming-'+key).value.trim();value[key]=raw===''?NaN:Number(raw);
        }
        const saved=saveSettings(value);
        message.textContent=saved.persisted?'已保存，下次重播或下一条生效。':'本次已应用；浏览器未允许保存，刷新后需重新设置。';
      }catch(error){message.textContent=error.message;}
    });
    listen(panel.querySelector('#directorResetTiming'),'click',()=>{
      const saved=saveSettings({...DEFAULTS});fill();message.textContent=saved.persisted?'已恢复默认时长，下次重播或下一条生效。':'本次已恢复默认时长，浏览器未允许保存。';
    });
    // The existing overview cleaner installs a captured onclick after startup.
    // Capture here also cancels director waits when that direct handler is used.
    listen(document.getElementById('all'),'click',()=>{G.pause?.();cancel();},true);
    restorers.push(()=>{controls.remove();panel.remove();style.remove();ui=null;});
    notify();
  }
  function dispose(){
    if(disposed)return;
    const hadActive=!!active;cancel();disposed=true;clearTimeout(attachTimer);G.pause?.();
    if(hadActive){G.navSerial++;G.viewer?.camera?.cancelFlight?.();G.v52Attack?.clear?.();}
    for(const remove of listeners.splice(0))remove();
    for(const restore of restorers.reverse())restore();
  }
  G.v52Director={version:VERSION,getState:state,stage,checkpoint,requestPause,resume,replay,
    getSettings:()=>({...settings}),saveSettings,resetSettings:()=>saveSettings({...DEFAULTS}),dispose};
  const attach=()=>{if(!disposed&&!installCamera())attachTimer=setTimeout(attach,50);};
  attach();mount();
  listen(window,'pagehide',event=>{if(!event.persisted)dispose();});
})(window.NG14);
