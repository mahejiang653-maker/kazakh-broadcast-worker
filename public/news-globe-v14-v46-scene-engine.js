(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;if(G.__v46SceneEngine)return;G.__v46SceneEngine=true;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(r,ms));
const text=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel,n?.alliance].join(' ');

/* ==================== visual grammar ==================== */
const COLORS={
 primary:C.Color.fromCssColorString('#ff3b45'),
 secondary:C.Color.fromCssColorString('#42aef5'),
 attacker:C.Color.fromCssColorString('#ff9f2d'),
 victim:C.Color.fromCssColorString('#ff3340'),
 source:C.Color.fromCssColorString('#ffd057'),
 alliance:C.Color.fromCssColorString('#ff4650')
};
const COUNTRY_NAMES={CHN:'中华人民共和国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',LBN:'黎巴嫩',DEU:'德国',THA:'泰国',AUT:'奥地利',EGY:'埃及',SGP:'新加坡',SAU:'沙特阿拉伯',ARE:'阿联酋',IRQ:'伊拉克',KWT:'科威特',VEN:'委内瑞拉',KAZ:'哈萨克斯坦',OMN:'阿曼',DZA:'阿尔及利亚',LBY:'利比亚',NGA:'尼日利亚'};
const ISO2={USA:'us',RUS:'ru',UKR:'ua',IRN:'ir',ISR:'il',LBN:'lb',CHN:'cn',DEU:'de',THA:'th',AUT:'at',EGY:'eg',SGP:'sg',SAU:'sa',ARE:'ae',IRQ:'iq',KWT:'kw',VEN:'ve',KAZ:'kz',OMN:'om'};
const ORGS={
 '欧盟':['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE'],
 '北约':['ALB','BEL','BGR','CAN','HRV','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL','ITA','LVA','LTU','LUX','MNE','NLD','MKD','NOR','POL','PRT','ROU','SVK','SVN','ESP','SWE','TUR','GBR','USA'],
 '东盟':['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','TLS','VNM'],
 '海合会':['BHR','KWT','OMN','QAT','SAU','ARE'],
 'OPEC+':['DZA','COG','GNQ','GAB','IRN','IRQ','KWT','LBY','NGA','SAU','ARE','VEN','AZE','BHR','BRN','KAZ','MYS','MEX','OMN','RUS','SSD','SDN']
};

G.v46Entities=[];
const add=e=>{if(e)G.v46Entities.push(e);return e};
function clearV46(){for(const e of G.v46Entities||[])try{G.viewer.entities.remove(e)}catch{}G.v46Entities=[]}
function clearAll(){clearV46();try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}}
function polys(g){if(!g)return[];if(g.type==='Feature')return polys(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polys(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function cartPoints(g){return(G.collect?.(g,[])||[]).filter(p=>valid(p?.[0],p?.[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0))}
function countryFeatures(iso){iso=String(iso||'').toUpperCase();if(iso==='CHN'&&Array.isArray(G.chinaLevel1Geo?.features))return G.chinaLevel1Geo.features;const f=G.countries?.get?.(iso)?.feature;return f?[f]:[]}
function centerForCountry(iso){const c=G.countries?.get?.(iso);return c?.center||G.centerOf?.(c?.feature?.geometry)||null}
function cname(iso){iso=String(iso||'').toUpperCase();return COUNTRY_NAMES[iso]||G.countryName?.(iso)||iso}
function makeLabel(t,lon,lat,mode='country'){if(!t||!valid(lon,lat))return;const e=G.label?.(String(t),+lon,+lat,mode);if(e)add(e)}
function drawGeom(g,color,alpha=.2,width=2.4){for(const poly of polys(g)){const ring=poly?.[0]||[];if(ring.length<3)continue;const h=new C.PolygonHierarchy(ring.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],7200)));add(G.viewer.entities.add({polygon:{hierarchy:h,height:7200,perPositionHeight:false,arcType:C.ArcType.GEODESIC,material:color.withAlpha(alpha),outline:false}}));const pos=G.positions?.(ring,18000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:color.withAlpha(.98)})}}))}}
async function flyPoints(pts,s,min=1200000,max=26000000,factor=2.65){if(!pts.length)return false;const sp=C.BoundingSphere.fromPoints(pts),range=Math.max(min,Math.min(max,sp.radius*factor));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.25,complete:r,cancel:r}));return s===G.navSerial}
function addFlag(iso,lon,lat,dx=0,dy=-18,w=22,h=14){const cc=ISO2[String(iso||'').toUpperCase()];if(!cc||!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,56000),billboard:{image:'https://flagcdn.com/w40/'+cc+'.png',width:w,height:h,pixelOffset:new C.Cartesian2(dx,dy),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}

async function showCountryStyled(iso,s,{color=COLORS.primary,role='',hold=1350,flag=false}={}){clearAll();const fs=countryFeatures(iso),pts=[];if(!fs.length)return false;for(const f of fs){drawGeom(f.geometry,color,.22,2.6);pts.push(...cartPoints(f.geometry))}const ctr=centerForCountry(iso)||G.centerOf?.(fs[0]?.geometry);if(ctr){makeLabel(role?`${cname(iso)}｜${role}`:cname(iso),ctr[0],ctr[1]);if(flag)addFlag(iso,ctr[0],ctr[1],0,-44,24,15)}if(!await flyPoints(pts,s,1500000,16000000,2.65))return false;await wait(hold,s);return s===G.navSerial}

function angularDistance(a,b){if(!a||!b)return 180;const r=Math.PI/180,la=a[1]*r,lb=b[1]*r,dl=(a[0]-b[0])*r;return Math.acos(Math.max(-1,Math.min(1,Math.sin(la)*Math.sin(lb)+Math.cos(la)*Math.cos(lb)*Math.cos(dl))))/r}
function tooFar(isos){const cs=isos.map(centerForCountry).filter(Boolean);let mx=0;for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)mx=Math.max(mx,angularDistance(cs[i],cs[j]));return mx>58}
async function showCountrySet(isos,s,{primaryIso='',hold=1800,allSame=false,title='',forceOverview=false}={}){clearAll();const u=[...new Set((isos||[]).map(x=>String(x||'').toUpperCase()).filter(Boolean))],pts=[];for(const iso of u){const color=allSame?COLORS.alliance:(iso===String(primaryIso||u[0]).toUpperCase()?COLORS.primary:COLORS.secondary);for(const f of countryFeatures(iso)){drawGeom(f.geometry,color,allSame?.19:(iso===String(primaryIso||u[0]).toUpperCase()?.22:.17),2.35);pts.push(...cartPoints(f.geometry))}const c=centerForCountry(iso);if(c&&!allSame)makeLabel(cname(iso),c[0],c[1],iso===primaryIso?'country':'secondary-country')}
 if(title&&pts.length){const sp=C.BoundingSphere.fromPoints(pts),ct=C.Cartographic.fromCartesian(sp.center);makeLabel(title,C.Math.toDegrees(ct.longitude),C.Math.toDegrees(ct.latitude))}
 if(!await flyPoints(pts,s,2500000,26000000,2.8))return false;await wait(hold,s);return s===G.navSerial}

async function showMultiCountries(isos,primaryIso,s,{finalHold=900,overview=true}={}){const u=[...new Set(isos.filter(Boolean).map(x=>String(x).toUpperCase()))];if(!u.length)return true;const far=tooFar(u)||u.length>=3;if(overview){await showCountrySet(u,s,{primaryIso,hold:far?1200:1900});if(s!==G.navSerial)return false}if(far){for(const iso of u){await showCountryStyled(iso,s,{color:iso===primaryIso?COLORS.primary:COLORS.secondary,hold:1050});if(s!==G.navSerial)return false}}await wait(finalHold,s);return s===G.navSerial}

/* ==================== attack grammar ==================== */
function attackInfo(n){const attacker=String(n?.sourceCountryIso3||'').toUpperCase(),victim=String(n?.targetCountryIso3||n?.countryIso3||'').toUpperCase();return{attacker,victim,sourceLon:+n?.sourceLon,sourceLat:+n?.sourceLat,targetLon:+n?.targetLon,targetLat:+n?.targetLat,remotePlatform:n?.sourceType==='carrier'||n?.sourceType==='ship'||n?.sourceType==='fleet'}}
function localPath(a,b,mode){let d=b.lon-a.lon;if(d>180)d-=360;if(d<-180)d+=360;const dist=Math.hypot(d,b.lat-a.lat)*111000,peak=mode==='drone'?Math.min(85000,Math.max(14000,dist*.06)):Math.min(180000,Math.max(32000,dist*.11)),steps=80,out=[];for(let i=0;i<=steps;i++){const t=i/steps;let lon=a.lon+d*t;if(lon>180)lon-=360;if(lon<-180)lon+=360;out.push(C.Cartesian3.fromDegrees(lon,a.lat+(b.lat-a.lat)*t,22000+peak*Math.sin(Math.PI*t)))}return out}
function sourceAndTarget(n,info){if(valid(info.sourceLon,info.sourceLat)){add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.sourceLon,info.sourceLat,30000),point:{pixelSize:7,color:COLORS.source,outlineColor:C.Color.WHITE,outlineWidth:1.5,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));addFlag(info.attacker,info.sourceLon,info.sourceLat,15,-15,22,14);makeLabel('攻击源',info.sourceLon,info.sourceLat,'secondary-country')}if(valid(info.targetLon,info.targetLat)){add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.targetLon,info.targetLat,32000),point:{pixelSize:10,color:COLORS.victim,outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));makeLabel(String(n?.focusLabel||n?.location||'目标'),info.targetLon,info.targetLat)}}
async function showLocalAttack(n,info,s){clearAll();const pts=[];for(const [iso,color,role] of [[info.attacker,COLORS.attacker,'攻击方'],[info.victim,COLORS.victim,'被攻击方']]){if(info.remotePlatform&&iso===info.attacker)continue;for(const f of countryFeatures(iso)){drawGeom(f.geometry,color,.16,2.3);pts.push(...cartPoints(f.geometry))}const c=centerForCountry(iso);if(c){makeLabel(`${cname(iso)}｜${role}`,c[0],c[1]);addFlag(iso,c[0],c[1],0,-42,22,14)}}
 sourceAndTarget(n,info);if(valid(info.sourceLon,info.sourceLat))pts.push(C.Cartesian3.fromDegrees(info.sourceLon,info.sourceLat,0));if(valid(info.targetLon,info.targetLat))pts.push(C.Cartesian3.fromDegrees(info.targetLon,info.targetLat,0));
 if(pts.length)await flyPoints(pts,s,500000,7500000,2.1);if(s!==G.navSerial)return false;
 if(n?.potentialStrike){if(valid(info.sourceLon,info.sourceLat)&&valid(info.targetLon,info.targetLat)){add(G.viewer.entities.add({polyline:{positions:[C.Cartesian3.fromDegrees(info.sourceLon,info.sourceLat,35000),C.Cartesian3.fromDegrees(info.targetLon,info.targetLat,35000)],width:2,material:new C.PolylineDashMaterialProperty({color:COLORS.attacker.withAlpha(.8),dashLength:16})}}))}return wait(3300,s)}
 if(valid(info.sourceLon,info.sourceLat)&&valid(info.targetLon,info.targetLat)){const path=localPath({lon:info.sourceLon,lat:info.sourceLat},{lon:info.targetLon,lat:info.targetLat},n?.attackType);const start=performance.now(),dur=n?.attackType==='drone'?3000:1500;add(G.viewer.entities.add({polyline:{positions:path,width:2.4,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:COLORS.attacker.withAlpha(.88)})}}));add(G.viewer.entities.add({position:new C.CallbackProperty(()=>{const t=Math.min(1,(performance.now()-start)/dur);return path[Math.min(path.length-1,Math.floor(t*(path.length-1)))];},false),point:{pixelSize:7,color:COLORS.source,outlineColor:COLORS.attacker,outlineWidth:2}}));setTimeout(()=>{if(s!==G.navSerial)return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(info.targetLon,info.targetLat,45000),point:{pixelSize:new C.CallbackProperty(()=>10+10*Math.abs(Math.sin((performance.now()-start)*.008)),false),color:C.Color.fromCssColorString('#ff5b32').withAlpha(.95),outlineColor:C.Color.WHITE,outlineWidth:1.5,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))},dur)}
 return wait((n?.attackType==='drone'?4600:3400),s)}
async function runAttack(n,iso,s){const info=attackInfo(n);if(!info.attacker||!info.victim)return false;
 /* Remote carrier/ship attacks do not fly to the attacker's homeland. */
 if(info.remotePlatform){await showCountryStyled(info.victim,s,{color:COLORS.victim,role:'被攻击方',hold:900,flag:true});if(s!==G.navSerial)return false;return showLocalAttack(n,info,s)}
 const pair=[info.attacker,info.victim];if(tooFar(pair)){await showCountryStyled(info.attacker,s,{color:COLORS.attacker,role:'攻击方',hold:900,flag:true});if(s!==G.navSerial)return false;await showCountryStyled(info.victim,s,{color:COLORS.victim,role:'被攻击方',hold:900,flag:true});if(s!==G.navSerial)return false}else{clearAll();const pts=[];for(const [ci,color,role] of [[info.attacker,COLORS.attacker,'攻击方'],[info.victim,COLORS.victim,'被攻击方']]){for(const f of countryFeatures(ci)){drawGeom(f.geometry,color,.2,2.6);pts.push(...cartPoints(f.geometry))}const c=centerForCountry(ci);if(c){makeLabel(`${cname(ci)}｜${role}`,c[0],c[1]);addFlag(ci,c[0],c[1],0,-42)}}await flyPoints(pts,s,800000,7000000,2.45);await wait(1300,s)}
 if(s!==G.navSerial)return false;return showLocalAttack(n,info,s)}

/* ==================== alliance grammar ==================== */
function orgMembers(n){if(Array.isArray(n?.allianceMembers)&&n.allianceMembers.length)return n.allianceMembers;const a=String(n?.alliance||'');if(ORGS[a])return ORGS[a];for(const k of Object.keys(ORGS))if(text(n).includes(k))return ORGS[k];return[]}
function geographicGroups(isos){const groups={美洲:[],欧洲非洲中东:[],亚洲太平洋:[]};for(const iso of isos){const c=centerForCountry(iso);if(!c){groups['欧洲非洲中东'].push(iso);continue}const lon=c[0];if(lon<-30)groups['美洲'].push(iso);else if(lon>80)groups['亚洲太平洋'].push(iso);else groups['欧洲非洲中东'].push(iso)}return Object.entries(groups).filter(([,v])=>v.length)}
async function runAlliance(n,s){const members=orgMembers(n),name=String(n?.alliance||n?.focusLabel||'合作组织');if(!members.length)return false;const groups=geographicGroups(members);
 /* One global cue, then every geographic cluster so no back-side members are omitted. */
 await showCountrySet(members,s,{allSame:true,title:name,hold:1100});if(s!==G.navSerial)return false;
 if(groups.length>1){for(const [gname,isos] of groups){await showCountrySet(isos,s,{allSame:true,title:`${name}｜${gname}`,hold:1250});if(s!==G.navSerial)return false}}
 return wait(700,s)}

/* ==================== exact admin + final point ==================== */
function bbox(g){const a=G.collect?.(g,[])||[];let w=Infinity,ss=Infinity,e=-Infinity,n=-Infinity;for(const p of a){if(!valid(p?.[0],p?.[1]))continue;w=Math.min(w,+p[0]);e=Math.max(e,+p[0]);ss=Math.min(ss,+p[1]);n=Math.max(n,+p[1])}return Number.isFinite(w)?[w,ss,e,n]:null}
function chinaL1(name){const k=String(name||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市/g,'');for(const f of G.chinaLevel1Geo?.features||[]){const vals=Object.values(f.properties||{}).map(String);if(vals.includes(String(name))||vals.some(v=>k&&v.includes(k)))return f}return null}
function saneAdmin(g,st){const b=bbox(g);if(!b)return false;const t=String(st?.placeType||''),dx=b[2]-b[0],dy=b[3]-b[1];let mx=8,my=8,lim=4;if(/省|自治区|直辖市|特别行政区|州$|府$|province|state/i.test(t)){mx=18;my=18;lim=8}else if(/市|城市|地区|自治州|prefecture|city/i.test(t)){mx=6;my=6;lim=3}else if(/县|区|county|district/i.test(t)){mx=3;my=3;lim=1.7}if(dx>mx||dy>my)return false;const lon=+st?.lon,lat=+st?.lat;if(valid(lon,lat)){try{if(G.pointInGeom?.(lon,lat,g))return true}catch{}const d=Math.hypot((((b[0]+b[2])/2)-lon)*Math.cos(lat*Math.PI/180),((b[1]+b[3])/2)-lat);if(d>lim)return false}return true}
async function getAdminGeometry(st,iso,parents,n){const name=String(st?.focusLabel||st?.location||''),type=String(st?.placeType||'');if(String(iso).toUpperCase()==='CHN'&&/省|自治区|直辖市|特别行政区/.test(type)){const f=chinaL1(st.location||name);if(f?.geometry)return f.geometry}const queries=[];if(parents.length)queries.push(parents.join('')+name);queries.push(name);for(const loc of queries){try{const q=new URLSearchParams({location:loc,placeType:type||'地区',country:String(n?.country||''),countryIso3:String(iso||''),lon:String(st?.lon??n?.lon??''),lat:String(st?.lat??n?.lat??'')});const r=await fetch('/api/geo-highlight?'+q,{cache:'no-store'});if(!r.ok)continue;const j=await r.json();if(j?.geometry&&!j?.approximate&&saneAdmin(j.geometry,st))return j.geometry}catch{}}return null}
async function showAdmin(st,iso,s,parents,n){const g=await getAdminGeometry(st,iso,parents,n);if(!g||s!==G.navSerial)return false;clearAll();drawGeom(g,COLORS.primary,.21,2.55);const c=G.centerOf?.(g);if(c)makeLabel(String(st?.focusLabel||st?.location||''),c[0],c[1]);if(!await flyPoints(cartPoints(g),s,220000,6500000,2.55))return false;await wait(1200,s);return s===G.navSerial}
async function showPoint(n,s){clearAll();if(!valid(n?.lon,n?.lat))return false;const lon=+n.lon,lat=+n.lat;await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(240000,+n.pointHeight||390000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15,complete:r,cancel:r}));if(s!==G.navSerial)return false;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,31000),point:{pixelSize:10,color:COLORS.primary,outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));makeLabel(String(n?.focusLabel||n?.location||'新闻地点').replace(/所在区域|所在地区/g,''),lon,lat);if(n?.displayMode==='carrier-port'){const svg='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="170" height="62"><path d="M8 34 31 10h107l25 19-15 27H27z" fill="#8d9aa0" stroke="#eff8fb" stroke-width="2"/><path d="M38 31h102M80 13v38" stroke="#fff" opacity=".75"/><rect x="122" y="14" width="18" height="15" fill="#40525b"/></svg>');add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,42000),billboard:{image:svg,width:42,height:15,pixelOffset:new C.Cartesian2(0,12),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));addFlag(n?.platformCountryIso3||'USA',lon,lat,0,-9,21,13)}return wait(2900,s)}

function related(n,iso){const a=Array.isArray(n?.relatedCountryIso3s)?n.relatedCountryIso3s.slice():[];if(!a.length){if(iso)a.push(iso);if(n?.secondaryCountryIso3)a.push(n.secondaryCountryIso3)}return[...new Set(a.filter(Boolean).map(x=>String(x).toUpperCase()))]}
function classify(n,iso){if(n?.sceneMode)return n.sceneMode;if(n?.attackType||n?.potentialStrike||n?.regionalDual)return'attack';if(n?.displayMode==='alliance'||n?.alliance)return'alliance';if(n?.countryOnly===true||/国家.*政策|全国/.test(String(n?.placeType||'')+' '+String(n?.region||'')))return'country';const rs=related(n,iso);if(rs.length>=2&&Array.isArray(n?.adminChain)&&n.adminChain.length)return'multi-location';if(rs.length>=2)return'multi-country';if(Array.isArray(n?.adminChain)&&n.adminChain.length)return'location-chain';if(/城市|会晤城市|会谈城市|机场|港口|会场|总部|大学|医院|学校|机构|设施/.test(String(n?.placeType||'')))return'point';return'single';}

async function runLocation(n,iso,s,{withRelated=false}={}){const rs=related(n,iso),primary=String(iso||n?.countryIso3||'').toUpperCase();if(withRelated&&rs.length>1){if(!await showMultiCountries(rs,primary,s,{overview:true}))return false}if(!await showCountryStyled(primary,s,{color:COLORS.primary,hold:1050}))return false;const parents=[];for(const st of (n.adminChain||[])){const ok=await showAdmin(st,primary,s,parents,n);if(!ok){console.warn('[V46] subdivision rejected rather than mislocated:',st?.location);return false}parents.push(String(st.location||st.focusLabel||''))}return showPoint(n,s)}

/* Prevent ordinary diplomacy/cooperation from inheriting old long-distance arcs. */
try{G.clearArc?.();}catch{}
const baseRun=G.runSequence;
G.runSequence=async(n,iso,s)=>{
 iso=String(iso||n?.countryIso3||'').toUpperCase();clearV46();const mode=classify(n,iso);n.__sceneMode=mode;
 if(mode==='attack')return runAttack(n,iso,s);
 if(mode==='alliance')return runAlliance(n,s);
 if(mode==='country')return showCountryStyled(iso,s,{color:COLORS.primary,hold:3800});
 if(mode==='multi-country'){const rs=related(n,iso);return showMultiCountries(rs,iso,s,{overview:true,finalHold:2500});}
 if(mode==='multi-location')return runLocation(n,iso,s,{withRelated:true});
 if(mode==='location-chain')return runLocation(n,iso,s,{withRelated:false});
 if(mode==='point'){if(!await showCountryStyled(iso,s,{color:COLORS.primary,hold:1100}))return false;return showPoint(n,s)}
 return baseRun(n,iso,s);
};

/* UI country chip follows actual relationship, not arbitrary title order. */
if(typeof G.storyUI==='function'){const old=G.storyUI;G.storyUI=(n,iso)=>{old(n,iso);try{const el=G.$?.('country');if(!el)return;const m=classify(n,iso),rs=related(n,iso);if(m==='attack'){const a=attackInfo(n);el.textContent=`${cname(a.attacker)} → ${cname(a.victim)}`}else if(m==='alliance')el.textContent=String(n.alliance||n.focusLabel||'合作组织');else if(rs.length>1)el.textContent=rs.map(cname).join(' · ');else el.textContent=cname(iso)}catch{}}}

/* Give complex stories enough time for their scene plan. */
const oldDuration=G.storyDuration;G.storyDuration=n=>{const m=classify(n,G.resolveIso?.(n)||n?.countryIso3);if(m==='attack')return 23000;if(m==='alliance')return 22000;if(m==='multi-location')return 25000;if(m==='multi-country')return 21000;if(m==='location-chain')return 22000;return Math.max(oldDuration?.(n)||19000,19000)};
G.__stableNewsGlobeCandidate='V46';
console.info('[News Globe] V46 unified scene engine loaded');
})(window.NG14);