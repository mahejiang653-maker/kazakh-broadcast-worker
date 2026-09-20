(function(){
  if(!window.Cesium||window.__NG52CameraBreathingRoom)return;
  window.__NG52CameraBreathingRoom=true;
  const C=window.Cesium;
  const P=C.Camera&&C.Camera.prototype;
  if(!P)return;

  const oldFlyTo=P.flyTo;
  const oldFlyToBoundingSphere=P.flyToBoundingSphere;
  const globeRadius=6378137;
  let transitionSerial=0;

  function angularDistance(a,b){
    const dlon=b.longitude-a.longitude;
    return Math.acos(Math.max(-1,Math.min(1,Math.sin(a.latitude)*Math.sin(b.latitude)+Math.cos(a.latitude)*Math.cos(b.latitude)*Math.cos(dlon))));
  }
  function isNewsTransition(options,from,to){
    if(!options||!to||!from)return false;
    if(options.__v52Direct)return false;
    const d=angularDistance(from,to);
    return d>C.Math.toRadians(7)&&to.height>50000;
  }
  function elevatedCruiseHeight(distance,targetHeight){
    const km=distance*globeRadius/1000;
    const dynamic=1700000+Math.min(5200000,km*520);
    return Math.max(targetHeight*1.65,dynamic);
  }
  function transitionDuration(distance){
    const km=distance*globeRadius/1000;
    return Math.max(2.8,Math.min(6.2,2.6+km/2600));
  }

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
        const target=C.Cartographic.fromCartesian(options.destination);
        const from=C.Cartographic.fromCartesian(this.positionWC);
        if(target&&Number.isFinite(target.height)&&target.height>50000){
          const h=target.height*heightFactor(target.height);
          const finalDestination=C.Cartesian3.fromRadians(target.longitude,target.latitude,h);
          const distance=from?angularDistance(from,target):0;
          if(isNewsTransition(options,from,target)){
            const serial=++transitionSerial;
            try{this.cancelFlight()}catch(e){}
            const total=transitionDuration(distance), cruise=elevatedCruiseHeight(distance,h);
            const lift=Math.max(cruise,Number.isFinite(from.height)?from.height:0);
            const midLon=from.longitude+Math.atan2(Math.sin(target.longitude-from.longitude),Math.cos(target.longitude-from.longitude))*.52;
            const midLat=from.latitude+(target.latitude-from.latitude)*.52;
            const userComplete=options.complete,userCancel=options.cancel;
            const common={orientation:options.orientation||{heading:0,pitch:C.Math.toRadians(-90),roll:0},easingFunction:C.EasingFunction.QUADRATIC_IN_OUT};
            const leg3=()=>{if(serial!==transitionSerial)return;oldFlyTo.call(this,Object.assign({},options,common,{__v52Direct:true,destination:finalDestination,duration:total*.30,complete:userComplete,cancel:userCancel}))};
            const leg2=()=>{if(serial!==transitionSerial)return;oldFlyTo.call(this,Object.assign({},common,{__v52Direct:true,destination:C.Cartesian3.fromRadians(midLon,midLat,cruise),duration:total*.42,complete:leg3,cancel:userCancel}))};
            return oldFlyTo.call(this,Object.assign({},common,{__v52Direct:true,destination:C.Cartesian3.fromRadians(from.longitude,from.latitude,lift),duration:total*.28,complete:leg2,cancel:userCancel}));
          }
          options=Object.assign({},options,{destination:finalDestination,duration:Math.max(Number(options.duration)||0,1.35),easingFunction:C.EasingFunction.QUADRATIC_IN_OUT});
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