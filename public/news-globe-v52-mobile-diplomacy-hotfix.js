(function attach(){
  const G=window.NG14=window.NG14||{};
  if(G.__v52MobileDiplomacyHotfix)return;
  const baseRun=G.runSequence;
  if(typeof baseRun!=='function'){
    // Main engine may not be ready yet. Retry instead of permanently returning.
    return setTimeout(attach,50);
  }
  G.__v52MobileDiplomacyHotfix=true;
  const C=window.Cesium;
  const safeEntities=[];
  function clearSafe(){
    if(!G.viewer?.entities)return;
    while(safeEntities.length){const e=safeEntities.pop();try{G.viewer.entities.remove(e)}catch{}}
  }
  function clearHeavy(){
    for(const k of ['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities']){
      const a=G[k]; if(!Array.isArray(a))continue;
      while(a.length){const e=a.pop();try{G.viewer?.entities?.remove(e)}catch{}}
    }
    try{G.clearInteractionEffects?.()}catch{}
    try{G.clearSecondaryCountry?.()}catch{}
    try{G.clearLocal?.()}catch{}
    try{G.clearCountry?.()}catch{}
    try{G.clearArc?.()}catch{}
    clearSafe();
  }
  function addSideLabel(lon,lat,text,color){
    if(!G.viewer?.entities||!C)return;
    const e=G.viewer.entities.add({
      position:C.Cartesian3.fromDegrees(lon,lat,150000),
      label:{
        text,
        font:'600 17px sans-serif',
        fillColor:color,
        outlineColor:C.Color.BLACK.withAlpha(0.9),
        outlineWidth:4,
        style:C.LabelStyle.FILL_AND_OUTLINE,
        showBackground:true,
        backgroundColor:C.Color.BLACK.withAlpha(0.6),
        pixelOffset:new C.Cartesian2(0,-20),
        disableDepthTestDistance:Number.POSITIVE_INFINITY,
        distanceDisplayCondition:new C.DistanceDisplayCondition(0,2.5e7)
      }
    });
    safeEntities.push(e);
  }
  G.runSequence=async function(n,iso,s){
    const mode=String(n?.sceneMode||'').toUpperCase();
    const p=n?.scenePlan||{};
    const participants=Array.isArray(p.participants)?p.participants.map(x=>String(x).toUpperCase()):[];
    const isRemoteDiplomacy=mode==='DIPLOMACY_2' && p.finalLocation===false && participants.length>=2;
    if(!isRemoteDiplomacy)return baseRun(n,iso,s);

    clearHeavy();
    if(s!==G.navSerial)return;
    try{if(G.markers?.[G.current])G.markers[G.current].show=false}catch{}
    try{if(G.pulses?.[G.current])G.pulses[G.current].show=false}catch{}

    addSideLabel(-77.0369,38.9072,'美国 · 通话方',C?.Color?.fromCssColorString?.('#ff5b68')||C.Color.WHITE);
    addSideLabel(37.6173,55.7558,'俄罗斯 · 通话方',C?.Color?.fromCssColorString?.('#42a5ff')||C.Color.WHITE);

    try{
      G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(-20,52,17500000),duration:1.2});
    }catch{}
    try{G.viewer.scene.requestRender()}catch{}
  };
})();