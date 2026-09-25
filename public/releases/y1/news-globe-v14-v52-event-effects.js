(function(G){
  'use strict';
  if(!G||G.eventEffects||!G.EventModel||!G.EventGeometry)return;
  const C=window.Cesium,geo=G.EventGeometry;
  const COLORS=Object.freeze({primary:'#ff4050',secondary:'#3dbdff',missile:'#ff9245',drone:'#d7f2ff'});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const color=(s,a=1)=>C.Color.fromCssColorString(s).withAlpha(a);

  // One owner for every transient resource of one navigation generation.
  class EventScope{
    constructor(controller,event,serial){this.controller=controller;this.event=event;this.serial=serial;this.viewer=G.viewer;this.entities=new Map();this.resources=new Map();this.disposed=false;this.finished=false;this.lastPoint=null}
    get live(){return !this.disposed&&this.controller.scope===this&&this.serial===G.navSerial}
    own(entity,group='scene',kind=group){
      if(!entity)return null;
      if(!this.live){this.viewer?.entities.remove(entity);return null}
      entity.ngEvent={id:this.event.id,serial:this.serial,kind};this.entities.set(entity,group);return entity;
    }
    add(options,kind,group='effects'){return this.live?this.own(this.viewer.entities.add(options),group,kind):null}
    defer(dispose,group='effects',kind='listener'){
      if(!this.live){dispose();return ()=>{}}
      this.resources.set(dispose,{group,kind});return ()=>this.resources.delete(dispose);
    }
    delay(ms,group='wait'){
      if(!this.live)return Promise.resolve(false);
      return new Promise(resolve=>{
        let id,settled=false;
        const finish=value=>{if(settled)return;settled=true;this.resources.delete(cancel);resolve(value)};
        const cancel=()=>{clearTimeout(id);finish(false)};
        id=setTimeout(()=>finish(this.live),Math.max(0,ms));this.defer(cancel,group,'timer');
      });
    }
    timeout(fn,ms,group='effects'){
      if(!this.live)return;
      const cancel=()=>clearTimeout(id),id=setTimeout(()=>{this.resources.delete(cancel);if(this.live)fn()},ms);
      this.defer(cancel,group,'timer');
    }
    raf(fn){
      if(!this.live)return;
      const cancel=()=>cancelAnimationFrame(id),id=requestAnimationFrame(t=>{this.resources.delete(cancel);if(this.live)fn(t)});
      this.defer(cancel,'effects','raf');
    }
    onFrame(fn){
      if(!this.live)return;
      const off=this.viewer.scene.preUpdate.addEventListener(()=>{if(this.live)fn()});this.defer(off,'effects','frame');
    }
    clear(group){
      for(const [e,g] of this.entities)if(!group||g===group){this.viewer?.entities.remove(e);this.entities.delete(e)}
      for(const [dispose,r] of [...this.resources])if(!group||r.group===group){this.resources.delete(dispose);dispose()}
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.clear()}
    counts(){return {entities:this.entities.size,timers:[...this.resources.values()].filter(x=>x.kind==='timer').length,raf:[...this.resources.values()].filter(x=>x.kind==='raf').length,frames:[...this.resources.values()].filter(x=>x.kind==='frame').length}}
  }

  class EventEffectController{
    constructor(){this.scope=null;this.state='IDLE';this.lastCleanup=null;this.pendingArc=null;this.navigation=false;this.flight=null;this.effectVersion=0}
    current(){return this.scope?.live?this.scope:null}
    managed(){const s=this.current();return s?.event.managed?s:null}
    stateTo(value){this.state=value;if(G.debugEvents===true){const e=this.current()?.event;console.debug('[V52 effects]',{state:value,id:e?.id,type:e?.type,primaryCountry:e?.primaryCountry,secondaryCountry:e?.secondaryCountry,eventLocation:e?.eventLocation})}}
    cleanup(){
      const old=this.scope;this.scope=null;this.flight=null;this.effectVersion++;
      if(old){old.dispose();this.lastCleanup={id:old.event.id,serial:old.serial,...old.counts()}}
      // Existing clear methods also restore modified country borders and cancel
      // the legacy highlight / secondary blink / navigation-arc timers.
      G.v51Scene?.clearScene();this.stateTo('IDLE');
    }
    begin(n,iso,serial){
      if(serial!==G.navSerial)return null;
      this.cleanup();const event=G.EventModel.normalize(n,iso);
      const scope=new EventScope(this,event,serial);this.scope=scope;this.stateTo('ROTATING_TO_COUNTRY');return scope;
    }
    stopEffects(){this.effectVersion++;this.current()?.clear('effects');this.flight=null}
    clearStage(){const s=this.current();if(!s)return;s.clear('scene');this.stopEffects();s.clear('secondary');s.lastPoint=null}
    trackScene(entity){return this.current()?.own(entity,'scene')}
    countryColor(iso){const e=this.managed()?.event;return e?(iso===e.primaryCountry?COLORS.primary:iso===e.secondaryCountry?COLORS.secondary:null):null}
    tagCountry(iso,start){
      const s=this.current();if(!s)return;
      for(const e of G.v51SceneEntities.slice(start))if(e.ngEvent)e.ngEvent={...e.ngEvent,kind:'country',country:iso,role:iso===s.event.primaryCountry?'primary':'secondary'};
    }
    markerColor(lon,lat,fallback){
      const s=this.managed();if(!s)return fallback;
      const p=geo.point([lon,lat]);if(!p)return fallback;
      s.lastPoint=p;
      const e=s.event,second=e.secondaryLocation;
      if(second&&geo.greatCircle(p,second).distance<10){s.clear('secondary');return COLORS.secondary}
      return COLORS.primary;
    }
    visible(p){
      const camera=G.viewer?.camera;if(!camera)return true;
      return new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,camera.positionWC).isPointVisible(p);
    }
    point(scope,p,iso,kind='endpoint',size=7){
      if(!p)return null;
      if(kind!=='secondary-marker'&&scope.event.secondaryLocation&&geo.greatCircle(p,scope.event.secondaryLocation).distance<10)scope.clear('secondary');
      const position=C.Cartesian3.fromDegrees(p.lon,p.lat,30000),shade=this.countryColor(iso)||COLORS.primary;
      return scope.add({position,point:{pixelSize:shade===COLORS.secondary?6:size,color:color(shade),outlineColor:C.Color.WHITE,outlineWidth:1.2,show:new C.CallbackProperty(()=>scope.live&&this.visible(position),false)}},kind,kind==='secondary-marker'?'secondary':'effects');
    }
    countryContext(drawn,drawCountry,final=false){
      const s=this.managed();if(!s)return;
      const e=s.event;
      if(!final)this.stateTo('COUNTRY_HIGHLIGHT');
      if(e.secondaryCountry){
        for(const iso of [e.primaryCountry,e.secondaryCountry])if(iso&&!drawn.includes(iso))drawCountry(iso,this.countryColor(iso),final?.07:.13,final?1.65:2.3);
        s.clear('secondary');
        if(e.secondaryLocation&&(!s.lastPoint||geo.greatCircle(s.lastPoint,e.secondaryLocation).distance>=10))this.point(s,e.secondaryLocation,e.secondaryCountry,'secondary-marker',6);
      }
      if(final)this.stateTo('DISPLAYING_STORY');
    }
    attackData(){
      const e=this.managed()?.event;if(!e||!/^(missile|drone)_attack$/.test(e.type))return null;
      return {att:e.origin?.country||'',vic:e.target?.country||e.primaryCountry,target:e.target||e.eventLocation,source:e.origin,
        sourceLabel:e.origin?.label||'',targetLabel:e.targetLabel,sourceType:e.sourceType,potential:e.potential};
    }
    rotation(a,b){
      try{
        const cam=G.viewer.camera,m=C.Matrix4.multiply(cam.frustum.projectionMatrix,cam.viewMatrix,new C.Matrix4());
        const project=p=>{const q=C.Matrix4.multiplyByVector(m,new C.Cartesian4(p.x,p.y,p.z,1),new C.Cartesian4());return {x:q.x/q.w*G.viewer.scene.canvas.clientWidth,y:q.y/q.w*G.viewer.scene.canvas.clientHeight}};
        const p=project(a),q=project(b);return Math.atan2(q.y-p.y,q.x-p.x);
      }catch{return 0}
    }
    async playAttack(n,info){
      const s=this.managed();if(!s||!s.event.origin||!s.event.target)return false;
      if(n&&n!==s.event.source&&n!==s.adapted)return false;
      if(info?.navSerial!==undefined&&info.navSerial!==s.serial)return false;
      if(this.flight?.serial===s.serial)return false;
      s.clear('effects');const version=++this.effectVersion,e=s.event,kind=e.type==='drone_attack'?'drone':'missile',path=geo.route(e.origin,e.target,kind);
      if(!path)return false;
      this.stateTo(e.potential?'POTENTIAL_EFFECT':'PLAYING_EFFECT');
      this.point(s,e.origin,e.origin.country,'origin');this.point(s,e.target,e.target.country,'target',9);
      const targetText=e.origin.locationPrecision==='directional'?e.targetLabel+'（来向示意）':e.targetLabel;
      const labelStart=G.v51SceneEntities.length;
      G.v51Scene?.label(targetText,e.target.lon,e.target.lat,{dy:-29,font:14,bg:.46});
      for(const entity of G.v51SceneEntities.slice(labelStart))s.own(entity,'effects','target-label');
      if(e.sourceType==='carrier'&&G.eventEffectAssets?.carrier)s.add({position:C.Cartesian3.fromDegrees(e.origin.lon,e.origin.lat,40000),billboard:{image:G.eventEffectAssets.carrier,width:34,height:13}},'source-platform');
      if(e.potential){
        s.add({polyline:{positions:path.positions,arcType:C.ArcType.NONE,width:1.45,material:new C.PolylineDashMaterialProperty({color:color('#ffc36a',.42),gapColor:C.Color.TRANSPARENT,dashLength:13})}},'potential-trajectory');
        return s.delay(2200,'effects');
      }
      const start=performance.now(),duration=path.duration,decay=kind==='drone'?650:980;
      const data={progress:0,position:path.at(0),rotation:0,impact:0,impactVisible:false};
      this.flight={eventId:e.id,serial:s.serial,kind,path,data,duration};
      const progress=()=>data.progress;
      const traveled=()=>{const i=Math.floor(progress()*path.steps),from=kind==='missile'?Math.max(0,i-18):0;return [...path.positions.slice(from,i+1),data.position]};
      s.add({polyline:{positions:new C.CallbackProperty(traveled,false),arcType:C.ArcType.NONE,width:kind==='missile'?2.3:1.5,material:kind==='missile'?new C.PolylineGlowMaterialProperty({glowPower:.24,color:color(COLORS.missile,.86)}):new C.PolylineDashMaterialProperty({color:color(COLORS.drone,.75),gapColor:color(COLORS.secondary,.08),dashLength:15})}},'trajectory');
      s.add({position:new C.CallbackPositionProperty((_t,result)=>C.Cartesian3.clone(data.position,result),false),billboard:{image:G.eventEffectAssets?.[kind],width:kind==='missile'?37:43,height:kind==='missile'?9.5:16,rotation:new C.CallbackProperty(()=>data.rotation,false),show:new C.CallbackProperty(()=>s.live&&data.progress<1,false),verticalOrigin:C.VerticalOrigin.CENTER}},kind);
      const impactPosition=C.Cartesian3.fromDegrees(e.target.lon,e.target.lat,36000);
      s.add({position:impactPosition,billboard:{image:G.eventEffectAssets?.blast,width:kind==='missile'?42:28,height:kind==='missile'?42:28,show:new C.CallbackProperty(()=>s.live&&data.impactVisible,false),scale:new C.CallbackProperty(()=>.45+1.15*Math.sin(Math.PI*data.impact),false)}},'impact');
      s.add({position:C.Cartesian3.fromDegrees(e.target.lon,e.target.lat,900),ellipse:{show:new C.CallbackProperty(()=>s.live&&data.impactVisible,false),semiMajorAxis:new C.CallbackProperty(()=>9000+data.impact*(kind==='missile'?52000:24000),false),semiMinorAxis:new C.CallbackProperty(()=>9000+data.impact*(kind==='missile'?52000:24000),false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>color('#ff7a22',(1-data.impact)*.2),false)),outline:true,outlineColor:new C.CallbackProperty(()=>color('#ffd34d',(1-data.impact)*.8),false)}},'impact-ring');
      s.onFrame(()=>{
        const elapsed=Math.max(0,performance.now()-start),t=clamp(elapsed/duration,0,1);
        data.progress=kind==='missile'?.45*t+.55*t*t:t;
        data.position=path.at(data.progress);
        const before=path.at(Math.max(0,data.progress-.005)),after=path.at(Math.min(1,data.progress+.005));
        data.rotation=this.rotation(before,after);
        data.impact=clamp((elapsed-duration)/decay,0,1);data.impactVisible=elapsed>=duration&&elapsed<duration+decay;
      });
      const completed=await s.delay(duration+decay,'effects');
      if(!s.live||version!==this.effectVersion)return false;s.clear('effects');this.flight=null;return completed;
    }
    async playBorder(){
      const s=this.managed(),e=s?.event;if(!e?.borderCenter)return false;
      s.clear('effects');const version=++this.effectVersion;this.stateTo('PLAYING_EFFECT');
      const center=e.borderCenter,radius=e.borderRadius,start=performance.now();
      const segments=geo.borderSegments(e.borderLine,center,radius);
      for(const line of segments)s.add({polyline:{positions:line.map(p=>C.Cartesian3.fromDegrees(p.lon,p.lat,2500)),arcType:C.ArcType.NONE,width:2,material:color('#ffb347',.68)}},'local-border');
      // These are local exchange/impact symbols, not an invented country boundary.
      for(let i=0;i<3;i++){
        const p=geo.destination(center,radius*.38,i*Math.PI*2/3),a=geo.destination(p,radius*.16,Math.PI/2),b=geo.destination(p,radius*.16,-Math.PI/2);
        s.add({polyline:{positions:[C.Cartesian3.fromDegrees(a.lon,a.lat,6000),C.Cartesian3.fromDegrees(b.lon,b.lat,6000)],arcType:C.ArcType.NONE,width:2.2,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:new C.CallbackProperty(()=>color((Math.floor((performance.now()-start)/240)+i)%2?COLORS.primary:COLORS.secondary,.8),false)})}},'border-exchange');
        s.add({position:C.Cartesian3.fromDegrees(p.lon,p.lat,12000),billboard:{image:G.eventEffectAssets?.blast,width:19,height:19,show:new C.CallbackProperty(()=>s.live&&((performance.now()-start+i*170)%790)<260,false)}},'border-impact');
      }
      const ok=await s.delay(2900,'effects');if(!s.live||version!==this.effectVersion)return false;s.clear('effects');return ok;
    }
    async runBorder(n,iso,serial){
      const s=this.managed();if(!s)return;
      const e=s.event,scene=G.v51Scene;
      await scene.countryStage(e.primaryCountry,serial,{hold:700});if(!s.live)return;
      scene.clearScene();scene.hideBase();
      await scene.localFit(e.borderCenter,null,serial);if(!s.live)return;
      this.countryContext([],scene.drawCountry,true);
      scene.mark(e.borderCenter.lon,e.borderCenter.lat,e.targetLabel);
      if(!await this.playBorder()||!s.live)return;
      return scene.finalLocation({...n,lon:e.borderCenter.lon,lat:e.borderCenter.lat},serial);
    }
    snapshot(){const s=this.current();return {state:this.state,finished:s?.finished||false,event:s?{id:s.event.id,type:s.event.type,primaryCountry:s.event.primaryCountry,secondaryCountry:s.event.secondaryCountry,eventLocation:s.event.eventLocation}:null,resources:s?.counts()||{entities:0,timers:0,raf:0,frames:0},lastCleanup:this.lastCleanup}}
  }

  const manager=new EventEffectController();G.eventEffects=manager;G.EventEffectController=EventEffectController;
  const previousRun=G.runSequence;
  G.runSequence=async(n,iso,serial)=>{
    const scope=manager.begin(n,iso,serial);if(!scope)return false;
    try{
      const adapted=G.EventModel.adapt(scope.event);scope.adapted=adapted;
      if(scope.event.managed&&scope.event.type==='border_conflict')await manager.runBorder(adapted,iso,serial);
      else await previousRun(adapted,iso,serial);
      if(scope.live){scope.finished=true;manager.stateTo('DISPLAYING_STORY')}return scope.live;
    }catch(error){if(scope.live)manager.cleanup();throw error}
  };
  const previousWait=G.wait;
  G.wait=(ms,serial)=>{if(serial!==G.navSerial)return Promise.resolve(false);const s=manager.current();return s&&s.serial===serial?s.delay(ms):previousWait(ms,serial)};
  const previousFocus=G.focus,previousArc=G.showArc,previousNavigate=G.navigate;
  // Defer only the short prev/next transition arc until the old scene is gone.
  if(previousNavigate)G.navigate=function(...args){manager.navigation=true;try{return previousNavigate.apply(this,args)}finally{manager.navigation=false}};
  if(previousArc)G.showArc=function(...args){if(manager.navigation){manager.pendingArc=args;return}return previousArc.apply(this,args)};
  G.focus=function(...args){const arc=manager.pendingArc;manager.pendingArc=null;manager.cleanup();const result=previousFocus.apply(this,args);if(arc&&manager.current())previousArc.apply(this,arc);return result};
  for(const key of ['overview','buildScene']){
    const original=G[key];if(original)G[key]=function(...args){manager.cleanup();return original.apply(this,args)};
  }
  const previousClear=G.clearInteractionEffects;
  G.clearInteractionEffects=function(...args){manager.stopEffects();return previousClear?.apply(this,args)};
  // Legacy public entry points now share the same effect owner and trajectory.
  for(const key of ['v29ShowMissile','v29ShowDrone']){
    const original=G[key];G[key]=function(n,info){return manager.managed()?manager.playAttack(n,info):original?.(n,info)};
  }
  const previousBorder=G.showBorderConflictEffect;
  G.showBorderConflictEffect=n=>manager.managed()?manager.playBorder():previousBorder?.(n);
  G.showMissileEffect=(n,info)=>G.v29ShowMissile(n,info);
  G.showDroneEffect=(n,info)=>G.v29ShowDrone(n,info);
  const previousDuration=G.storyDuration;
  G.storyDuration=n=>{const e=G.EventModel.normalize(n,G.resolveIso?.(n));return Math.max(previousDuration?.(n)||15000,e.type==='drone_attack'?23000:e.type==='missile_attack'?19000:e.type==='border_conflict'?16000:0)};
})(window.NG14);
