(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const txt=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
G.v36Entities=[];
const add=e=>{if(e)G.v36Entities.push(e);return e};
const clear36=()=>{for(const e of G.v36Entities||[])try{G.viewer.entities.remove(e)}catch{}G.v36Entities=[]};
const oldClearInteraction=G.clearInteractionEffects;G.clearInteractionEffects=()=>{clear36();if(typeof oldClearInteraction==='function')oldClearInteraction()};
const oldClearLocal=G.clearLocal;G.clearLocal=()=>{clear36();if(typeof oldClearLocal==='function')oldClearLocal()};
const oldClearCountry=G.clearCountry;G.clearCountry=()=>{clear36();if(typeof oldClearCountry==='function')oldClearCountry()};

/* ---------- attack-country flags ---------- */
const svg=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
const FLAGS={
 USA:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24" viewBox="0 0 38 24"><rect width="38" height="24" fill="#fff"/><g fill="#b22234"><rect y="0" width="38" height="2"/><rect y="4" width="38" height="2"/><rect y="8" width="38" height="2"/><rect y="12" width="38" height="2"/><rect y="16" width="38" height="2"/><rect y="20" width="38" height="2"/></g><rect width="16" height="12" fill="#3c3b6e"/><g fill="#fff"><circle cx="3" cy="3" r=".8"/><circle cx="7" cy="3" r=".8"/><circle cx="11" cy="3" r=".8"/><circle cx="5" cy="6" r=".8"/><circle cx="9" cy="6" r=".8"/><circle cx="13" cy="6" r=".8"/><circle cx="3" cy="9" r=".8"/><circle cx="7" cy="9" r=".8"/><circle cx="11" cy="9" r=".8"/></g></svg>'),
 RUS:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24"><rect width="38" height="8" fill="#fff"/><rect y="8" width="38" height="8" fill="#1c57a5"/><rect y="16" width="38" height="8" fill="#d52b1e"/></svg>'),
 IRN:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24"><rect width="38" height="8" fill="#239f40"/><rect y="8" width="38" height="8" fill="#fff"/><rect y="16" width="38" height="8" fill="#da0000"/><circle cx="19" cy="12" r="2.2" fill="#da0000"/></svg>'),
 CHN:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24"><rect width="38" height="24" fill="#de2910"/><path d="M7 4.3 8.3 8h4l-3.2 2.2 1.2 3.7L7 11.7l-3.3 2.2 1.2-3.7L1.7 8h4z" fill="#ffde00"/></svg>'),
 UKR:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24"><rect width="38" height="12" fill="#0057b7"/><rect y="12" width="38" height="12" fill="#ffd700"/></svg>'),
 ISR:svg('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="24"><rect width="38" height="24" fill="#fff"/><rect y="3" width="38" height="3" fill="#0038b8"/><rect y="18" width="38" height="3" fill="#0038b8"/><path d="m19 7 4 7h-8zM19 17l-4-7h8z" fill="none" stroke="#0038b8" stroke-width="1"/></svg>')
};
function flagEmoji(iso){iso=String(iso||'').toUpperCase();if(!/^[A-Z]{2,3}$/.test(iso))return'';const map={USA:'US',RUS:'RU',IRN:'IR',CHN:'CN',UKR:'UA',ISR:'IL',GBR:'GB',FRA:'FR',DEU:'DE',TUR:'TR'};const s=map[iso]||iso.slice(0,2);return String.fromCodePoint(...[...s].map(ch=>127397+ch.charCodeAt(0)))}
function addAttackFlag(info){
 const iso=String(info?.attackerIso||info?.sourceCountryIso3||G.news?.[G.current]?.sourceCountryIso3||'').toUpperCase();
 if(!iso||!valid(info?.sourceLon,info?.sourceLat))return;
 const img=FLAGS[iso];
 if(img){
   const carrier=String(info?.sourceType||'').toLowerCase()==='carrier';
   add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+info.sourceLon,+info.sourceLat,carrier?43000:35000),billboard:{image:img,width:carrier?17:18,height:carrier?11:12,pixelOffset:new C.Cartesian2(carrier?5:11,carrier?-9:-13),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
 }else{
   const em=flagEmoji(iso);if(em)add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+info.sourceLon,+info.sourceLat,43000),label:{text:em,font:'17px sans-serif',pixelOffset:new C.Cartesian2(8,-12),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
 }
}
const oldPotential=G.v29ShowPotential,oldMissile=G.v29ShowMissile,oldDrone=G.v29ShowDrone;
if(typeof oldPotential==='function')G.v29ShowPotential=info=>{oldPotential(info);addAttackFlag(info)};
if(typeof oldMissile==='function')G.v29ShowMissile=(n,info)=>{oldMissile(n,info);addAttackFlag(info)};
if(typeof oldDrone==='function')G.v29ShowDrone=(n,info)=>{oldDrone(n,info);addAttackFlag(info)};

/* ---------- geometry helpers: always fill the complete outer area ---------- */
function polygons(g){if(!g)return[];if(g.type==='Feature')return polygons(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polygons(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function outerHierarchy(poly,height=6500){const ring=poly?.[0]||[];if(ring.length<3)return null;return new C.PolygonHierarchy(ring.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],height)))}
function points(g){const out=[];for(const p of G.collect?.(g,[])||[])if(valid(p?.[0],p?.[1]))out.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));return out}
function center(g){try{return G.centerOf?.(g)||null}catch{return null}}
function label(text,lon,lat){if(!text||!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,43000),label:{text:String(text),font:'15px "Microsoft YaHei",sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.fromCssColorString('#200407'),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#33080d').withAlpha(.76),backgroundPadding:new C.Cartesian2(10,6),pixelOffset:new C.Cartesian2(0,-20),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
function drawFull(g,name,alpha=.24){
 G.clearCountry();G.clearLocal();clear36();
 const red=C.Color.fromCssColorString('#ff3e47');
 for(const p of polygons(g)){
   const h=outerHierarchy(p);if(!h)continue;
   add(G.viewer.entities.add({polygon:{hierarchy:h,perPositionHeight:true,material:red.withAlpha(alpha),outline:false}}));
   const pos=G.positions?.(p[0],16000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:3,material:new C.PolylineGlowMaterialProperty({glowPower:.22,color:C.Color.fromCssColorString('#ff747b').withAlpha(.98)})}}));
 }
 const c=center(g);if(c)label(name,c[0],c[1]);
}
async function flyFull(g,serial,mult=2.75){const ps=points(g);if(!ps.length)return false;const sp=C.BoundingSphere.fromPoints(ps),range=Math.max(180000,Math.min(9000000,sp.radius*mult));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:1.3,complete:r,cancel:r}));return serial===G.navSerial}

/* ---------- alliances: show all member states, not headquarters ---------- */
const ALLIANCES={
 '欧盟':{re:/欧盟|European Union|\bEU\b/i,members:['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE'],center:[10.5,50.5]},
 '北约':{re:/北约|NATO/i,members:['ALB','BEL','BGR','CAN','HRV','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL','ITA','LVA','LTU','LUX','MNE','NLD','MKD','NOR','POL','PRT','ROU','SVK','SVN','ESP','SWE','TUR','GBR','USA'],center:[15,52]},
 '东盟':{re:/东盟|ASEAN/i,members:['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','VNM'],center:[108,7]}
};
function allianceOf(n){const s=txt(n);for(const[name,a]of Object.entries(ALLIANCES))if(a.re.test(s)&&/政策|规则|禁令|出口|进口|成员国|联盟|共同|委员会|议会|制裁|关税|贸易|供应链|决定|拟/.test(s))return{name,...a};return null}
async function showAlliance(a,serial){
 G.clearCountry();G.clearLocal();clear36();try{G.clearSecondaryCountry?.()}catch{}
 const red=C.Color.fromCssColorString('#ff3e47'),allPts=[];
 for(const iso of a.members){const g=G.countries?.get?.(iso)?.feature?.geometry;if(!g)continue;for(const p of points(g))allPts.push(p);for(const poly of polygons(g)){const h=outerHierarchy(poly);if(!h)continue;add(G.viewer.entities.add({polygon:{hierarchy:h,perPositionHeight:true,material:red.withAlpha(.25),outline:false}}));const pos=G.positions?.(poly[0],16000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:2.7,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:C.Color.fromCssColorString('#ff747b').withAlpha(.97)})}}))}}
 if(valid(a.center?.[0],a.center?.[1]))label(a.name,a.center[0],a.center[1]);
 if(allPts.length){const sp=C.BoundingSphere.fromPoints(allPts),range=Math.max(1800000,Math.min(18000000,sp.radius*2.65));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:1.4,complete:r,cancel:r}))}
 return serial===G.navSerial?G.wait(3900,serial):false;
}

/* ---------- strict geographic regions ---------- */
const WEST_BANK={type:'Polygon',coordinates:[[[35.27,32.54],[35.39,32.52],[35.50,32.45],[35.56,32.32],[35.53,32.18],[35.49,32.05],[35.45,31.92],[35.49,31.78],[35.45,31.63],[35.40,31.49],[35.31,31.36],[35.22,31.35],[35.16,31.45],[35.13,31.59],[35.09,31.72],[35.12,31.86],[35.18,31.99],[35.19,32.12],[35.16,32.26],[35.20,32.40],[35.27,32.54]]]};
const GAZA={type:'Polygon',coordinates:[[[34.22,31.60],[34.31,31.60],[34.56,31.22],[34.49,31.22],[34.22,31.60]]]};
function builtInRegion(n){const s=txt(n);if(/约旦河西岸/.test(s))return{geometry:WEST_BANK,name:'约旦河西岸'};if(/加沙地带/.test(s))return{geometry:GAZA,name:'加沙地带'};return null}
function regionLike(n){return /生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|地带|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区|约旦河西岸|加沙地带|顿巴斯|戈兰高地|克里米亚/.test(txt(n))}
async function resolveRegion(n,iso){const bi=builtInRegion(n);if(bi)return bi;try{const res=await G.resolveArea?.(n,iso);if(res?.geometry&&polygons(res.geometry).length)return{geometry:res.geometry,name:String(n.focusLabel||n.location||'新闻区域')}}catch{}return null}
async function showRegion(n,iso,serial){const r=await resolveRegion(n,iso);if(serial!==G.navSerial)return false;if(!r)return false;drawFull(r.geometry,r.name,.24);if(!await flyFull(r.geometry,serial,3.0))return false;return G.wait(3800,serial)}

/* ---------- parent-first point semantics ---------- */
function isUniversity(n){return /大学|学院|学校/.test(String(n?.location||''))}
function isInstitution(n){if(isUniversity(n))return false;return /中央部门|政府部门|部委|政府机构|委员会|办公室|厅|局|部$/.test(String(n?.placeType||''))||/教育部|外交部|国防部|商务部|国家发改委|委员会/.test(String(n?.location||''))}
function provinceStep(st){return /省|自治区|直辖市|province|state/i.test(String(st?.placeType||''))}
function cityStep(st){return /市|自治州|地区|州|prefecture|city/i.test(String(st?.placeType||''))&&!/省|自治区|直辖市/.test(String(st?.placeType||''))}
function chinaLevel1(name){const key=String(name||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g,'');for(const f of G.chinaLevel1Geo?.features||[]){const p=JSON.stringify(f.properties||{});if(p.includes(name)||(key&&p.includes(key)))return f}return null}
async function showAdminFull(st,iso,serial){
 let g=null;
 if(String(iso||'').toUpperCase()==='CHN'&&provinceStep(st))g=chinaLevel1(st.location)?.geometry||null;
 if(!g)try{g=(await G.resolveArea?.(st,iso))?.geometry||null}catch{}
 if(g&&polygons(g).length){const name=/新疆/.test(st.location)?'新疆维吾尔自治区':/台湾/.test(st.location)?'台湾省':String(st.focusLabel||st.location);drawFull(g,name,.22);if(!await flyFull(g,serial,3.05))return false;await G.wait(1850,serial);return true}
 const ok=await G.flashAdmin?.(st,iso,serial,1850);return ok!==false;
}
function pointLabel(n){const s=String(n?.location||'').replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g,'').replace(/[A-Za-z][A-Za-z0-9._\-/ ]*/g,'').trim();return s||'新闻地点'}
async function pointFinal(n,serial){G.clearCountry();G.clearLocal();const lon=+n.lon,lat=+n.lat;if(!valid(lon,lat))return false;await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(280000,+n.pointHeight||430000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15,complete:r,cancel:r}));if(serial!==G.navSerial)return false;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,32000),point:{pixelSize:10,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2.2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));label(pointLabel(n),lon,lat);return G.wait(3500,serial)}
async function hierarchicalPoint(n,iso,serial,mode){
 const steps=G.adminSteps?.(n)||[];
 const selected=[];
 const p=steps.find(provinceStep);if(p)selected.push(p);
 if(mode==='university'){const c=steps.find(cityStep);if(c&&!selected.some(x=>x.location===c.location))selected.push(c)}
 for(const st of selected){if(serial!==G.navSerial)return false;const ok=await showAdminFull(st,iso,serial);if(ok===false)return false}
 return pointFinal(n,serial);
}

/* ---------- routing priority ---------- */
const oldRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 const alliance=allianceOf(n);if(alliance)return showAlliance(alliance,serial);
 if(isInstitution(n))return hierarchicalPoint(n,iso,serial,'institution');
 if(isUniversity(n))return hierarchicalPoint(n,iso,serial,'university');
 const bi=builtInRegion(n);if(bi)return showRegion(n,iso,serial);
 return oldRun(n,iso,serial);
};

console.info('[News Globe] V36 semantic coverage loaded');
})(window.NG14);