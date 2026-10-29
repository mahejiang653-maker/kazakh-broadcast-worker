/* Optional, evidence-labelled event detail for the existing V52 viewer. */
(function(G){
  'use strict';
  if(!G || G.v52EventDetail)return;
  const precisions=new Set(['exact','site','city','region']);
  const kinds={satellite:'卫星或航空影像',news:'新闻现场图片',historical:'历史 / 公开设施照片'};
  let current=null,hidden=[],hiddenDom=[],overlay=null,occlusion=null;
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
  function hideOverlay(){
    if(overlay){overlay.remove();overlay=null;}
    if(typeof document!=='undefined')document.getElementById('v52-detail-style')?.remove();
  }
  function cancel(){
    if(current?.image){current.image.onload=null;current.image.onerror=null;current.image.removeAttribute?.('src');}
    current=null;hideOverlay();restore();
  }
  function prepare(n,serial){
    cancel();
    const spec=imageSpec(n);current={serial,spec,image:null,ready:false,failed:false};
    if(!spec||typeof Image==='undefined')return;
    const owner=current,img=new Image();owner.image=img;img.decoding='async';img.referrerPolicy='no-referrer';
    img.onload=()=>{
      if(current!==owner||!live(serial))return;
      owner.ready=img.naturalWidth>0&&img.naturalHeight>0&&img.naturalWidth*img.naturalHeight<=32000000;owner.failed=!owner.ready;
      if(owner.ready&&owner.siteReady&&!owner.finished&&showImage(serial)){
        G.v52Director?.stage('detail',serial);setPaused(G.v52Director?.getState?.().paused);
      }
    };
    img.onerror=()=>{if(current===owner)owner.failed=true;};
    img.src=spec.url;
  }
  function showImage(serial){
    if(overlay||!current||current.serial!==serial||!current.ready||!live(serial)||typeof document==='undefined')return false;
    const frame=document.querySelector('.map-frame');if(!frame)return false;
    const style=document.createElement('style');style.id='v52-detail-style';
    style.textContent='.v52-detail-photo{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:0;transition:opacity .7s ease}.v52-detail-photo.visible{opacity:1}.v52-detail-photo img{width:100%;height:100%;object-fit:contain;display:block;animation:v52-detail-push 8s ease-out both}.v52-detail-photo.paused img{animation-play-state:paused}.v52-detail-caption{position:absolute;left:8px;bottom:6px;max-width:90%;padding:3px 6px;border-radius:4px;background:#071321e8;color:white;font:11px/1.35 system-ui,sans-serif;pointer-events:auto}.v52-detail-caption a{color:#b6eaff}.v52-detail-close img[data-flag-source]{visibility:hidden!important}@keyframes v52-detail-push{from{transform:scale(1)}to{transform:scale(1.035)}}';
    document.head.appendChild(style);
    const layer=document.createElement('div');layer.className='v52-detail-photo';
    const photo=current.image;photo.alt=kinds[current.spec.kind];
    const caption=document.createElement('div');caption.className='v52-detail-caption';
    caption.append(document.createTextNode(kinds[current.spec.kind]+' · '+current.spec.date+' · '));
    const source=document.createElement('a');source.href=current.spec.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent=current.spec.source;
    const license=document.createElement('a');license.href=current.spec.licenseUrl;license.target='_blank';license.rel='noopener noreferrer';license.textContent=current.spec.license;
    caption.append(source,document.createTextNode(' · '),license);
    layer.append(photo,caption);frame.appendChild(layer);overlay=layer;
    requestAnimationFrame(()=>{if(overlay===layer&&live(serial))layer.classList.add('visible');});
    return true;
  }
  function setPaused(value){overlay?.classList.toggle('paused',!!value);}
  async function fly(point,height,duration,serial,C){
    if(!live(serial)||!C||!G.viewer?.camera)return false;
    return await new Promise(resolve=>{
      let finished=false;const done=ok=>{if(finished)return;finished=true;resolve(ok&&live(serial));};
      try{G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(point.lon,point.lat,height),
        orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration,
        easingFunction:C.EasingFunction?.CUBIC_IN_OUT,complete:()=>done(true),cancel:()=>done(false)});}catch{done(false);}
    });
  }
  async function run(n,serial,C=window.Cesium){
    const p=cameraPlan(n);if(!p)return true;
    if(!live(serial))return false;
    const owner=current;let completed=false;
    try{
      // A settled attack may still own a resize handler which would otherwise
      // start an old wide camera flight during the new closeup.
      G.v52Attack?.clear?.();
      G.v52Director?.stage('approach',serial);
      if(!await G.v52Director?.checkpoint('approach',serial))return false;
      if(!await fly(p,p.approachHeight,p.approachDuration,serial,C))return false;
      if(!await G.v52Director?.checkpoint('site',serial))return false;
      hideAnnotations();G.v52Director?.stage('site',serial);
      if(!await fly(p,p.siteHeight,p.siteDuration,serial,C))return false;
      if(!await G.v52Director?.checkpoint('site',serial))return false;
      if(owner?.serial===serial)owner.siteReady=true;
      if(showImage(serial))G.v52Director?.stage('detail',serial);
      const result=await G.wait(p.detailDuration*1000,serial);
      if(owner?.serial===serial)owner.finished=true;
      completed=!!result;return result;
    }finally{
      // Never let an obsolete run restore entities belonging to a newer one.
      if(!completed&&current===owner&&live(serial))cancel();
    }
  }
  if(typeof G.initViewer==='function'){
    const init=G.initViewer;
    G.initViewer=async function(...args){
      const result=await init.apply(this,args),viewer=G.viewer;
      const mobile=window.innerWidth<=760||!!window.matchMedia?.('(pointer: coarse)')?.matches;
      if(mobile&&viewer?.scene?.globe){
        const lowMemory=Number(window.navigator?.deviceMemory)>0&&Number(window.navigator.deviceMemory)<=4;
        viewer.resolutionScale=Math.min(viewer.resolutionScale,lowMemory?1:1.35);
        viewer.scene.globe.maximumScreenSpaceError=Math.max(viewer.scene.globe.maximumScreenSpaceError,lowMemory?2:1.4);
        viewer.scene.globe.tileCacheSize=Math.min(viewer.scene.globe.tileCacheSize||100,80);
        try{viewer.scene.msaaSamples=Math.min(viewer.scene.msaaSamples||1,2);}catch{}
        viewer.scene.requestRender?.();
      }
      return result;
    };
  }
  G.v52EventDetail={version:'20261028-event-detail-v1',normalizeStory,cameraPlan,imageSpec,storyForMap,prepare,run,cancel,setPaused};
})(window.NG14);
