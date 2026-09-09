(function(G){
  const C=window.Cesium;
  const $=G.$;
  if(!C||!$) return;

  const hasPoint=n=>Number.isFinite(Number(n?.lon))&&Number.isFinite(Number(n?.lat));

  G.buildScene=()=>{
    G.clearScene();
    G.news.forEach((n,i)=>{
      if(!hasPoint(n)){
        G.markers.push(null);
        G.pulses.push(null);
        return;
      }
      const lon=Number(n.lon),lat=Number(n.lat);
      const p=C.Cartesian3.fromDegrees(lon,lat,30000);
      G.markers.push(G.viewer.entities.add({
        position:p,
        show:false,
        point:{pixelSize:6,color:C.Color.fromCssColorString('#ff4d4d'),outlineColor:C.Color.WHITE.withAlpha(.9),outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY}
      }));
      G.pulses.push(G.viewer.entities.add({
        position:C.Cartesian3.fromDegrees(lon,lat,500),
        show:false,
        ellipse:{
          semiMajorAxis:new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?18000+((Math.sin(G.pulsePhase)+1)/2)*22000:1,false),
          semiMinorAxis:new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?18000+((Math.sin(G.pulsePhase)+1)/2)*22000:1,false),
          material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?C.Color.fromCssColorString('#ff4d4d').withAlpha(.1):C.Color.TRANSPARENT,false)),
          outline:true,
          outlineColor:new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?C.Color.fromCssColorString('#ff4d4d').withAlpha(.32):C.Color.TRANSPARENT,false)
        }
      }));
    });
  };

  G.updateOcclusion=()=>{
    if(!G.viewer||!Array.isArray(G.markers)||!G.markers.length)return;
    const o=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,G.viewer.camera.positionWC);
    G.markers.forEach((e,i)=>{
      const pulse=G.pulses?.[i]||null;
      if(!e){ if(pulse) pulse.show=false; return; }
      if(G.overviewMode||!G.started||i!==G.current){e.show=false;if(pulse)pulse.show=false;return;}
      let p=null,v=false;
      try{p=e.position?.getValue?.(G.viewer.clock.currentTime);v=!!p&&o.isPointVisible(p);}catch{}
      e.show=v;
      if(pulse)pulse.show=v;
    });
  };

  G.restyle=()=>{
    G.markers.forEach((e,i)=>{
      if(!e)return;
      const active=G.started&&!G.overviewMode&&i===G.current;
      e.point.pixelSize=active?6:1;
      e.point.color=active?C.Color.fromCssColorString('#ff4d4d'):C.Color.TRANSPARENT;
      e.point.outlineColor=active?C.Color.WHITE.withAlpha(.9):C.Color.TRANSPARENT;
      e.point.outlineWidth=active?1:0;
      if(!active)e.show=false;
      const pulse=G.pulses?.[i];if(pulse&&!active)pulse.show=false;
    });
    [...$('timeline').children].forEach((e,i)=>{e.classList.toggle('active',G.started&&!G.overviewMode&&i===G.current);e.classList.toggle('visited',G.started&&i<G.current)});
    G.updateOcclusion();
  };

  G.clearScene=()=>{
    try{G.clearArc?.()}catch{}
    try{G.clearLocal?.()}catch{}
    if(Array.isArray(G.markers)) for(const e of G.markers) if(e) try{G.viewer?.entities?.remove(e)}catch{}
    if(Array.isArray(G.pulses)) for(const e of G.pulses) if(e) try{G.viewer?.entities?.remove(e)}catch{}
    G.markers=[];G.pulses=[];
  };

  G.__v52LocationlessMarkerGuard=true;
})(window.NG14=window.NG14||{});