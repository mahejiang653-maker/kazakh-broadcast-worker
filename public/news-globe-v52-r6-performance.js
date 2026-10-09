(function(G){
  'use strict';
  const C=window.Cesium;
  if(!G||!C||G.v52Performance)return;
  let disposed=false,moving=false,dirty=true,lastCheck=0,lastKey='',occlusionChecks=0;
  let viewer=null,resizeTimer=null,removeCollection=null,lastPose=null,lastMoved=0;
  const removers=[],animated=new Set();
  const read=(p,t)=>p?.getValue?p.getValue(t):p;
  function dynamic(e){
    if(e.position?.isConstant===false||e.orientation?.isConstant===false)return true;
    for(const name of ['point','billboard','label','polyline','polygon','ellipse','corridor','ellipsoid']){
      const graphics=e[name];if(!graphics)continue;
      for(const prop of ['show','positions','hierarchy','material','color','pixelSize','scale','rotation','semiMajorAxis','semiMinorAxis','radii'])
        if(graphics[prop]?.isConstant===false)return true;
    }
    return false;
  }
  function index(e){if(dynamic(e))animated.add(e);else animated.delete(e);}
  function visibleAnimations(){
    const t=viewer.clock.currentTime;
    for(const e of animated){
      if(e.show===false||e.isShowing===false)continue;
      for(const name of ['point','billboard','label','polyline','polygon','ellipse','corridor','ellipsoid'])
        if(e[name]&&read(e[name].show,t)!==false)return true;
    }
    return false;
  }
  function profile(){
    const mobile=!!window.matchMedia?.('(pointer: coarse)')?.matches||window.innerWidth<=900;
    const dpr=Math.max(1,Number(window.devicePixelRatio)||1);
    return {mobile,scale:Math.min(dpr,moving?1:mobile?1.3:1.5),sse:moving?1.8:mobile?1.2:1.05,frameRate:mobile?30:45};
  }
  function apply(){
    if(disposed||!viewer)return;
    const p=profile();viewer.resolutionScale=p.scale;
    viewer.scene.globe.maximumScreenSpaceError=p.sse;
    viewer.targetFrameRate=p.frameRate;
    viewer.scene.requestRender();dirty=true;
  }
  function resized(){clearTimeout(resizeTimer);resizeTimer=setTimeout(apply,140);}
  function visibility(){if(!document.hidden){lastCheck=0;dirty=true;viewer?.scene.requestRender();}}
  function updateMovement(){
    const camera=viewer.camera,pose=[];
    for(const key of ['positionWC','directionWC','upWC'])for(const axis of ['x','y','z'])pose.push(camera[key][axis]);
    const now=performance.now();
    const changed=lastPose&&pose.some((v,i)=>Math.abs(v-lastPose[i])>(i<3?.02:1e-8));
    lastPose=pose;
    if(changed){
      lastMoved=now;dirty=true;
      if(!moving){moving=true;apply();}
    }else if(moving&&now-lastMoved>=250){moving=false;apply();}
  }
  const initViewer=G.initViewer;
  G.initViewer=async function(...args){
    const result=await initViewer.apply(this,args);viewer=G.viewer;
    const scene=viewer.scene;
    scene.requestRenderMode=true;
    scene.maximumRenderTimeChange=Infinity;
    // Thicker outlined borders remain crisp without a costly 4-sample framebuffer.
    scene.msaaSamples=1;scene.globe.preloadSiblings=false;
    for(const e of viewer.entities.values)index(e);
    removeCollection=viewer.entities.collectionChanged.addEventListener((_,added,removed,changed)=>{
      for(const e of removed)animated.delete(e);
      for(const e of added)index(e);for(const e of changed)index(e);
      dirty=true;scene.requestRender();
    });
    // Canvas resolution changes also trigger camera move events. Compare the public
    // camera pose instead, so restoring sharpness cannot start a resize/move loop.
    // Cesium requests frames for camera/tile changes. Explicitly keep CallbackProperty
    // effects moving, including missiles, carriers and pulses, without redrawing static routes.
    removers.push(scene.postUpdate.addEventListener(()=>{
      if(disposed||document.hidden)return;
      updateMovement();
      if(dirty||visibleAnimations()){scene.requestRender();dirty=false;}
    }));
    window.addEventListener('resize',resized,{passive:true});
    document.addEventListener('visibilitychange',visibility);
    apply();return result;
  };
  const loadBorders=G.loadBorders;
  G.loadBorders=async function(...args){
    viewer.entities.suspendEvents();
    try{return await loadBorders.apply(this,args);}
    finally{viewer.entities.resumeEvents();}
  };
  const updateOcclusion=G.updateOcclusion;
  G.updateOcclusion=function(...args){
    if(disposed||document.hidden)return;
    const now=performance.now(),key=[G.current,G.navSerial,G.started,G.overviewMode].join('|');
    if(!dirty&&key===lastKey&&!moving)return;
    if(key===lastKey&&now-lastCheck<48)return;
    lastCheck=now;lastKey=key;occlusionChecks++;
    return updateOcclusion.apply(this,args);
  };
  function dispose(){
    if(disposed)return;disposed=true;
    clearTimeout(resizeTimer);
    removeCollection?.();for(const remove of removers)remove();animated.clear();
    window.removeEventListener('resize',resized);document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('pagehide',pagehide);
  }
  function pagehide(e){if(!e.persisted)dispose();}
  window.addEventListener('pagehide',pagehide);
  G.v52Performance={version:'20261010-r6-clear-smooth-r3',dispose,getDiagnostics:()=>({
    disposed,moving,animatedEntities:animated.size,occlusionChecks,requestRenderMode:viewer?.scene.requestRenderMode,
    scale:viewer?.resolutionScale,targetFrameRate:viewer?.targetFrameRate,
  })};
})(window.NG14);
