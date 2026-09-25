(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
const num=v=>{v=+v;return Number.isFinite(v)?v:NaN};
const valid=(x,y)=>Number.isFinite(num(x))&&Number.isFinite(num(y));
const svg=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
G.v31Entities=[];
const add=e=>{if(e)G.v31Entities.push(e);return e};
const clearV31=()=>{for(const e of G.v31Entities||[])try{G.viewer.entities.remove(e)}catch{}G.v31Entities=[]};
const oldClearLocal=G.clearLocal;G.clearLocal=()=>{clearV31();if(typeof oldClearLocal==='function')oldClearLocal()};
const oldClearCountry=G.clearCountry;G.clearCountry=()=>{clearV31();if(typeof oldClearCountry==='function')oldClearCountry()};
const oldClearInteraction=G.clearInteractionEffects;G.clearInteractionEffects=()=>{clearV31();if(typeof oldClearInteraction==='function')oldClearInteraction()};

/* Detailed top-down silhouettes. Their natural nose/bow points to screen-right. */
const ICON={
carrier:svg('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="76" viewBox="0 0 190 76"><defs><linearGradient id="deck" x1="0" x2="1"><stop stop-color="#dce8ed"/><stop offset=".42" stop-color="#869aa4"/><stop offset="1" stop-color="#50636d"/></linearGradient><linearGradient id="hull" x1="0" x2="1"><stop stop-color="#8aa6b4"/><stop offset="1" stop-color="#394c56"/></linearGradient></defs><path d="M10 39 34 12h112l35 23-18 28H30z" fill="url(#hull)" stroke="#e9f7ff" stroke-width="2.2"/><path d="M22 34 43 17h96l31 19-15 20H31z" fill="url(#deck)" stroke="#f6fbfd" stroke-width="1.5"/><path d="M44 37h102" stroke="#f6fbfd" stroke-width="1.4" opacity=".9"/><path d="M89 19v36" stroke="#eef6f9" stroke-width="1.3" stroke-dasharray="5 4" opacity=".8"/><rect x="126" y="18" width="18" height="16" rx="2" fill="#435761" stroke="#eef8fc" stroke-width="1.2"/><rect x="136" y="10" width="3" height="9" fill="#eef8fc"/><rect x="145" y="22" width="8" height="5" fill="#4a5f68"/><g fill="#34464f"><path d="m52 25 12 4-12 4-8-4z"/><path d="m70 43 12 4-12 4-8-4z"/><path d="m97 25 12 4-12 4-8-4z"/><path d="m113 43 12 4-12 4-8-4z"/></g><path d="M17 67c19-5 34 5 55 0 23-6 43 6 93-1" fill="none" stroke="#55c4ff" stroke-width="2.2" opacity=".78"/></svg>'),
missile:svg('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="42" viewBox="0 0 150 42"><defs><linearGradient id="body" x1="0" x2="1"><stop stop-color="#7f8b91"/><stop offset=".5" stop-color="#e4eaed"/><stop offset="1" stop-color="#fafcfd"/></linearGradient><linearGradient id="flame" x1="0" x2="1"><stop stop-color="#ff4a18"/><stop offset=".55" stop-color="#ff9b24"/><stop offset="1" stop-color="#ffe66d"/></linearGradient></defs><path d="M28 21 46 11h66l27 10-27 10H46z" fill="url(#body)" stroke="#4f5c62" stroke-width="1.8"/><path d="M55 12 43 3l4 12M55 30 43 39l4-12M111 12l15-8-6 12M111 30l15 8-6-12" fill="#68767d" stroke="#455159" stroke-width="1"/><path d="M29 21 17 14 3 21l14 7z" fill="url(#flame)"/><circle cx="92" cy="21" r="2.8" fill="#28343a"/><path d="M137 21h8" stroke="#fff" stroke-width="1.7"/></svg>'),
drone:svg('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="58" viewBox="0 0 150 58"><defs><linearGradient id="d" x1="0" x2="1"><stop stop-color="#596a73"/><stop offset=".5" stop-color="#cfd8dd"/><stop offset="1" stop-color="#f6f9fa"/></linearGradient></defs><path d="M18 29 56 19 73 5l8 18 53 6-53 6-8 18-17-14z" fill="url(#d)" stroke="#45565f" stroke-width="1.8"/><path d="M58 20 72 29 58 38M85 24l28 5-28 5" fill="none" stroke="#667981" stroke-width="1.7"/><circle cx="75" cy="29" r="4" fill="#202d33"/><ellipse cx="105" cy="29" rx="4" ry="2.5" fill="#33464e"/><path d="M18 29 5 22v14z" fill="#596b74"/><path d="M69 9h8M69 49h8" stroke="#f5fafc" stroke-width="1.2"/></svg>')
};

const storyText=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType].join(' ');
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);
const diplomaticVisit=n=>/(大使|外交官|特使|代表团|总统|总理|部长).{0,18}(赴|前往|抵达|访问|视察)/.test(storyText(n))&&!/(谈判|会谈|峰会|协议|制裁|贸易|联合|打击|袭击|战争|冲突)/.test(storyText(n));
const fuzzyFacility=n=>/企业总部区域|总部所在区域|总部区域|中试生产线|中试提取线|生产线区域/.test(String(n?.placeType||'')+' '+String(n?.focusLabel||''));
const strictRegion=n=>/生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|战区|前线|地带|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|新区|景区|约旦河西岸|加沙地带|顿巴斯|戈兰高地|克里米亚/i.test(storyText(n))&&!fuzzyFacility(n);

/* Geo-semantic organization layer: policy actor is not automatically its headquarters country. */
const ORGS={
'欧盟':{keys:/欧盟|European Union|\bEU\b/i,members:['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE']},
'NATO':{keys:/北约|NATO/i,members:['ALB','BEL','BGR','CAN','HRV','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL','ITA','LVA','LTU','LUX','MNE','NLD','MKD','NOR','POL','PRT','ROU','SVK','SVN','ESP','SWE','TUR','GBR','USA']},
'东盟':{keys:/东盟|ASEAN/i,members:['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','TLS','VNM']},
'海合会':{keys:/海合会|GCC|Gulf Cooperation Council/i,members:['BHR','KWT','OMN','QAT','SAU','ARE']},
'G7':{keys:/七国集团|\bG7\b/i,members:['CAN','FRA','DEU','ITA','JPN','GBR','USA']},
'南方共同市场':{keys:/南方共同市场|Mercosur/i,members:['ARG','BOL','BRA','PRY','URY']}
};
const policyCue=n=>/政策|法规|禁令|出口|进口|关税|贸易|制裁|规定|规则|委员会|议会|共同声明|成员国|供应链|决定|批准|通过|拟扩大|拟实施/.test(storyText(n));
const orgOf=n=>{if(!policyCue(n))return null;for(const [name,o] of Object.entries(ORGS))if(o.keys.test(storyText(n)))return{name,...o};return null};

/* Safer dual-country inference: actor nationality is not automatically a second map location. */
const oldDualInfo=G.dualInfo;
G.dualInfo=n=>{
 const old=typeof oldDualInfo==='function'?oldDualInfo(n):null;
 if(orgOf(n))return null;
 if(diplomaticVisit(n))return null;
 if(old&&String(old.iso||'').toUpperCase()==='COL'&&/哥伦比亚特区|华盛顿特区|Washington\s*,?\s*D\.?C\.?/i.test(storyText(n)))return null;
 return old;
};

const oldStoryUI=G.storyUI;
G.storyUI=(n,iso)=>{oldStoryUI(n,iso);const org=orgOf(n);if(org){const el=G.$?.('country');if(el)el.textContent=org.name}}

function polygonsOf(g){
 if(!g)return[];if(g.type==='Feature')return polygonsOf(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polygonsOf(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[];
}
function linesOf(g){if(!g)return[];if(g.type==='Feature')return linesOf(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>linesOf(f));if(g.type==='LineString')return[g.coordinates];if(g.type==='MultiLineString')return g.coordinates||[];return[]}
function rectangleLike(g){const ps=polygonsOf(g);if(ps.length!==1)return false;const r=ps[0]?.[0]||[];if(r.length!==5)return false;const xs=[...new Set(r.map(p=>Number((+p[0]).toFixed(5))))],ys=[...new Set(r.map(p=>Number((+p[1]).toFixed(5))))];return xs.length===2&&ys.length===2}
function hierarchy(poly){try{return G.hierarchy?.(poly)||new C.PolygonHierarchy((poly?.[0]||[]).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],5000)))}catch{return null}}
function regionPoints(g){const a=[];for(const p of G.collect?.(g,[])||[])if(valid(p?.[0],p?.[1]))a.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));return a}
function drawExactRegion(g,label){
 clearV31();
 const red=C.Color.fromCssColorString('#ff4048');
 for(const p of polygonsOf(g)){const h=hierarchy(p);if(h)add(G.viewer.entities.add({polygon:{hierarchy:h,perPositionHeight:true,material:red.withAlpha(.20),outline:false}}));const pos=G.positions?.(p[0],17000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:2.9,material:new C.PolylineGlowMaterialProperty({glowPower:.23,color:C.Color.fromCssColorString('#ff6a72').withAlpha(.98)})}}))}
 for(const l of linesOf(g)){const pos=G.positions?.(l,17000)||[];if(pos.length){add(G.viewer.entities.add({corridor:{positions:pos,width:26000,cornerType:C.CornerType.ROUNDED,material:red.withAlpha(.13),height:2500}}));add(G.viewer.entities.add({polyline:{positions:pos,width:2.7,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:C.Color.fromCssColorString('#ff6a72').withAlpha(.98)})}}))}}
 const c=G.centerOf?.(g);if(c&&label)G.localLabelEntity=G.label(String(label),c[0],c[1],'country');
}
async function flyExact(g,serial){const pts=regionPoints(g);if(!pts.length)return false;const sp=C.BoundingSphere.fromPoints(pts),range=Math.max(90000,Math.min(5200000,sp.radius*2.22));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.35,complete:r,cancel:r}));if(serial!==G.navSerial)return false;G.updateOcclusion?.();return true}
async function fetchExactRegion(n,iso){
 const attempts=[String(n?.location||'').trim(),[n?.location,n?.region].filter(Boolean).join(' ').trim()].filter(Boolean);const seen=new Set();
 for(const loc of attempts){if(seen.has(loc))continue;seen.add(loc);try{const q=new URLSearchParams({location:loc,placeType:String(n?.placeType||'地区'),country:String(n?.country||''),countryIso3:String(iso||''),lon:String(n?.lon??''),lat:String(n?.lat??'')});const r=await fetch('/api/geo-highlight?'+q,{cache:'force-cache'});if(!r.ok)continue;const j=await r.json();if(j?.approximate||!j?.geometry||rectangleLike(j.geometry))continue;const typ=j.geometry?.type;if(!/Polygon|MultiPolygon|LineString|MultiLineString|Feature|FeatureCollection/.test(String(typ)))continue;return{geometry:j.geometry,label:String(n?.focusLabel||n?.location||j.label||loc)}}catch{}}
 return null;
}
async function showStrictRegion(n,iso,serial){const res=await fetchExactRegion(n,iso);if(serial!==G.navSerial)return false;if(!res)return false;G.clearCountry();G.clearLocal();drawExactRegion(res.geometry,res.label);const ok=await flyExact(res.geometry,serial);if(!ok)return false;return G.wait(4200,serial)}

/* Organization highlight = translucent red fill + glowing borders, like a country selection. */
async function showOrganization(org,serial){
 G.clearCountry();G.clearLocal();try{G.clearSecondaryCountry?.()}catch{}clearV31();const pts=[];const red=C.Color.fromCssColorString('#ff4048');
 for(const iso of org.members){const c=G.countries?.get?.(iso);if(!c?.feature?.geometry)continue;for(const p of G.collect?.(c.feature.geometry,[])||[])if(valid(p?.[0],p?.[1]))pts.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));for(const poly of polygonsOf(c.feature.geometry)){const h=hierarchy(poly);if(h)add(G.viewer.entities.add({polygon:{hierarchy:h,perPositionHeight:true,material:red.withAlpha(.16),outline:false}}));const pos=G.positions?.(poly[0],19000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:2.15,material:new C.PolylineGlowMaterialProperty({glowPower:.18,color:C.Color.fromCssColorString('#ff6a72').withAlpha(.96)})}}))}}
 if(!pts.length)return true;const sp=C.BoundingSphere.fromPoints(pts),center=C.Cartographic.fromCartesian(sp.center),lon=C.Math.toDegrees(center.longitude),lat=C.Math.toDegrees(center.latitude);add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,90000),label:{text:org.name,font:'17px "Microsoft YaHei",sans-serif',fillColor:C.Color.fromCssColorString('#fff2f2'),outlineColor:C.Color.fromCssColorString('#3a0909').withAlpha(.92),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#451018').withAlpha(.66),backgroundPadding:new C.Cartesian2(12,7),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));const range=Math.max(2200000,Math.min(8200000,sp.radius*2.52));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.45,complete:r,cancel:r}));if(serial!==G.navSerial)return false;G.updateOcclusion?.();return G.wait(3400,serial)}

/* More faithful carrier / missile / drone and quicker launch. */
const pulse=(lon,lat,color,b=14000,s=21000)=>{if(!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,800),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>b+((Math.sin(G.pulsePhase*2)+1)/2)*s,false),semiMinorAxis:new C.CallbackProperty(()=>b+((Math.sin(G.pulsePhase*2)+1)/2)*s,false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString(color).withAlpha(.04),false)),outline:true,outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString(color).withAlpha(.27),false)}}))};
const sourceMarker=i=>{if(!valid(i?.sourceLon,i?.sourceLat))return;if(i.sourceType==='carrier'){add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(i.sourceLon,i.sourceLat,46000),billboard:{image:ICON.carrier,width:72,height:29,verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));pulse(i.sourceLon,i.sourceLat,'#63cfff')}else add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(i.sourceLon,i.sourceLat,31000),point:{pixelSize:6,color:C.Color.fromCssColorString('#ffb45d'),outlineColor:C.Color.WHITE,outlineWidth:1.3,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))};
const targetMarker=i=>{if(!valid(i?.targetLon,i?.targetLat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(i.targetLon,i.targetLat,32000),point:{pixelSize:8,color:C.Color.fromCssColorString('#ff4d4d'),outlineColor:C.Color.WHITE,outlineWidth:1.6,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));pulse(i.targetLon,i.targetLat,'#ff5b50',17000,29000)};
function arc(i,mode){let d=i.targetLon-i.sourceLon;if(d>180)d-=360;if(d<-180)d+=360;const dist=Math.hypot(d,i.targetLat-i.sourceLat)*111000,peak=mode==='drone'?Math.min(78000,Math.max(16000,dist*.07)):Math.min(210000,Math.max(42000,dist*.15)),steps=mode==='drone'?110:88,pos=[],geo=[];for(let k=0;k<=steps;k++){const t=k/steps;let lon=i.sourceLon+d*t;if(lon>180)lon-=360;if(lon<-180)lon+=360;const lat=i.sourceLat+(i.targetLat-i.sourceLat)*t;pos.push(C.Cartesian3.fromDegrees(lon,lat,23000+peak*Math.sin(Math.PI*t)));geo.push([lon,lat])}return{pos,geo}}
const idx=(start,dur,hold,len)=>{const t=Math.min(1,((performance.now()-start)%(dur+hold))/dur);return Math.min(len-1,Math.floor(t*(len-1)))};
const moving=(a,s,d,h)=>new C.CallbackProperty(()=>a[idx(s,d,h,a.length)],false);
const screenRotation=(pos,s,d,h)=>new C.CallbackProperty(()=>{const i=idx(s,d,h,pos.length),a=pos[i],b=pos[Math.min(pos.length-1,i+2)]||a;try{const sa=C.SceneTransforms.wgs84ToWindowCoordinates(G.viewer.scene,a),sb=C.SceneTransforms.wgs84ToWindowCoordinates(G.viewer.scene,b);if(sa&&sb)return Math.atan2(sb.y-sa.y,sb.x-sa.x)}catch{}return 0},false);
G.v29ShowPotential=info=>{G.clearInteractionEffects();sourceMarker(info);targetMarker(info);if(!valid(info?.sourceLon,info?.sourceLat)||!valid(info?.targetLon,info?.targetLat))return;const a=arc(info,'drone');add(G.viewer.entities.add({polyline:{positions:a.pos,width:1.6,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ffc36a').withAlpha(.45),gapColor:C.Color.TRANSPARENT,dashLength:13})}}))};
G.v29ShowMissile=(nw,info)=>{G.clearInteractionEffects();sourceMarker(info);targetMarker(info);const a=arc(info,'missile');add(G.viewer.entities.add({polyline:{positions:a.pos,width:2,material:new C.PolylineGlowMaterialProperty({glowPower:.16,color:C.Color.fromCssColorString('#ff9847').withAlpha(.8)})}}));const s=performance.now(),dur=1750,hold=420;add(G.viewer.entities.add({position:moving(a.pos,s,dur,hold),billboard:{image:ICON.missile,width:44,height:13,rotation:screenRotation(a.pos,s,dur,hold),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))};
G.v29ShowDrone=(nw,info)=>{G.clearInteractionEffects();sourceMarker(info);targetMarker(info);const a=arc(info,'drone');add(G.viewer.entities.add({polyline:{positions:a.pos,width:1.9,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#d7f2ff').withAlpha(.88),gapColor:C.Color.fromCssColorString('#4ab8ff').withAlpha(.12),dashLength:15})}}));const s=performance.now(),dur=3600,hold=600;add(G.viewer.entities.add({position:moving(a.pos,s,dur,hold),billboard:{image:ICON.drone,width:46,height:18,rotation:screenRotation(a.pos,s,dur,hold),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))};
G.showMissileEffect=(nw,info)=>G.v29ShowMissile(nw,info||G.v29AttackInfo?.(nw,nw?.countryIso3||''));
G.showDroneEffect=(nw,info)=>G.v29ShowDrone(nw,info||G.v29AttackInfo?.(nw,nw?.countryIso3||''));

const oldCountryStage=G.countryStage;
G.countryStage=async(n,iso,serial)=>{const org=orgOf(n);if(org)return showOrganization(org,serial);return oldCountryStage(n,iso,serial)};

async function persistentAdmin(step,iso,serial){G.clearCountry();G.clearLocal();const res=await G.resolveArea(step,iso);if(serial!==G.navSerial)return false;if(res?.geometry){G.drawAdminArea(res.geometry,step,res.radiusKm);const p=G.centerOf(res.geometry);if(p)G.localLabelEntity=G.label(String(step.focusLabel||step.location),p[0],p[1],'country');G.flyArea(res,step,serial,'admin');await G.wait(3800,serial);return serial===G.navSerial}if(valid(step.lon,step.lat)){G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+step.lon,+step.lat,700000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.3});G.localLabelEntity=G.label(String(step.focusLabel||step.location),+step.lon,+step.lat,'country');return G.wait(3300,serial)}return true}

/* Universal sequence: show every reliable administrative parent; never invent a rectangle for an uncertain finer area. */
const oldRunSequence=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 if(warLike(n))return oldRunSequence(n,iso,serial);
 const org=orgOf(n);if(org){await G.countryStage(n,iso,serial);return}
 let steps=G.adminSteps?.(n)||[];const fa=G.finalAdmin?.(n);if(fa){const key=fa.location+'|'+fa.placeType;if(!steps.some(x=>x.location+'|'+x.placeType===key))steps=[...steps,fa]}
 const special=strictRegion(n)||fuzzyFacility(n)||n?.stopAtLastAdmin===true;
 if(!steps.length&&!special)return oldRunSequence(n,iso,serial);
 if(iso){const ok=await G.countryStage(n,iso,serial);if(!ok)return}
 G.clearCountry();
 for(const st of steps){if(serial!==G.navSerial)return;const ok=await G.flashAdmin(st,iso,serial,2400);if(!ok&&serial===G.navSerial)break}
 if(serial!==G.navSerial)return;
 const last=steps[steps.length-1]||null;
 if(fuzzyFacility(n)||n?.stopAtLastAdmin===true){if(last)await persistentAdmin(last,iso,serial);return}
 if(strictRegion(n)){const shown=await showStrictRegion(n,iso,serial);if(shown)return;if(last){await persistentAdmin(last,iso,serial);return}G.clearCountry();G.clearLocal();if(valid(n.lon,n.lat)){G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+n.lon,+n.lat,520000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.3});G.localLabelEntity=G.label(String(n.location||''),+n.lon,+n.lat,'local')}return}
 if(last&&G.isAdminType?.(n.placeType)){await persistentAdmin(last,iso,serial);return}
 G.clearCountry();G.clearLocal();await G.flashArea(n,iso,serial);
};

const oldStoryDuration=G.storyDuration;
G.storyDuration=n=>{const base=typeof oldStoryDuration==='function'?oldStoryDuration(n):19000;if(warLike(n)){const t=G.interactionType?.(n)||'';if(t==='missile')return Math.min(base,6500);if(t==='drone')return Math.min(base,8000)}const steps=G.adminSteps?.(n)||[];if(steps.length)return Math.max(base,11500+steps.length*2800);return base};
console.info('[News Globe] V31 geosemantic engine loaded');
})(window.NG14);
