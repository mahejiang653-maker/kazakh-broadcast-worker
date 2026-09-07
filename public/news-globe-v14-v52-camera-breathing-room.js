(function(){
  if(!window.Cesium||window.__NG52CameraBreathingRoom)return;
  window.__NG52CameraBreathingRoom=true;
  const C=window.Cesium;
  const P=C.Camera&&C.Camera.prototype;
  if(!P)return;

  const oldFlyTo=P.flyTo;
  const oldFlyToBoundingSphere=P.flyToBoundingSphere;

  function heightFactor(h){
    if(!Number.isFinite(h)||h<=0)return 1;
    if(h<400000)return 1.22;
    if(h<1200000)return 1.18;
    if(h<6000000)return 1.14;
    return 1.08;
  }

  function rangeFactor(r){
    if(!Number.isFinite(r)||r<=0)return 1;
    if(r<1000000)return 1.20;
    if(r<5000000)return 1.15;
    return 1.10;
  }

  P.flyTo=function(options){
    try{
      if(options&&options.destination&&options.destination instanceof C.Cartesian3){
        const cart=C.Cartographic.fromCartesian(options.destination);
        if(cart&&Number.isFinite(cart.height)&&cart.height>50000){
          const h=cart.height*heightFactor(cart.height);
          options=Object.assign({},options,{destination:C.Cartesian3.fromRadians(cart.longitude,cart.latitude,h)});
        }
      }
    }catch(e){}
    return oldFlyTo.call(this,options);
  };

  P.flyToBoundingSphere=function(bs,options){
    try{
      if(options&&options.offset&&Number.isFinite(options.offset.range)&&options.offset.range>0){
        const o=options.offset;
        const offset=new C.HeadingPitchRange(o.heading,o.pitch,o.range*rangeFactor(o.range));
        options=Object.assign({},options,{offset});
      }
    }catch(e){}
    return oldFlyToBoundingSphere.call(this,bs,options);
  };

  // V52 hotfix: entering overview must remove every custom scene entity from the
  // previously viewed story. Keep the existing overview camera/UI behavior unchanged.
  const G=window.NG14;
  if(G&&typeof G.overview==='function'&&!G.__v52OverviewCleanupFix){
    G.__v52OverviewCleanupFix=true;
    const oldOverview=G.overview;
    const sceneLists=['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities'];
    function clearList(name){
      const list=G[name];
      if(!Array.isArray(list))return;
      for(const e of list.splice(0)){
        try{G.viewer&&G.viewer.entities&&G.viewer.entities.remove(e)}catch(err){}
      }
    }
    G.overview=function(){
      for(const name of sceneLists)clearList(name);
      try{G.clearInteractionEffects&&G.clearInteractionEffects()}catch(e){}
      try{G.clearSecondaryCountry&&G.clearSecondaryCountry()}catch(e){}
      const hud=document.getElementById('scenePlanHud');
      if(hud){hud.style.display='none';hud.innerHTML=''}
      return oldOverview.apply(this,arguments);
    };
  }

  window.NG52_VIEW_RULES={
    countryBackoff:'8–10%',
    eventBackoff:'18–22%',
    regionalBackoff:'14–18%',
    globeBackoff:'8%'
  };
})(window.NG14);