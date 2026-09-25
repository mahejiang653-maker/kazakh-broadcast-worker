(function(G){
const C=Cesium;

// 1) 地名标签避开当前红点：最终区域/冲突区域标签向上偏移。
const baseLabel=G.label;
G.label=(text,lon,lat,mode)=>{
  const e=baseLabel(text,lon,lat,mode);
  if(e?.label&&mode!=='country'){
    try{e.label.pixelOffset=new C.Cartesian2(0,-22);}catch{}
  }
  return e;
};

// 2) 地图只显示当前新闻红点，不再保留历史蓝点。
G.updateOcclusion=()=>{
  if(!G.viewer||!G.markers.length)return;
  const o=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,G.viewer.camera.positionWC);
  G.markers.forEach((e,i)=>{
    const n=G.news[i],iso=G.resolveIso?.(n)||'';
    const countryOnly=G.countryOnly?.(n,iso)===true;
    if(G.overviewMode||!G.started||i!==G.current||countryOnly){
      e.show=false;
      if(G.pulses[i])G.pulses[i].show=false;
      return;
    }
    const p=e.position.getValue(G.viewer.clock.currentTime),v=!!p&&o.isPointVisible(p);
    e.show=v;
    if(G.pulses[i])G.pulses[i].show=v;
  });
};
G.restyle=()=>{
  G.markers.forEach((e,i)=>{
    const n=G.news[i],iso=G.resolveIso?.(n)||'';
    const countryOnly=G.countryOnly?.(n,iso)===true;
    const active=G.started&&!G.overviewMode&&i===G.current&&!countryOnly;
    e.point.pixelSize=active?5.5:1;
    e.point.color=active?C.Color.fromCssColorString('#ff4d4d'):C.Color.TRANSPARENT;
    e.point.outlineColor=active?C.Color.WHITE.withAlpha(.9):C.Color.TRANSPARENT;
    e.point.outlineWidth=active?1:0;
  });
  [...G.$('timeline').children].forEach((e,i)=>{
    e.classList.toggle('active',G.started&&!G.overviewMode&&i===G.current);
    e.classList.toggle('visited',G.started&&i<G.current);
  });
  G.updateOcclusion();
};

// 3) 行政区红色覆盖改成沿地球曲面整面铺开，不使用 perPositionHeight，避免中部缺口。
G.addAdminPolygon=(poly)=>{
  if(!poly?.[0])return;
  const h=G.countryHierarchy
    ?G.countryHierarchy(poly)
    :new C.PolygonHierarchy(poly[0].map(c=>C.Cartesian3.fromDegrees(+c[0],+c[1],0)));
  if(!h)return;
  const col=C.Color.fromCssColorString('#ff2b2b');
  G.localHighlightEntities.push(G.viewer.entities.add({polygon:{
    hierarchy:h,
    height:8500,
    perPositionHeight:false,
    arcType:C.ArcType.GEODESIC,
    granularity:C.Math.RADIANS_PER_DEGREE/4,
    material:col.withAlpha(.42),
    outline:false
  }}));
  const pos=G.positions(poly[0],16000);
  if(pos.length)G.localHighlightEntities.push(G.viewer.entities.add({polyline:{
    positions:pos,
    width:2.9,
    material:new C.PolylineGlowMaterialProperty({glowPower:.24,color:C.Color.fromCssColorString('#ff7575').withAlpha(.99)})
  }}));
};

// 4) 支持明确的“国家级/不再下钻”标记。中国全国新闻可直接停留中国全境。
const baseCountryOnly=G.countryOnly;
G.countryOnly=(n,iso)=>{
  if(n?.countryOnly===true||n?.preciseLocation===false)return true;
  if(/国家|country/i.test(String(n?.placeType||'')))return true;
  return baseCountryOnly?baseCountryOnly(n,iso):false;
};

// 5) 国界统一只闪 5 次，忽略旧代码传入的 4/6 次参数。
G.blinkCountryBorder=(iso,_cycles,interval=240)=>{
  iso=String(iso||'').toUpperCase();
  if(!iso)return;
  if(G.countryBlinkTimer){clearInterval(G.countryBlinkTimer);G.countryBlinkTimer=null;}
  const cycles=5;
  let tick=0;
  G.countryBlinkTimer=setInterval(()=>{
    if(iso!==G.activeIso){clearInterval(G.countryBlinkTimer);G.countryBlinkTimer=null;return;}
    tick++;
    G.setCountry(iso,true,tick%2===1);
    if(tick>=cycles*2){
      clearInterval(G.countryBlinkTimer);
      G.countryBlinkTimer=null;
      G.setCountry(iso,true,1);
    }
  },interval);
};
})(window.NG14);
