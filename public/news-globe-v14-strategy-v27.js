(function(G){
const C=Cesium;

Object.assign(G,{
  secondaryCountryIso:null,
  secondaryCountryFillEntities:[],
  secondaryCountryLabelEntity:null,
  secondaryCountryPoint:null,
  secondaryCountryPulse:null,
  secondaryBlinkTimer:null,
  interactionEffectEntities:[],
  interactionEffectStart:0
});

const prevLabel=G.label;
G.label=(text,lon,lat,mode)=>{
  const e=prevLabel(text,lon,lat,mode);
  if(!e?.label)return e;
  try{
    const n=G.news?.[G.current];
    const sec=G.dualInfo?G.dualInfo(n):null;
    const near=(a,b,c,d)=>{
      if(![a,b,c,d].every(Number.isFinite))return false;
      const k=Math.cos(((b+d)/2)*Math.PI/180);
      return Math.hypot((a-c)*k,b-d)<1.15;
    };
    const nearRed=n&&near(+lon,+lat,+n.lon,+n.lat);
    const nearBlue=sec&&near(+lon,+lat,+sec.lon,+sec.lat);
    if(nearRed||nearBlue){
      e.label.verticalOrigin=C.VerticalOrigin.BOTTOM;
      e.label.pixelOffset=new C.Cartesian2(0,String(text||'').length>=8?-20:-16);
    }
  }catch{}
  return e;
};

G.dualInfo=n=>{
  if(!n)return null;
  const iso=String(n.secondaryCountryIso3||n.targetCountryIso3||n.country2Iso3||'').toUpperCase();
  if(!iso||!G.countries.has(iso))return null;
  const c=G.countries.get(iso);
  const ctr=c?.center||G.centerOf?.(c?.feature?.geometry)||[NaN,NaN];
  const lon=Number.isFinite(+n.secondaryLon)?+n.secondaryLon:(Number.isFinite(+n.targetLon)?+n.targetLon:+ctr[0]);
  const lat=Number.isFinite(+n.secondaryLat)?+n.secondaryLat:(Number.isFinite(+n.targetLat)?+n.targetLat:+ctr[1]);
  return {
    iso,
    country:String(n.secondaryCountry||n.targetCountry||n.country2||G.countryName?.(iso)||iso),
    lon,lat,
    sourceLon:Number.isFinite(+n.sourceLon)?+n.sourceLon:+n.lon,
    sourceLat:Number.isFinite(+n.sourceLat)?+n.sourceLat:+n.lat,
    targetLon:Number.isFinite(+n.targetLon)?+n.targetLon:lon,
    targetLat:Number.isFinite(+n.targetLat)?+n.targetLat:lat
  };
};
G.isDualCountry=n=>!!G.dualInfo(n);

G.secondaryHierarchy=poly=>{
  if(!poly?.[0])return null;
  return new C.PolygonHierarchy(poly[0].map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0)));
};
G.addSecondaryFill=g=>{
  if(!g)return;
  const add=poly=>{
    const h=G.secondaryHierarchy(poly);
    if(!h)return;
    G.secondaryCountryFillEntities.push(G.viewer.entities.add({polygon:{
      hierarchy:h,height:9000,perPositionHeight:false,arcType:C.ArcType.GEODESIC,
      granularity:C.Math.RADIANS_PER_DEGREE/4,
      material:C.Color.fromCssColorString('#319cff').withAlpha(.30),outline:false
    }}));
  };
  if(g.type==='Polygon')add(g.coordinates);
  else if(g.type==='MultiPolygon')for(const p of g.coordinates||[])add(p);
};
G.setSecondaryCountry=(iso,on,phase=1)=>{
  iso=String(iso||'').toUpperCase();
  const c=G.countries.get(iso); if(!c)return;
  const width=on?(phase?1.9:1.15):.72;
  const glow=on?(phase?0.26:0.10):0;
  const alpha=on?(phase?0.98:0.60):0.30;
  for(const e of c.entities){
    e.polyline.width=width;
    e.polyline.material=on
      ?new C.PolylineGlowMaterialProperty({glowPower:glow,color:C.Color.fromCssColorString('#55b7ff').withAlpha(alpha)})
      :C.Color.fromCssColorString('#c9e8f6').withAlpha(.30);
  }
};
G.blinkSecondaryCountry=(iso,interval=240)=>{
  if(G.secondaryBlinkTimer){clearInterval(G.secondaryBlinkTimer);G.secondaryBlinkTimer=null;}
  let tick=0; const cycles=5;
  G.secondaryBlinkTimer=setInterval(()=>{
    if(iso!==G.secondaryCountryIso){clearInterval(G.secondaryBlinkTimer);G.secondaryBlinkTimer=null;return;}
    tick++; G.setSecondaryCountry(iso,true,tick%2===1);
    if(tick>=cycles*2){clearInterval(G.secondaryBlinkTimer);G.secondaryBlinkTimer=null;G.setSecondaryCountry(iso,true,1);}
  },interval);
};

G.clearInteractionEffects=()=>{
  for(const e of G.interactionEffectEntities||[])try{G.viewer.entities.remove(e)}catch{}
  G.interactionEffectEntities=[];
};
G.clearSecondaryCountry=()=>{
  if(G.secondaryBlinkTimer){clearInterval(G.secondaryBlinkTimer);G.secondaryBlinkTimer=null;}
  if(G.secondaryCountryIso)G.setSecondaryCountry(G.secondaryCountryIso,false);
  G.secondaryCountryIso=null;
  for(const e of G.secondaryCountryFillEntities||[])try{G.viewer.entities.remove(e)}catch{}
  G.secondaryCountryFillEntities=[];
  for(const key of ['secondaryCountryLabelEntity','secondaryCountryPoint','secondaryCountryPulse']){
    if(G[key])try{G.viewer.entities.remove(G[key])}catch{}
    G[key]=null;
  }
  G.clearInteractionEffects();
};
const prevClearCountry=G.clearCountry;
G.clearCountry=()=>{G.clearSecondaryCountry();prevClearCountry();};

G.showSecondaryCountry=(n,info)=>{
  const c=G.countries.get(info.iso); if(!c)return;
  G.secondaryCountryIso=info.iso;
  if(info.iso==='CHN'&&Array.isArray(G.chinaLevel1Geo?.features)){
    for(const f of G.chinaLevel1Geo.features)G.addSecondaryFill(f.geometry);
  }else G.addSecondaryFill(c.feature?.geometry);
  G.setSecondaryCountry(info.iso,true,1);
  const ctr=c.center||G.centerOf(c.feature?.geometry);
  if(ctr){
    G.secondaryCountryLabelEntity=G.label(info.country,ctr[0],ctr[1],'secondary-country');
    try{G.secondaryCountryLabelEntity.label.fillColor=C.Color.fromCssColorString('#bfe5ff');}catch{}
  }
  if(Number.isFinite(info.lon)&&Number.isFinite(info.lat)){
    G.secondaryCountryPoint=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.lon,info.lat,32000),point:{pixelSize:5.5,color:C.Color.fromCssColorString('#4bb7ff'),outlineColor:C.Color.WHITE.withAlpha(.92),outlineWidth:1}});
    G.secondaryCountryPulse=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.lon,info.lat,800),ellipse:{
      semiMajorAxis:new C.CallbackProperty(()=>15000+((Math.sin(G.pulsePhase+1.2)+1)/2)*18000,false),
      semiMinorAxis:new C.CallbackProperty(()=>15000+((Math.sin(G.pulsePhase+1.2)+1)/2)*18000,false),
      material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString('#4bb7ff').withAlpha(.07),false)),
      outline:true,outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString('#4bb7ff').withAlpha(.28),false)
    }});
  }
  G.blinkSecondaryCountry(info.iso,240);
};

G.arcPath=(aLon,aLat,bLon,bLat,peakFactor=.18)=>{
  let d=bLon-aLon;if(d>180)d-=360;if(d<-180)d+=360;
  const dist=Math.hypot(d,bLat-aLat)*111000;
  const peak=Math.min(2400000,Math.max(300000,dist*peakFactor));
  const out=[];
  for(let i=0;i<=96;i++){
    const t=i/96;let lon=aLon+d*t;if(lon>180)lon-=360;if(lon<-180)lon+=360;
    out.push(C.Cartesian3.fromDegrees(lon,aLat+(bLat-aLat)*t,peak*Math.sin(Math.PI*t)+60000));
  }
  return out;
};
G.showMissileEffect=(n,info)=>{
  G.clearInteractionEffects();
  const path=G.arcPath(info.sourceLon,info.sourceLat,info.targetLon,info.targetLat,.20);
  const start=performance.now(),duration=3300;
  G.interactionEffectEntities.push(G.viewer.entities.add({polyline:{positions:path,width:2.5,material:new C.PolylineGlowMaterialProperty({glowPower:.22,color:C.Color.fromCssColorString('#ff6b35').withAlpha(.72)})}}));
  G.interactionEffectEntities.push(G.viewer.entities.add({position:new C.CallbackProperty(()=>{
    const t=Math.min(1,((performance.now()-start)%duration)/duration);return path[Math.min(path.length-1,Math.floor(t*(path.length-1)))];
  },false),point:{pixelSize:7,color:C.Color.fromCssColorString('#ffd36b'),outlineColor:C.Color.fromCssColorString('#ff4d2e'),outlineWidth:2}}));
  G.interactionEffectEntities.push(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.targetLon,info.targetLat,1200),ellipse:{
    semiMajorAxis:new C.CallbackProperty(()=>22000+((Math.sin(G.pulsePhase*1.7)+1)/2)*42000,false),semiMinorAxis:new C.CallbackProperty(()=>22000+((Math.sin(G.pulsePhase*1.7)+1)/2)*42000,false),
    material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString('#ff6b35').withAlpha(.08),false)),outline:true,
    outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString('#ffb347').withAlpha(.55),false)
  }}));
};
G.showDroneEffect=(n,info)=>{
  G.clearInteractionEffects();
  const path=G.arcPath(info.sourceLon,info.sourceLat,info.targetLon,info.targetLat,.10);
  const start=performance.now(),duration=5200;
  G.interactionEffectEntities.push(G.viewer.entities.add({polyline:{positions:path,width:2.2,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#d9f3ff').withAlpha(.9),gapColor:C.Color.fromCssColorString('#4bb7ff').withAlpha(.12),dashLength:18})}}));
  G.interactionEffectEntities.push(G.viewer.entities.add({position:new C.CallbackProperty(()=>{
    const t=Math.min(1,((performance.now()-start)%duration)/duration);return path[Math.min(path.length-1,Math.floor(t*(path.length-1)))];
  },false),point:{pixelSize:6.5,color:C.Color.fromCssColorString('#d9f3ff'),outlineColor:C.Color.fromCssColorString('#4bb7ff'),outlineWidth:2}}));
};
G.borderFightLine=n=>{
  if(Array.isArray(n.borderLine)&&n.borderLine.length>=2)return n.borderLine;
  const p=n.borderZoneCenter||[n.lon,n.lat];const lon=+p[0],lat=+p[1];
  if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
  return [[lon-.55,lat-.08],[lon-.25,lat+.05],[lon,lat],[lon+.25,lat-.05],[lon+.55,lat+.08]];
};
G.showBorderConflictEffect=n=>{
  G.clearInteractionEffects();
  const line=G.borderFightLine(n);if(!line)return;const pos=G.positions(line,26000);if(!pos.length)return;
  G.interactionEffectEntities.push(G.viewer.entities.add({polyline:{positions:pos,width:new C.CallbackProperty(()=>2.2+((Math.sin(G.pulsePhase*2.1)+1)/2)*2.6,false),material:new C.PolylineGlowMaterialProperty({glowPower:.25,color:new C.CallbackProperty(()=>C.Color.fromCssColorString('#ff4f4f').withAlpha(.55+((Math.sin(G.pulsePhase*2.1)+1)/2)*.35),false)})}}));
  G.interactionEffectEntities.push(G.viewer.entities.add({polyline:{positions:pos,width:new C.CallbackProperty(()=>1.8+((Math.sin(G.pulsePhase*2.1+Math.PI)+1)/2)*2.2,false),material:new C.PolylineGlowMaterialProperty({glowPower:.22,color:new C.CallbackProperty(()=>C.Color.fromCssColorString('#45b8ff').withAlpha(.45+((Math.sin(G.pulsePhase*2.1+Math.PI)+1)/2)*.35),false)})}}));
  for(const idx of [1,2,3]){const p=line[idx];G.interactionEffectEntities.push(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+p[0],+p[1],1800),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>12000+((Math.sin(G.pulsePhase*2.4+idx)+1)/2)*26000,false),semiMinorAxis:new C.CallbackProperty(()=>12000+((Math.sin(G.pulsePhase*2.4+idx)+1)/2)*26000,false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString('#ffb347').withAlpha(.05+((Math.sin(G.pulsePhase*2.4+idx)+1)/2)*.09),false)),outline:true,outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString('#ff7b4d').withAlpha(.35+((Math.sin(G.pulsePhase*2.4+idx)+1)/2)*.4),false)}}));}
};
G.interactionType=n=>{
  const s=[n?.attackType,n?.interactionType,n?.title,n?.summary].join(' ');
  if(/无人机|drone|uav/i.test(s))return'drone';
  if(/导弹|missile|rocket/i.test(s))return'missile';
  if(n?.borderConflict===true||/border-conflict|边境交火|边界交火/i.test(s)||(n?.conflict&&/边境|边界|border|frontier/i.test(String(n?.placeType||''))))return'border';
  return'';
};
G.showInteractionEffect=(n,info)=>{const t=G.interactionType(n);if(t==='missile')G.showMissileEffect(n,info);else if(t==='drone')G.showDroneEffect(n,info);else if(t==='border')G.showBorderConflictEffect(n);};
G.dualSphere=(isoA,isoB)=>{const pts=[];for(const iso of [isoA,isoB]){const c=G.countries.get(iso);if(!c?.feature?.geometry)continue;for(const p of G.collect(c.feature.geometry,[]))pts.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));}return pts.length?C.BoundingSphere.fromPoints(pts):null;};

const singleCountryStage=G.countryStage;
G.countryStage=async(n,iso,serial)=>{
  const info=G.dualInfo(n);if(!info)return singleCountryStage(n,iso,serial);
  const primaryIso=String(n.sourceCountryIso3||iso||'').toUpperCase()||iso;
  const primaryCountry=G.countries.get(primaryIso);if(!primaryCountry)return singleCountryStage(n,iso,serial);
  G.flashCountry(primaryIso,n);G.showSecondaryCountry(n,info);G.blinkCountryBorder?.(primaryIso,5,240);
  const sp=G.dualSphere(primaryIso,info.iso);
  if(sp){const range=Math.max(2200000,Math.min(26000000,sp.radius*2.55));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-90),range),duration:1.45,complete:r,cancel:r}));}
  if(serial!==G.navSerial)return false;G.showInteractionEffect(n,info);G.updateOcclusion?.();return G.wait(G.interactionType(n)?3200:2200,serial);
};
const baseCountryOnly=G.countryOnly;
G.countryOnly=(n,iso)=>{if(n?.dualCountryOnly===true)return true;if(G.isDualCountry(n)&&G.interactionType(n)&&n?.continueToArea!==true)return true;return baseCountryOnly(n,iso);};
const baseStoryDuration=G.storyDuration;
G.storyDuration=n=>baseStoryDuration(n)+(G.isDualCountry(n)?(G.interactionType(n)?5000:2800):0);

})(window.NG14);
