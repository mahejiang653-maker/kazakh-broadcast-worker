(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
const num=v=>{v=+v;return Number.isFinite(v)?v:NaN};
const valid=(a,b)=>Number.isFinite(num(a))&&Number.isFinite(num(b));
const currentNews=()=>G.news?.[G.current]||null;
const storyText=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);
const institution=n=>{if(warLike(n))return false;const t=String(n?.placeType||''),s=String(n?.location||'');return /中央部门|政府机构|政府部门|部委|机构|单位|学校|大学|医院|使馆|大使馆|领馆|领事馆|法院|议会|委员会|办公室|部$|厅$|局$/.test(t)||/教育部|外交部|国防部|商务部|委员会|大学|医院|大使馆|领事馆/.test(s)};
const strictRegion=n=>/生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|地带|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区|约旦河西岸|加沙地带|顿巴斯|戈兰高地|克里米亚/i.test(storyText(n));
const localFacilityRegion=n=>/中试生产线|中试提取线|试验线|生产线/.test(storyText(n));
const enterpriseHQ=n=>/企业总部区域|总部所在区域|总部区域|总部所在地区/.test(storyText(n));

G.v34Entities=[];
const add=e=>{if(e)G.v34Entities.push(e);return e};
const clear34=()=>{for(const e of G.v34Entities||[])try{G.viewer.entities.remove(e)}catch{}G.v34Entities=[]};
const prevClearLocal=G.clearLocal;G.clearLocal=()=>{clear34();if(typeof prevClearLocal==='function')prevClearLocal()};
const prevClearCountry=G.clearCountry;G.clearCountry=()=>{clear34();if(typeof prevClearCountry==='function')prevClearCountry()};
const prevClearInteraction=G.clearInteractionEffects;G.clearInteractionEffects=()=>{clear34();if(typeof prevClearInteraction==='function')prevClearInteraction()};

function zhOnly(input){
 let s=String(input||'').trim();
 s=s.replace(/[（(][^（）()]*[A-Za-z][^（）()]*[）)]/g,'');
 s=s.replace(/[A-Za-z][A-Za-z0-9._\-/ ]*/g,'');
 s=s.replace(/[·•]+/g,'·').replace(/\s+/g,'').replace(/[—–-]{2,}/g,'—');
 s=s.replace(/^[-—·]+|[-—·]+$/g,'');
 return s;
}
function cleanMapLabel(n,kind='event'){
 const loc=zhOnly(n?.location);
 const focus=zhOnly(n?.focusLabel);
 if(/教育部/.test(String(n?.location||'')))return'教育部';
 if(/纳坦兹/.test(loc||focus))return'纳坦兹附近核设施';
 if(/哈尔克岛/.test(loc||focus))return'哈尔克岛附近海域';
 if(/乌克兰国家安全局/.test(loc)||/基辅总部/.test(loc))return'乌克兰国家安全局基辅总部';
 if(/石河子/.test(loc)&&kind==='admin')return'石河子市';
 let s=kind==='region'?(focus||loc):(loc||focus);
 s=s.replace(/所在区域|所在地区|目标区域|目标区|打击区域|打击区/g,'');
 return s||'新闻地点';
}
function dynamicOffset(lon,lat){
 const pos=C.Cartesian3.fromDegrees(+lon,+lat,52000);
 return new C.CallbackProperty(()=>{
   try{
     const fn=C.SceneTransforms?.worldToWindowCoordinates||C.SceneTransforms?.wgs84ToWindowCoordinates;
     const p=fn?.(G.viewer.scene,pos),h=G.viewer.scene.canvas.clientHeight||400;
     if(p&&Number.isFinite(p.y)){
       if(p.y<72)return new C.Cartesian2(0,34);
       if(p.y>h-58)return new C.Cartesian2(0,-38);
     }
   }catch{}
   return new C.Cartesian2(0,-32);
 },false);
}
function mapLabel(label,lon,lat){
 if(!label||!valid(lon,lat))return null;
 const txt=zhOnly(label)||'新闻地点';
 return add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,52000),label:{text:txt,font:'14px "Microsoft YaHei",sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.fromCssColorString('#160307').withAlpha(.96),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#2a060b').withAlpha(.72),backgroundPadding:new C.Cartesian2(10,6),horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER,pixelOffset:dynamicOffset(lon,lat),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
}
function brightPulse(lon,lat,color='#ff3f43',base=12500,span=24000){
 if(!valid(lon,lat))return null;
 return add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,700),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>base+((Math.sin((G.pulsePhase||0)*2.35)+1)/2)*span,false),semiMinorAxis:new C.CallbackProperty(()=>base+((Math.sin((G.pulsePhase||0)*2.35)+1)/2)*span,false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString(color).withAlpha(.13),false)),outline:true,outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString('#ff676b').withAlpha(.72),false)}}));
}
function brightPoint(lon,lat,label){
 if(!valid(lon,lat))return;
 add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,31000),point:{pixelSize:9.5,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2.1,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
 brightPulse(lon,lat,'#ff3038',10500,22500);
 if(label)mapLabel(label,lon,lat);
}

/* Make every ordinary active story point brighter too. */
const prevBuildScene=G.buildScene;
G.buildScene=()=>{
 if(typeof prevBuildScene==='function')prevBuildScene();
 for(let i=0;i<(G.pulses||[]).length;i++){
   const e=G.pulses[i]; if(!e?.ellipse)continue;
   e.ellipse.semiMajorAxis=new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?15500+((Math.sin((G.pulsePhase||0)*2.15)+1)/2)*26000:1,false);
   e.ellipse.semiMinorAxis=new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?15500+((Math.sin((G.pulsePhase||0)*2.15)+1)/2)*26000:1,false);
   e.ellipse.material=new C.ColorMaterialProperty(new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?C.Color.fromCssColorString('#ff343a').withAlpha(.14):C.Color.TRANSPARENT,false));
   e.ellipse.outlineColor=new C.CallbackProperty(()=>i===G.current&&G.started&&!G.overviewMode?C.Color.fromCssColorString('#ff676b').withAlpha(.68):C.Color.TRANSPARENT,false);
 }
};
const prevRestyle=G.restyle;
G.restyle=()=>{if(typeof prevRestyle==='function')prevRestyle();for(let i=0;i<(G.markers||[]).length;i++){const e=G.markers[i];if(i===G.current&&G.started&&!G.overviewMode&&e?.point){e.point.pixelSize=8.5;e.point.color=C.Color.fromCssColorString('#ff3038');e.point.outlineColor=C.Color.WHITE;e.point.outlineWidth=1.9}}};

const svg=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
const ICON={
 carrier:svg('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="78" viewBox="0 0 210 78"><defs><linearGradient id="h" x1="0" x2="1"><stop stop-color="#738891"/><stop offset="1" stop-color="#25343a"/></linearGradient><linearGradient id="d" x1="0" x2="1"><stop stop-color="#dbe3e6"/><stop offset=".52" stop-color="#8f9ca1"/><stop offset="1" stop-color="#526066"/></linearGradient></defs><path d="M9 40 37 10h132l32 24-18 35H31z" fill="url(#h)" stroke="#ecf7fb" stroke-width="2"/><path d="M24 35 49 17h111l28 19-15 25H37z" fill="url(#d)" stroke="#f7fbfc" stroke-width="1.3"/><path d="M50 39h119" stroke="#fff" stroke-width="1.3" opacity=".82"/><path d="M98 19v42" stroke="#f7fbfc" stroke-width="1.1" stroke-dasharray="5 4" opacity=".7"/><rect x="146" y="18" width="20" height="18" rx="2" fill="#3a4d56" stroke="#eef8fb" stroke-width="1.1"/><rect x="157" y="9" width="3" height="10" fill="#eef8fb"/><g fill="#2d424b"><path d="m58 27 13 4-13 4-9-4z"/><path d="m80 47 13 4-13 4-9-4z"/><path d="m111 27 13 4-13 4-9-4z"/><path d="m131 47 13 4-13 4-9-4z"/></g></svg>'),
 missile:svg('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="46" viewBox="0 0 180 46"><defs><linearGradient id="b" x1="0" x2="1"><stop stop-color="#626c72"/><stop offset=".38" stop-color="#b8c0c4"/><stop offset=".76" stop-color="#eef2f3"/><stop offset="1" stop-color="#fafcfc"/></linearGradient><linearGradient id="f" x1="0" x2="1"><stop stop-color="#ff3215"/><stop offset=".48" stop-color="#ff8c24"/><stop offset="1" stop-color="#fff26d"/></linearGradient></defs><path d="M34 23 52 13h86l31 10-31 10H52z" fill="url(#b)" stroke="#38474e" stroke-width="1.7"/><path d="M63 14 48 3l5 15M63 32 48 43l5-15M132 14l18-10-7 14M132 32l18 10-7-14" fill="#59666c" stroke="#35434a" stroke-width="1"/><path d="M34 23 19 15 3 23l16 8z" fill="url(#f)"/><circle cx="112" cy="23" r="3" fill="#243037"/></svg>'),
 drone:svg('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="72" viewBox="0 0 190 72"><defs><linearGradient id="d" x1="0" x2="1"><stop stop-color="#4b5960"/><stop offset=".45" stop-color="#adb8bd"/><stop offset=".82" stop-color="#e7ecee"/><stop offset="1" stop-color="#f8fbfc"/></linearGradient></defs><path d="M26 36 82 28 108 8l7 22 58 6-58 6-7 22-26-20z" fill="url(#d)" stroke="#34454d" stroke-width="1.8"/><path d="M81 29 105 36 81 43M118 31l31 5-31 5" fill="none" stroke="#64747b" stroke-width="1.5"/><path d="M26 36 10 27v18z" fill="#53636a"/><circle cx="111" cy="36" r="5" fill="#1d2b31"/></svg>'),
 blast:svg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="#fff37a"/><stop offset=".48" stop-color="#ff9a24"/><stop offset=".72" stop-color="#ff3b1f" stop-opacity=".92"/><stop offset="1" stop-color="#ff2a16" stop-opacity="0"/></radialGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g)"/><g fill="#ffd34d"><path d="m60 2 8 35 20-29-8 37 35-16-29 26 32 5-35 6 28 26-36-17 9 38-21-31-7 36-5-37-25 29 13-36-37 13 31-23-34-9 36-2-25-29 34 20z" opacity=".82"/></g></svg>')
};
function sourceMarker(info){if(!valid(info?.sourceLon,info?.sourceLat))return;if(info.sourceType==='carrier'){add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+info.sourceLon,+info.sourceLat,40000),billboard:{image:ICON.carrier,width:34,height:13,verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}else add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+info.sourceLon,+info.sourceLat,29000),point:{pixelSize:5.8,color:C.Color.fromCssColorString('#ffb45d'),outlineColor:C.Color.WHITE,outlineWidth:1.1,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
function targetMarker(info,n){if(!valid(info?.targetLon,info?.targetLat))return;const label=cleanMapLabel(n||currentNews(),'event');brightPoint(info.targetLon,info.targetLat,label)}
function localArc(info,mode){let d=+info.targetLon-(+info.sourceLon);if(d>180)d-=360;if(d<-180)d+=360;const dist=Math.hypot(d,+info.targetLat-(+info.sourceLat))*111000,peak=mode==='drone'?Math.min(70000,Math.max(15000,dist*.06)):Math.min(180000,Math.max(40000,dist*.12)),steps=mode==='drone'?105:80,positions=[],geo=[];for(let i=0;i<=steps;i++){const t=i/steps;let lon=+info.sourceLon+d*t;if(lon>180)lon-=360;if(lon<-180)lon+=360;const lat=+info.sourceLat+(+info.targetLat-(+info.sourceLat))*t;positions.push(C.Cartesian3.fromDegrees(lon,lat,22000+peak*Math.sin(Math.PI*t)));geo.push([lon,lat])}return{positions,geo}}
function screenAngle(path,start,duration){return new C.CallbackProperty(()=>{const el=performance.now()-start,t=Math.max(0,Math.min(1,el/duration)),i=Math.min(path.length-2,Math.floor(t*(path.length-1))),j=Math.min(path.length-1,i+2),fn=C.SceneTransforms?.worldToWindowCoordinates||C.SceneTransforms?.wgs84ToWindowCoordinates;try{const a=fn?.(G.viewer.scene,path[i]),b=fn?.(G.viewer.scene,path[j]);if(a&&b)return Math.atan2(-(b.y-a.y),b.x-a.x)}catch{}return 0},false)}
function oneWayPosition(path,start,duration){return new C.CallbackProperty(()=>{const t=Math.max(0,Math.min(1,(performance.now()-start)/duration)),i=Math.min(path.length-1,Math.floor(t*(path.length-1)));return path[i]},false)}
function explosion(lon,lat,start,duration=720){
 const pos=C.Cartesian3.fromDegrees(+lon,+lat,36000);
 add(G.viewer.entities.add({position:pos,billboard:{image:ICON.blast,width:42,height:42,show:new C.CallbackProperty(()=>{const e=performance.now()-start;return e>=0&&e<=duration},false),scale:new C.CallbackProperty(()=>{const e=Math.max(0,performance.now()-start),t=Math.min(1,e/duration);return .45+1.15*Math.sin(Math.PI*Math.min(1,t)),false}),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
 add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,900),ellipse:{show:new C.CallbackProperty(()=>{const e=performance.now()-start;return e>=0&&e<=duration+220},false),semiMajorAxis:new C.CallbackProperty(()=>{const t=Math.max(0,Math.min(1,(performance.now()-start)/(duration+220)));return 9000+t*52000},false),semiMinorAxis:new C.CallbackProperty(()=>{const t=Math.max(0,Math.min(1,(performance.now()-start)/(duration+220)));return 9000+t*52000},false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>{const t=Math.max(0,Math.min(1,(performance.now()-start)/(duration+220)));return C.Color.fromCssColorString('#ff7a22').withAlpha((1-t)*.22)},false)),outline:true,outlineColor:new C.CallbackProperty(()=>{const t=Math.max(0,Math.min(1,(performance.now()-start)/(duration+220)));return C.Color.fromCssColorString('#ffd34d').withAlpha((1-t)*.9)},false)}}));
}
G.v29ShowPotential=info=>{G.clearInteractionEffects();const n=currentNews();if(!info)return;sourceMarker(info);targetMarker(info,n);if(!valid(info.sourceLon,info.sourceLat)||!valid(info.targetLon,info.targetLat))return;const arc=localArc(info,'drone');add(G.viewer.entities.add({polyline:{positions:arc.positions,width:1.45,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ffc36a').withAlpha(.42),gapColor:C.Color.TRANSPARENT,dashLength:13})}}))};
G.v29ShowMissile=(n,info)=>{G.clearInteractionEffects();if(!info)return;sourceMarker(info);targetMarker(info,n);const arc=localArc(info,'missile'),start=performance.now(),duration=980;add(G.viewer.entities.add({polyline:{positions:arc.positions,width:1.9,material:new C.PolylineGlowMaterialProperty({glowPower:.14,color:C.Color.fromCssColorString('#ff9245').withAlpha(.78)})}}));add(G.viewer.entities.add({position:oneWayPosition(arc.positions,start,duration),billboard:{image:ICON.missile,width:37,height:9.5,rotation:screenAngle(arc.positions,start,duration),show:new C.CallbackProperty(()=>performance.now()-start<duration,false),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));explosion(info.targetLon,info.targetLat,start+duration,760)};
G.v29ShowDrone=(n,info)=>{G.clearInteractionEffects();if(!info)return;sourceMarker(info);targetMarker(info,n);const arc=localArc(info,'drone'),start=performance.now(),duration=2600;add(G.viewer.entities.add({polyline:{positions:arc.positions,width:1.8,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#d7f2ff').withAlpha(.86),gapColor:C.Color.fromCssColorString('#4ab8ff').withAlpha(.10),dashLength:15})}}));add(G.viewer.entities.add({position:oneWayPosition(arc.positions,start,duration),billboard:{image:ICON.drone,width:43,height:16,rotation:screenAngle(arc.positions,start,duration),show:new C.CallbackProperty(()=>performance.now()-start<duration,false),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));explosion(info.targetLon,info.targetLat,start+duration,520)};
G.showMissileEffect=(n,info)=>G.v29ShowMissile(n,info||G.v29AttackInfo?.(n,n?.countryIso3||''));
G.showDroneEffect=(n,info)=>G.v29ShowDrone(n,info||G.v29AttackInfo?.(n,n?.countryIso3||''));

function polygons(g){if(!g)return[];if(g.type==='Feature')return polygons(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polygons(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function rectangleLike(g){const ps=polygons(g);if(ps.length!==1)return false;const r=ps[0]?.[0]||[];if(r.length!==5)return false;const xs=[...new Set(r.map(p=>(+p[0]).toFixed(5)))],ys=[...new Set(r.map(p=>(+p[1]).toFixed(5)))];return xs.length===2&&ys.length===2}
function bbox(g){const ps=G.collect?.(g,[])||[];if(!ps.length)return null;let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const p of ps){const x=+p[0],y=+p[1];if(!Number.isFinite(x)||!Number.isFinite(y))continue;w=Math.min(w,x);e=Math.max(e,x);s=Math.min(s,y);n=Math.max(n,y)}return Number.isFinite(w)?[w,s,e,n]:null}
function containsPoint(g,lon,lat){try{return !!G.pointInGeom?.(+lon,+lat,g)}catch{return false}}
function geometryReasonable(g,n){const b=bbox(g);if(!b)return false;const [w,s,e,no]=b,dx=Math.abs(e-w),dy=Math.abs(no-s);if(dx>7||dy>7)return false;if(valid(n?.lon,n?.lat)){const cx=(w+e)/2,cy=(s+no)/2,d=Math.hypot((cx-+n.lon)*Math.cos(+n.lat*Math.PI/180),cy-+n.lat);if(d>3&&!containsPoint(g,n.lon,n.lat))return false}return true}
function drawRegionGeometry(g,label){G.clearCountry();G.clearLocal();clear34();const red=C.Color.fromCssColorString('#ff3b45');for(const p of polygons(g)){const h=G.hierarchy?.(p);if(!h)continue;add(G.viewer.entities.add({polygon:{hierarchy:h,perPositionHeight:true,material:red.withAlpha(.25),outline:false}}));const pos=G.positions?.(p[0],17000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:3,material:new C.PolylineGlowMaterialProperty({glowPower:.22,color:C.Color.fromCssColorString('#ff7279').withAlpha(.98)})}}))}const c=G.centerOf?.(g);if(c)mapLabel(label,c[0],c[1])}
async function flyGeom(g,serial){const pts=(G.collect?.(g,[])||[]).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0));if(!pts.length)return false;const sp=C.BoundingSphere.fromPoints(pts),range=Math.max(150000,Math.min(5200000,sp.radius*3.65));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.25,complete:r,cancel:r}));return serial===G.navSerial}
async function fetchExactRegion(n,iso){const qs=[cleanMapLabel(n,'region'),zhOnly(n.location),zhOnly(n.focusLabel)].filter(Boolean),seen=new Set();for(const loc of qs){if(seen.has(loc))continue;seen.add(loc);try{const q=new URLSearchParams({location:loc,placeType:String(n.placeType||'地区'),country:String(n.country||''),countryIso3:String(iso||''),lon:String(n.lon??''),lat:String(n.lat??'')});const r=await fetch('/api/geo-highlight?'+q,{cache:'force-cache'});if(!r.ok)continue;const j=await r.json();if(j?.approximate||!j?.geometry||rectangleLike(j.geometry)||!geometryReasonable(j.geometry,n))continue;return j.geometry}catch{}}return null}
function ellipseFallback(n,label){const b=Array.isArray(n.focusBounds)&&n.focusBounds.length===4?n.focusBounds.map(Number):null;const lon=b?(b[0]+b[2])/2:+n.lon,lat=b?(b[1]+b[3])/2:+n.lat;if(!valid(lon,lat))return false;let a=26000,c=18000;if(b&&b.every(Number.isFinite)){a=Math.max(12000,Math.min(90000,Math.abs(b[2]-b[0])*111000*Math.cos(lat*Math.PI/180)*.48));c=Math.max(9000,Math.min(70000,Math.abs(b[3]-b[1])*111000*.48))}G.clearCountry();G.clearLocal();clear34();add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,1000),ellipse:{semiMajorAxis:a,semiMinorAxis:c,material:C.Color.fromCssColorString('#ff3b45').withAlpha(.19),outline:true,outlineColor:C.Color.fromCssColorString('#ff7279').withAlpha(.95)}}));brightPoint(n.lon,n.lat,null);mapLabel(label,lon,lat);const range=Math.max(170000,Math.min(680000,Math.max(a,c)*5.4));G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,range),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.25});return true}
async function showRegion(n,iso,serial){const label=cleanMapLabel(n,'region'),g=await fetchExactRegion(n,iso);if(serial!==G.navSerial)return false;if(g){drawRegionGeometry(g,label);if(!await flyGeom(g,serial))return false;brightPoint(n.lon,n.lat,null);return G.wait(3300,serial)}ellipseFallback(n,label);return G.wait(3200,serial)}
function findChinaLevel1(name){const key=String(name||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g,'');for(const f of G.chinaLevel1Geo?.features||[]){const p=JSON.stringify(f.properties||{});if(p.includes(name)||key&&p.includes(key))return f}return null}
async function showChinaParent(step,serial){const f=findChinaLevel1(step.location);if(!f?.geometry)return false;const label=/新疆/.test(step.location)?'新疆维吾尔自治区':/台湾/.test(step.location)?'台湾省':zhOnly(step.location);drawRegionGeometry(f.geometry,label);if(!await flyGeom(f.geometry,serial))return false;await G.wait(1850,serial);G.clearLocal();return true}
async function showAdminStep(step,iso,serial){if(String(iso).toUpperCase()==='CHN'&&/自治区|省|直辖市/.test(String(step?.placeType||''))){const ok=await showChinaParent(step,serial);if(ok)return true}const ok=await G.flashAdmin?.(step,iso,serial,1750);if(ok!==false)return true;if(valid(step?.lon,step?.lat)){G.clearCountry();G.clearLocal();brightPoint(step.lon,step.lat,zhOnly(step.focusLabel||step.location));G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+step.lon,+step.lat,780000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15});await G.wait(1700,serial);G.clearLocal();return true}return false}
async function pointStage(n,serial){G.clearCountry();G.clearLocal();const lon=+n.lon,lat=+n.lat;if(!valid(lon,lat))return false;G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(280000,+n.pointHeight||430000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.2});await G.wait(900,serial);if(serial!==G.navSerial)return false;brightPoint(lon,lat,cleanMapLabel(n,'event'));return G.wait(3600,serial)}
async function showLastAdmin(n,iso,serial){const steps=G.adminSteps?.(n)||[];if(!steps.length)return false;const last=steps[steps.length-1];return showAdminStep(last,iso,serial)}

const prevRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 if(warLike(n))return prevRun(n,iso,serial);
 if(institution(n))return pointStage(n,serial);
 const steps=G.adminSteps?.(n)||[];
 const needsOrdered=steps.length>=2;
 const wantsRegion=strictRegion(n)||localFacilityRegion(n);
 if(needsOrdered||wantsRegion||enterpriseHQ(n)){
   for(const st of steps){if(serial!==G.navSerial)return;await showAdminStep(st,iso,serial);if(serial!==G.navSerial)return}
   if(wantsRegion){await showRegion(n,iso,serial);return}
   if(enterpriseHQ(n)){await showLastAdmin(n,iso,serial);return}
   if(steps.length)return;
 }
 return prevRun(n,iso,serial);
};
const prevDuration=G.storyDuration;G.storyDuration=n=>{const b=typeof prevDuration==='function'?prevDuration(n):18000;if(warLike(n)){const t=G.interactionType?.(n)||'';if(t==='missile')return Math.max(5500,Math.min(b,6500));if(t==='drone')return Math.max(6800,Math.min(b,7800))}const s=G.adminSteps?.(n)||[];if(s.length>=2)return Math.max(b,9000+s.length*2300);return b};
console.info('[News Globe] V34 final polish loaded');
})(window.NG14);
