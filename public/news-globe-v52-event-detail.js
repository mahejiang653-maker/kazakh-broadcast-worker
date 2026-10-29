/* Optional, evidence-labelled event detail for the existing V52 viewer. */
(function(G){
  'use strict';
  if(!G || G.v52EventDetail)return;
  const precisions=new Set(['exact','site','city','region']);
  const kinds={satellite:'卫星或航空影像',news:'新闻现场图片',historical:'历史 / 公开设施照片'};
  let current=null,hidden=[],hiddenDom=[],faded=[],fadedDom=[],occlusion=null;
  const https=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:' && !!u.hostname && !u.username && !u.password;}catch{return false;}};
  const numeric=value=>typeof value==='number'?Number.isFinite(value):
    typeof value==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())&&Number.isFinite(Number(value));
  const coordinate=(lon,lat)=>numeric(lon)&&numeric(lat)&&Math.abs(Number(lon))<=180&&Math.abs(Number(lat))<=90;
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) &&
    !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function verifiedLocation(n){
    const p=String(n?.locationPrecision||'').toLowerCase(),e=n?.eventLocation;
    if(!precisions.has(p)||!e||e.verified!==true||!https(e.sourceUrl))return null;
    const lon=e.lon??e.longitude,lat=e.lat??e.latitude;
    return coordinate(lon,lat)?{lon:Number(lon),lat:Number(lat),precision:p}:null;
  }
  function normalizeStory(n){
    if(!n||typeof n!=='object')return n;
    const point=verifiedLocation(n);
    if(!point||n.noPoint===true)return n;
    const result={...n,lon:point.lon,lat:point.lat};
    const attack=G.v52AttackModel?.resolve?.(n)||/^(ATTACK|MISSILE_ATTACK|DRONE_ATTACK|POTENTIAL_ATTACK)$/.test(String(n.sceneMode||'').toUpperCase())||
      /^(missile|drone|uav)$/i.test(String(n.attackType||''));
    if(attack){
      result.targetLon=point.lon;result.targetLat=point.lat;
      const target=value=>value&&typeof value==='object'?{...value,lon:point.lon,lat:point.lat}:value;
      if(n.target)result.target=target(n.target);
      if(n.attackEffect?.target)result.attackEffect={...n.attackEffect,target:target(n.attackEffect.target)};
      if(n.scenePlan?.attackEffect?.target)result.scenePlan={...n.scenePlan,
        attackEffect:{...n.scenePlan.attackEffect,target:target(n.scenePlan.attackEffect.target)}};
    }
    return result;
  }
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function boundsHeight(bounds,point){
    if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(x=>typeof x!=='number'||!Number.isFinite(x)))return 0;
    const [w,s,e,n]=bounds;
    if(w>=e||s>=n||w< -180||e>180||s< -90||n>90||e-w>.5||n-s>.5||point.lon<w||point.lon>e||point.lat<s||point.lat>n)return 0;
    // The camera remains centered on the verified point, which may be near
    // the edge rather than the center of the supplied facility bounds.
    const width=2*Math.max(point.lon-w,e-point.lon)*111320*Math.max(.1,Math.cos(point.lat*Math.PI/180));
    const height=2*Math.max(point.lat-s,n-point.lat)*111320;
    return Math.max(width/1.5,height)*1.8;
  }
  function cameraPlan(n){
    if(n?.detailEnabled===false||n?.noPoint===true)return null;
    const point=verifiedLocation(n);if(!point)return null;
    const defaults={exact:1800,site:4000,city:28000,region:110000};
    const minima={exact:800,site:1800,city:18000,region:70000};
    const maxima={exact:12000,site:35000,city:90000,region:300000};
    const preset=n.cameraPreset&&typeof n.cameraPreset==='object'?n.cameraPreset:{};
    const requested=Number(preset.siteHeight);
    let height=defaults[point.precision];
    if(Number.isFinite(requested)&&requested>0)height=requested;
    if(point.precision==='site'||point.precision==='exact')height=Math.max(height,boundsHeight(n.targetBounds,point));
    height=clamp(height,minima[point.precision],maxima[point.precision]);
    const duration=(key,fallback)=>Number.isFinite(Number(preset[key]))&&Number(preset[key])>0?clamp(Number(preset[key]),.5,15):fallback;
    return {...point,siteHeight:height,approachHeight:Math.max(height*3,point.precision==='region'?200000:point.precision==='city'?65000:22000),
      approachDuration:duration('approachDuration',2.8),siteDuration:duration('siteDuration',3.2),detailDuration:duration('detailDuration',4)};
  }
  function imageSpec(n){
    if(!cameraPlan(n)||!['exact','site'].includes(String(n.locationPrecision||'').toLowerCase()))return null;
    const x=n.detailImage;if(!x||typeof x!=='object'||x.verified!==true||x.locationMatch!==true||!kinds[x.kind])return null;
    if(!https(x.url)||!https(x.sourceUrl)||!https(x.licenseUrl)||!String(x.source||'').trim()||!String(x.license||'').trim()||!validDate(x.date))return null;
    return {url:String(x.url),source:String(x.source).trim().slice(0,160),sourceUrl:String(x.sourceUrl),
      date:x.date,license:String(x.license).trim().slice(0,120),licenseUrl:String(x.licenseUrl),kind:x.kind};
  }
  function storyForMap(n){
    if(!cameraPlan(n)||!G.v52AttackModel?.resolve?.(n))return n;
    const prior=n.scenePlan?.attackEffect||n.attackEffect||{};
    const effect={...prior,enabled:false,impact:{...(prior.impact||{}),enabled:false}};
    return {...n,attackEffect:effect,scenePlan:{...(n.scenePlan||{}),attackEffect:effect}};
  }
  function live(serial){return serial===G.navSerial&&!G.overviewMode;}
  function restore(){
    for(const item of faded){try{if(item.graphic[item.field]===item.callback)item.graphic[item.field]=item.original;}catch{}}
    faded=[];
    for(const item of fadedDom){try{item.element.style.opacity=item.opacity;}catch{}}
    fadedDom=[];
    for(const item of hidden){try{item.entity.show=item.show;}catch{}}
    hidden=[];
    for(const item of hiddenDom){try{item.element.style.visibility=item.visibility;}catch{}}
    hiddenDom=[];
    if(occlusion&&G.updateOcclusion===occlusion.wrapper)G.updateOcclusion=occlusion.original;
    occlusion=null;
    if(typeof document!=='undefined')document.body?.classList?.remove('v52-detail-close');
  }
  function hideAnnotations(){
    restore();
    const seen=new Set();
    for(const list of [G.v51SceneEntities,G.markers,G.pulses,G.localHighlightEntities,G.borderEntities,G.chinaSpecialEntities]){
      for(const entity of Array.isArray(list)?list:[]){
        if(!entity||seen.has(entity)||entity.show===false)continue;
        seen.add(entity);hidden.push({entity,show:entity.show});entity.show=false;
      }
    }
    if(typeof G.updateOcclusion==='function'){
      const original=G.updateOcclusion,wrapper=function(){if(hidden.length)return;return original.apply(this,arguments);};
      occlusion={original,wrapper};G.updateOcclusion=wrapper;
    }
    if(typeof document!=='undefined'){
      document.body?.classList?.add('v52-detail-close');
      for(const element of document.querySelectorAll?.('img[data-flag-source]')||[]){
        hiddenDom.push({element,visibility:element.style.visibility});element.style.visibility='hidden';
      }
    }
    G.viewer?.scene?.requestRender?.();
  }
  function cancel(){
    current=null;restore();
  }
  function prepare(n,serial){
    // Existing JSON may still carry image metadata, but the final view is the
    // satellite map. Do not request, decode or overlay those photographs.
    cancel();current={serial};
  }
  function setPaused(){}
  async function fly(point,height,duration,serial,C){
    if(!live(serial)||!C||!G.viewer?.camera)return false;
    return await new Promise(resolve=>{
      let finished=false;const done=ok=>{if(finished)return;finished=true;resolve(ok&&live(serial));};
      try{G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(point.lon,point.lat,height),
        orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration,
        easingFunction:C.EasingFunction?.CUBIC_IN_OUT,complete:()=>done(true),cancel:()=>done(false)});}catch{done(false);}
    });
  }
  function fadeDuringDescent(p,serial,owner,C,onClose){
    const scene=G.viewer?.scene,camera=G.viewer?.camera,event=scene?.preRender;
    if(!event?.addEventListener||!C?.CallbackProperty||!C?.Color?.WHITE)return ()=>{};
    const start=Number(camera?.positionCartographic?.height)||p.siteHeight*25;
    const lists=[G.v51SceneEntities,G.markers,G.pulses,G.localHighlightEntities];
    // V51 markers are often 30 km above the surface. Finish fading before
    // the camera reaches their elevation, or they pop out behind the camera.
    let annotationTop=30000;
    for(const list of lists)for(const entity of Array.isArray(list)?list:[]){
      if(!entity||entity.show===false||!(entity.point||entity.billboard||entity.label))continue;
      try{
        const position=entity.position?.getValue?.(G.viewer?.clock?.currentTime);
        const height=position&&C.Cartographic?.fromCartesian?.(position)?.height;
        if(Number.isFinite(height))annotationTop=Math.max(annotationTop,height);
      }catch{}
    }
    const fadeEnd=Math.max(p.siteHeight*1.02,Math.min(annotationTop+5000,start*.8));
    const fadeStart=Math.max(fadeEnd+1,Math.min(start*.94,Math.max(fadeEnd*1.8,p.siteHeight*12)));
    const ascending=p.siteHeight>start+100,level=Math.abs(p.siteHeight-start)<=100,began=Date.now();
    const travel=G.v52Director?.getState?.()?.timing?.travel||1;
    const duration=(p.approachDuration+p.siteDuration)*travel*1000;
    const opacity=()=>{const height=Number(camera?.positionCartographic?.height);
      if(!Number.isFinite(height))return 1;
      if(ascending)return clamp((p.siteHeight-height)/(p.siteHeight-start),0,1);
      if(level)return clamp(1-(Date.now()-began)/duration,0,1);
      return clamp((height-fadeEnd)/(fadeStart-fadeEnd),0,1);};
    const fadeColor=(graphic,field,defaultWhite=false)=>{
      const original=graphic?.[field];if(original==null&&!defaultWhite)return;
      const callback=new C.CallbackProperty((time,result)=>{
        let color;try{color=original?.getValue?original.getValue(time):original||C.Color.WHITE;}catch{return C.Color.WHITE;}
        return color?.withAlpha?color.withAlpha((Number.isFinite(color.alpha)?color.alpha:1)*opacity(),result):color;
      },false);
      graphic[field]=callback;faded.push({graphic,field,original,callback});
    };
    const seen=new Set();
    for(const list of lists){
      for(const entity of Array.isArray(list)?list:[]){
        if(!entity||seen.has(entity)||entity.show===false)continue;seen.add(entity);
        for(const [type,fields] of [['point',['color','outlineColor']],['billboard',['color']],['label',['fillColor','outlineColor','backgroundColor']],['ellipse',['outlineColor']]]){
          const graphic=entity[type];if(!graphic)continue;
          for(const field of fields)fadeColor(graphic,field,type==='billboard'&&field==='color');
        }
        // Preserve the pulse's original dynamic color property and restore it
        // when navigation changes; other material types are left untouched.
        if(entity.ellipse?.material?.color)fadeColor(entity.ellipse.material,'color');
      }
    }
    if(typeof document!=='undefined')for(const element of document.querySelectorAll?.('img[data-flag-source]')||[])
      fadedDom.push({element,opacity:element.style.opacity});
    let remove,stopped=false;
    const stop=()=>{if(stopped)return;stopped=true;remove?.();};
    remove=event.addEventListener(()=>{
      if(!live(serial)||current!==owner){stop();return;}
      const amount=opacity();
      for(const item of fadedDom){const base=item.opacity===''?1:Number(item.opacity);item.element.style.opacity=String((Number.isFinite(base)?base:1)*amount);}
      if(amount<=0){stop();onClose();}
    });
    return stop;
  }
  async function run(n,serial,C=window.Cesium){
    const p=cameraPlan(n);if(!p)return true;
    if(!live(serial))return false;
    const owner=current;let completed=false,stopFade=()=>{},closeReady=false;
    const close=()=>{if(closeReady||!live(serial)||current!==owner)return;closeReady=true;hideAnnotations();G.v52Director?.stage('site',serial);};
    try{
      // A settled attack may still own a resize handler which would otherwise
      // start an old wide camera flight during the new closeup.
      G.v52Attack?.clear?.();
      G.v52Director?.stage('approach',serial);
      if(!await G.v52Director?.checkpoint('approach',serial))return false;
      // A single eased flight prevents the camera from stopping and starting
      // at an artificial intermediate altitude. Labels fade as it descends.
      stopFade=fadeDuringDescent(p,serial,owner,C,close);
      if(!await fly(p,p.siteHeight,p.approachDuration+p.siteDuration,serial,C))return false;
      stopFade();close();
      if(!await G.v52Director?.checkpoint('site',serial))return false;
      const result=await G.wait(p.detailDuration*1000,serial);
      completed=!!result;return result;
    }finally{
      stopFade();
      // Never let an obsolete run restore entities belonging to a newer one.
      if(!completed&&current===owner&&live(serial))cancel();
    }
  }
  function whitenYellowLabels(viewer,C){
    const entities=viewer?.entities,white=C?.Color?.WHITE;
    if(!entities?.collectionChanged?.addEventListener||!white)return;
    const fix=e=>{
      const label=e?.label,property=label?.fillColor;
      if(!property)return;
      let color;try{color=property.getValue?property.getValue(viewer.clock?.currentTime):property;}catch{return;}
      if(!color||![color.red,color.green,color.blue].every(Number.isFinite))return;
      if(color.red>=.75&&color.green>=.67&&color.red-color.blue>=.09&&color.green-color.blue>=.07)
        label.fillColor=white.withAlpha(Number.isFinite(color.alpha)?color.alpha:1);
    };
    for(const e of entities.values||[])fix(e);
    const remove=entities.collectionChanged.addEventListener((_,added,removed,changed)=>{
      for(const e of added||[])fix(e);
      for(const e of changed||[])fix(e);
    });
    window.addEventListener?.('pagehide',event=>{if(!event.persisted)remove?.();});
  }
  if(typeof G.initViewer==='function'){
    const init=G.initViewer;
    G.initViewer=async function(...args){
      const result=await init.apply(this,args),viewer=G.viewer;
      const mobile=window.innerWidth<=760||!!window.matchMedia?.('(pointer: coarse)')?.matches;
      if(mobile&&viewer?.scene?.globe){
        // Preserve the original V52 pixel density, terrain detail and MSAA.
        // Only cap the tile cache; lowering resolution blurred map labels.
        viewer.scene.globe.tileCacheSize=Math.min(viewer.scene.globe.tileCacheSize||100,100);
        viewer.scene.requestRender?.();
      }
      whitenYellowLabels(viewer,window.Cesium);
      return result;
    };
  }
  G.v52EventDetail={version:'20261030-mobile-clarity-v1',normalizeStory,cameraPlan,imageSpec,storyForMap,prepare,run,cancel,setPaused};
})(window.NG14);
