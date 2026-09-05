(function(G){
const C=Cesium,$=G.$;
G.relationEntities=[];G.relationTimers=[];G.secondaryCountryIso='';

// V15: final-place labels must never sit on top of the red/blue location dot.
const v26Label=G.label;
G.label=(text,lon,lat,mode)=>{
  const e=v26Label(text,lon,lat,mode);
  if(e?.label&&mode!=='country'){
    try{
      e.label.pixelOffset=new C.Cartesian2(0,-32);
      e.label.verticalOrigin=C.VerticalOrigin.BOTTOM;
      e.label.backgroundColor=C.Color.fromCssColorString('#04101b').withAlpha(.48);
      e.label.padding=new C.Cartesian2(11,7);
    }catch{}
  }
  return e;
};

G.keepRelation=e=>{if(e)G.relationEntities.push(e);return e};
G.clearRelation=()=>{
  for(const t of G.relationTimers){try{clearTimeout(t);clearInterval(t)}catch{}}
  G.relationTimers=[];
  for(const e of G.relationEntities){try{G.viewer?.entities.remove(e)}catch{}}
  G.relationEntities=[];
  if(G.secondaryCountryIso){
    const c=G.countries.get(G.secondaryCountryIso);
    if(c)for(const e of c.entities||[]){
      try{e.polyline.width=.72;e.polyline.material=C.Color.fromCssColorString('#c9e8f6').withAlpha(.30)}catch{}
    }
  }
  G.secondaryCountryIso='';
};

function stripCountrySuffix(s){return String(s||'').replace(/中华人民共和国/g,'中国').replace(/共和国|王国|联邦$/g,'').trim()}
function aliasesFor(iso){
  const out=new Set();
  const z=G.countryName?.(iso);if(z){out.add(z);out.add(stripCountrySuffix(z))}
  const c=G.countries.get(iso);if(c?.name){out.add(String(c.name));out.add(stripCountrySuffix(c.name))}
  const manual={CHN:['中国','中华人民共和国'],USA:['美国'],RUS:['俄罗斯'],UKR:['乌克兰'],ISR:['以色列'],IRN:['伊朗'],LBN:['黎巴嫩'],IND:['印度'],PAK:['巴基斯坦'],JPN:['日本'],KOR:['韩国'],PRK:['朝鲜'],SGP:['新加坡'],AUS:['澳大利亚'],NZL:['新西兰'],GBR:['英国'],FRA:['法国'],DEU:['德国'],CAN:['加拿大'],YEM:['也门'],OMN:['阿曼'],SAU:['沙特阿拉伯','沙特'],TUR:['土耳其'],SYR:['叙利亚'],IRQ:['伊拉克'],ARE:['阿联酋'],QAT:['卡塔尔'],EGY:['埃及']};
  for(const a of manual[iso]||[])out.add(a);
  return [...out].filter(x=>x&&((/[\u3400-\u9fff]/.test(x)&&x.length>=2)||(!/[\u3400-\u9fff]/.test(x)&&x.length>=4)));
}
function countryMentions(n){
  const text=[n?.title||'',n?.summary||'',n?.country||'',n?.region||''].join('｜');
  const list=[];
  for(const [iso] of G.countries){
    let best=null;
    for(const alias of aliasesFor(iso)){
      const i=text.indexOf(alias);
      if(i>=0&&(!best||i<best.pos||i===best.pos&&alias.length>best.alias.length))best={iso,alias,pos:i};
    }
    if(best)list.push(best);
  }
  return list.sort((a,b)=>a.pos-b.pos);
}
function coordForIso(iso,n){
  if(String(iso||'')===String(G.resolveIso?.(n)||''))return[+n.lon,+n.lat];
  const c=G.countries.get(String(iso||''));
  if(Array.isArray(c?.center)&&c.center.every(Number.isFinite))return c.center;
  if(Array.isArray(c?.bbox)){const[w,s,e,no]=c.bbox;return[(w+e)/2,(s+no)/2]}
  return[NaN,NaN];
}
function endpoint(raw,isoFallback,n){
  raw=raw&&typeof raw==='object'?raw:{};
  let iso=String(raw.countryIso3||raw.iso3||raw.iso||isoFallback||'').toUpperCase();
  const country=String(raw.country||raw.name||'').trim();
  if(!iso&&country){for(const [k] of G.countries)if(aliasesFor(k).some(a=>country.includes(a)||a.includes(country))){iso=k;break}}
  let lon=Number(raw.lon??raw.longitude),lat=Number(raw.lat??raw.latitude);const explicit=Number.isFinite(lon)&&Number.isFinite(lat);
  if(!explicit){[lon,lat]=coordForIso(iso,n)}
  return{iso3:iso,country:country||G.countryName?.(iso)||iso,location:String(raw.location||raw.place||'').trim(),lon,lat,explicitCoord:explicit};
}
function relationType(n,count){
  const rel=n?.relation&&typeof n.relation==='object'?n.relation:{};
  const ex=String(n?.eventType||n?.relationType||rel.type||'').toLowerCase();
  const text=[ex,n?.title||'',n?.summary||'',n?.placeType||''].join(' ');
  if(/drone|uav|无人机/.test(text)&&count>1)return'drone';
  if(/missile|ballistic|cruise missile|导弹|巡航弹/.test(text)&&count>1)return'missile';
  if(count>1&&((/边境|边界|国界|border|frontier/.test(text)&&/交火|冲突|炮击|战斗|clash|fire|conflict/.test(text))||/border[_\s-]*conflict/.test(ex)))return'border_conflict';
  if(/dual|bilateral|双国|两国/.test(ex)||count>1)return'dual_country';
  return'';
}
function directionalPair(n,mentions,type){
  if(!['missile','drone'].includes(type)||mentions.length<2)return null;
  const text=[n?.title||'',n?.summary||''].join('。');
  for(const a of mentions)for(const b of mentions){if(a.iso===b.iso)continue;
    const A=a.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),B=b.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`${A}.{0,8}(?:向|对|朝|袭击|攻击).{0,8}${B}`).test(text))return[a.iso,b.iso];
    if(new RegExp(`${A}.{0,5}(?:遭|受到).{0,8}${B}`).test(text))return[b.iso,a.iso];
  }
  return[mentions[0].iso,mentions[1].iso];
}
G.relationFor=(n,mainIso)=>{
  const rel=n?.relation&&typeof n.relation==='object'?n.relation:{};
  const structuredPrimary=rel.primary||rel.source||n?.source||null;
  const structuredSecondary=rel.secondary||rel.target||n?.target||null;
  const mentions=countryMentions(n);
  let pIso=String(structuredPrimary?.countryIso3||structuredPrimary?.iso3||n?.primaryCountryIso3||n?.sourceCountryIso3||mainIso||'').toUpperCase();
  let sIso=String(structuredSecondary?.countryIso3||structuredSecondary?.iso3||n?.secondaryCountryIso3||n?.targetCountryIso3||'').toUpperCase();
  if(!sIso){const m=mentions.find(x=>x.iso!==pIso);if(m)sIso=m.iso}
  let type=relationType(n,new Set([pIso,sIso,...mentions.map(x=>x.iso)].filter(Boolean)).size);
  const dir=directionalPair(n,mentions,type);
  if(dir&&!structuredPrimary&&!structuredSecondary&&!n?.primaryCountryIso3&&!n?.secondaryCountryIso3){pIso=dir[0];sIso=dir[1]}
  if(!pIso&&mentions[0])pIso=mentions[0].iso;
  if(!sIso){const m=mentions.find(x=>x.iso!==pIso);if(m)sIso=m.iso}
  if(!type||!sIso||sIso===pIso)return null;
  const pRaw=structuredPrimary||{countryIso3:pIso,country:n?.primaryCountry||n?.sourceCountry||''};
  const sRaw=structuredSecondary||{countryIso3:sIso,country:n?.secondaryCountry||n?.targetCountry||''};
  const primary=endpoint(pRaw,pIso,n),secondary=endpoint(sRaw,sIso,n);
  const actualIso=String(mainIso||'');
  if(!primary.explicitCoord&&primary.iso3===actualIso){primary.lon=+n.lon;primary.lat=+n.lat}
  if(!secondary.explicitCoord&&secondary.iso3===actualIso){secondary.lon=+n.lon;secondary.lat=+n.lat}
  return{type,primary,secondary,borderGeometry:rel.borderGeometry||n?.borderGeometry||n?.borderConflictGeometry||null};
};

function addSecondaryFill(g){
  if(!g)return;const add=poly=>{const h=G.countryHierarchy?.(poly);if(h)G.keepRelation(G.viewer.entities.add({polygon:{hierarchy:h,height:9000,perPositionHeight:false,arcType:C.ArcType.GEODESIC,granularity:C.Math.RADIANS_PER_DEGREE/4,material:C.Color.fromCssColorString('#238cff').withAlpha(.31),outline:false}}))};
  if(g.type==='Polygon')add(g.coordinates);else if(g.type==='MultiPolygon')for(const p of g.coordinates||[])add(p);
}
G.showSecondaryCountry=(ep)=>{
  const iso=String(ep?.iso3||'').toUpperCase(),c=G.countries.get(iso);if(!c)return;
  G.secondaryCountryIso=iso;addSecondaryFill(c.feature?.geometry);
  for(const e of c.entities||[]){e.polyline.width=1.9;e.polyline.material=new C.PolylineGlowMaterialProperty({glowPower:.26,color:C.Color.fromCssColorString('#55b8ff').withAlpha(.98)})}
  const p=c.center||coordForIso(iso,{});if(p?.every(Number.isFinite)){const lab=G.keepRelation(G.label(ep.country||G.countryName(iso),p[0],p[1],'country'));if(lab?.label){lab.label.fillColor=C.Color.fromCssColorString('#cfeeff');lab.label.backgroundColor=C.Color.fromCssColorString('#05213a').withAlpha(.46)}}
};
function relationSphere(rel){const arr=[rel?.primary?.iso3,rel?.secondary?.iso3].map(i=>G.countries.get(i)?.sphere).filter(Boolean);if(!arr.length)return null;let s=C.BoundingSphere.clone(arr[0]);for(let i=1;i<arr.length;i++)s=C.BoundingSphere.union(s,arr[i],new C.BoundingSphere());return s}
G.relationCountryStage=async(n,rel,serial)=>{
  G.clearCountry();G.clearRelation();
  if(rel.primary?.iso3){G.flashCountry(rel.primary.iso3,{...n,country:rel.primary.country});G.blinkCountryBorder?.(rel.primary.iso3,5,220)}
  G.showSecondaryCountry(rel.secondary);
  const sp=relationSphere(rel);if(sp){const range=Math.max(2200000,Math.min(30000000,sp.radius*3.0));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-90),range),duration:1.25,complete:r,cancel:r}))}
  if(serial!==G.navSerial)return false;G.updateOcclusion?.();return G.wait(900,serial);
};
G.relationDot=(ep,role='secondary')=>{if(!ep||!Number.isFinite(+ep.lon)||!Number.isFinite(+ep.lat))return null;const sec=role==='secondary';return G.keepRelation(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+ep.lon,+ep.lat,36000),point:{pixelSize:sec?5:6,color:C.Color.fromCssColorString(sec?'#4aa8ff':'#ff4d4d'),outlineColor:C.Color.WHITE.withAlpha(.92),outlineWidth:1,disableDepthTestDistance:0}}))};
function arcPositions(a,b,kind){let x=+a.lon,y=+a.lat,d=+b.lon-x;if(d>180)d-=360;if(d<-180)d+=360;const dist=Math.hypot(d,+b.lat-y)*111000,peak=kind==='drone'?Math.min(650000,Math.max(90000,dist*.07)):Math.min(2100000,Math.max(300000,dist*.17)),out=[];for(let i=0;i<=96;i++){const t=i/96;let lon=x+d*t;if(lon>180)lon-=360;if(lon<-180)lon+=360;out.push(C.Cartesian3.fromDegrees(lon,y+(+b.lat-y)*t,peak*Math.sin(Math.PI*t)+50000))}return out}
function flyArc(points,serial){if(!points.length)return Promise.resolve();const sp=C.BoundingSphere.fromPoints(points),range=Math.max(1200000,Math.min(26000000,(sp.radius||500000)*2.85));return new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-90),range),duration:1.1,complete:()=>{if(serial===G.navSerial)G.updateOcclusion?.();r()},cancel:r}))}
G.flightEffect=(rel,kind)=>{
  if(![rel.primary.lon,rel.primary.lat,rel.secondary.lon,rel.secondary.lat].every(Number.isFinite))return 0;
  const pts=arcPositions(rel.primary,rel.secondary,kind),start=performance.now(),duration=kind==='drone'?4400:2600,tail=kind==='drone'?10:18,col=C.Color.fromCssColorString(kind==='drone'?'#7ed8ff':'#ff9a52');
  G.relationDot(rel.primary,'primary');G.relationDot(rel.secondary,'secondary');
  G.keepRelation(G.viewer.entities.add({polyline:{positions:pts,width:1.25,material:new C.PolylineGlowMaterialProperty({glowPower:.16,color:col.withAlpha(.36)})}}));
  const progress=()=>Math.max(0,Math.min(1,(performance.now()-start)/duration)),idx=()=>Math.min(pts.length-1,Math.floor(progress()*(pts.length-1)));
  G.keepRelation(G.viewer.entities.add({position:new C.CallbackProperty(()=>pts[idx()],false),label:{show:new C.CallbackProperty(()=>progress()<1,false),text:kind==='drone'?'✣':'➤',font:'22px sans-serif',fillColor:C.Color.WHITE,outlineColor:col.withAlpha(.98),outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
  G.keepRelation(G.viewer.entities.add({polyline:{positions:new C.CallbackProperty(()=>{if(progress()>=1)return[];const i=idx();return pts.slice(Math.max(0,i-tail),i+1)},false),width:kind==='drone'?2:3,material:new C.PolylineGlowMaterialProperty({glowPower:kind==='drone'?.22:.32,color:col.withAlpha(.96)})}}));
  const pos=C.Cartesian3.fromDegrees(+rel.secondary.lon,+rel.secondary.lat,2500);
  G.keepRelation(G.viewer.entities.add({position:pos,ellipse:{semiMajorAxis:new C.CallbackProperty(()=>{const t=(performance.now()-start-duration)/900;return t>0&&t<1?18000+t*75000:1},false),semiMinorAxis:new C.CallbackProperty(()=>{const t=(performance.now()-start-duration)/900;return t>0&&t<1?18000+t*75000:1},false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>{const t=(performance.now()-start-duration)/900;return t>0&&t<1?C.Color.fromCssColorString(kind==='drone'?'#5cc9ff':'#ff6b4a').withAlpha(.18*(1-t)):C.Color.TRANSPARENT},false)),outline:true,outlineColor:new C.CallbackProperty(()=>{const t=(performance.now()-start-duration)/900;return t>0&&t<1?C.Color.fromCssColorString(kind==='drone'?'#8edcff':'#ffd0a3').withAlpha(.9*(1-t)):C.Color.TRANSPARENT},false)}}));
  return duration;
};
function lineFrom(g){if(!g)return null;if(g.type==='Feature')g=g.geometry;if(g?.type==='LineString')return g.coordinates;if(g?.type==='MultiLineString')return g.coordinates?.[0];return null}
function fallbackBorder(n,rel){const lon=+n.lon,lat=+n.lat;if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;const a=coordForIso(rel.primary.iso3,n),b=coordForIso(rel.secondary.iso3,n);let dx=(b[0]??lon+.4)-(a[0]??lon-.4),dy=(b[1]??lat)-(a[1]??lat),len=Math.hypot(dx*Math.cos(lat*Math.PI/180),dy)||1;dx/=len;dy/=len;const px=-dy,py=dx,out=[];for(let i=-5;i<=5;i++){const t=i/5;out.push([lon+px*.75*t/Math.max(.25,Math.cos(lat*Math.PI/180)),lat+py*.75*t])}return out}
function borderSide(n,rel,role){const lon=+n.lon,lat=+n.lat,t=coordForIso(role==='secondary'?rel.secondary.iso3:rel.primary.iso3,n);let dx=t[0]-lon;if(dx>180)dx-=360;if(dx<-180)dx+=360;const dy=t[1]-lat,len=Math.hypot(dx*Math.cos(lat*Math.PI/180),dy)||1,d=.50;return{lon:lon+dx/len*d,lat:lat+dy/len*d}}
G.borderEffect=(n,rel)=>{
  const line=lineFrom(rel.borderGeometry)||lineFrom(n?.conflictGeometry)||lineFrom(n?.focusGeometry)||fallbackBorder(n,rel);if(!line?.length)return 0;const pos=G.positions(line,22000);if(!pos.length)return 0;
  G.relationDot(rel.primary.explicitCoord?rel.primary:borderSide(n,rel,'primary'),'primary');G.relationDot(rel.secondary.explicitCoord?rel.secondary:borderSide(n,rel,'secondary'),'secondary');
  G.keepRelation(G.viewer.entities.add({polyline:{positions:pos,width:5.2,material:new C.PolylineGlowMaterialProperty({glowPower:.30,color:C.Color.WHITE.withAlpha(.62)})}}));
  G.keepRelation(G.viewer.entities.add({polyline:{positions:pos,width:2,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ff6a6a').withAlpha(.94),gapColor:C.Color.fromCssColorString('#55b8ff').withAlpha(.76),dashLength:13})}}));
  const sample=[];for(let i=1;i<Math.min(line.length-1,10);i+=2)sample.push(line[i]);sample.forEach((p,i)=>G.keepRelation(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+p[0],+p[1],30000),point:{pixelSize:new C.CallbackProperty(()=>2+((Math.sin(G.pulsePhase*4+i*.9)+1)/2)*7,false),color:new C.CallbackProperty(()=>i%2?C.Color.fromCssColorString('#72c9ff'):C.Color.fromCssColorString('#ffcf77'),false),outlineColor:C.Color.WHITE.withAlpha(.8),outlineWidth:.6,disableDepthTestDistance:Number.POSITIVE_INFINITY}})));
  return 3600;
};
G.relationStage=async(n,rel,serial)=>{
  if(rel.type==='missile'||rel.type==='drone'){
    const pts=arcPositions(rel.primary,rel.secondary,rel.type);await flyArc(pts,serial);if(serial!==G.navSerial)return false;const ms=G.flightEffect(rel,rel.type);return G.wait(Math.min(ms+650,5400),serial);
  }
  if(rel.type==='border_conflict'){
    await new Promise(r=>G.flyPoint({...n,height:1150000},serial,r));if(serial!==G.navSerial)return false;const ms=G.borderEffect(n,rel);return G.wait(Math.min(ms+450,4800),serial);
  }
  G.relationDot(rel.secondary,'secondary');return G.wait(1200,serial);
};

const baseStoryUI=G.storyUI;
G.storyUI=(n,iso)=>{baseStoryUI(n,iso);const rel=G.relationFor(n,iso);if(rel){const a=rel.primary.country||G.countryName(rel.primary.iso3),b=rel.secondary.country||G.countryName(rel.secondary.iso3),arrow=['missile','drone'].includes(rel.type)?' → ':rel.type==='border_conflict'?' ↔ ':' + ';$('country').textContent=a+arrow+b}};

const baseRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
  const rel=G.relationFor(n,iso);if(!rel)return baseRun(n,iso,serial);
  const ok=await G.relationCountryStage(n,rel,serial);if(!ok||serial!==G.navSerial)return;
  const rok=await G.relationStage(n,rel,serial);if(!rok||serial!==G.navSerial)return;
  const steps=G.adminSteps(n),fa=G.finalAdmin(n);if(fa){const k=fa.location+'|'+fa.placeType;if(!steps.some(x=>x.location+'|'+x.placeType===k))steps.push(fa)}
  if(G.countryOnly(n,iso)&&!steps.length)return;
  G.clearRelation();G.clearCountry();let had=false;
  for(const st of steps){if(serial!==G.navSerial)return;const a=await G.flashAdmin(st,iso,serial,3000);if(!a)return;had=true}
  if(serial!==G.navSerial)return;
  if(!G.isAdminType(n.placeType)||G.explicitFocus(n)){await G.flashArea(n,iso,serial);if(!G.localHighlightEntities.length&&!had&&iso){G.flashCountry(iso,n);G.blinkCountryBorder?.(iso,5,220)}}
};
const baseDuration=G.storyDuration;
G.storyDuration=n=>baseDuration(n)+(G.relationFor(n,G.resolveIso(n))?5200:0);

const baseFocus=G.focus;
G.focus=(i,countryFirst=true)=>{G.clearRelation();return baseFocus(i,countryFirst)};
const baseOverview=G.overview;
G.overview=()=>{G.clearRelation();return baseOverview()};
const baseClearScene=G.clearScene;
G.clearScene=()=>{G.clearRelation();return baseClearScene()};
})(window.NG14);
