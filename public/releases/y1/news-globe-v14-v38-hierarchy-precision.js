(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const text=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
const wait=(ms,serial)=>G.wait?G.wait(ms,serial):new Promise(r=>setTimeout(r,ms));
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);

function clean(){try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}}
function pointsOf(g){return (G.collect?.(g,[])||[]).filter(p=>valid(p?.[0],p?.[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0))}
function sphereOfGeometry(g){const pts=pointsOf(g);return pts.length?C.BoundingSphere.fromPoints(pts):null}
function chinaSphere(){if(!Array.isArray(G.chinaLevel1Geo?.features))return null;const pts=[];for(const f of G.chinaLevel1Geo.features)for(const p of pointsOf(f.geometry))pts.push(p);return pts.length?C.BoundingSphere.fromPoints(pts):null}
async function showCountryWhole(n,iso,serial,hold=1650){
 iso=String(iso||n?.countryIso3||'').toUpperCase();if(!iso)return false;
 clean();
 if(!G.flashCountry?.(iso,n))return false;
 G.blinkCountryBorder?.(iso,4,210);
 const c=G.countries?.get?.(iso);const sp=iso==='CHN'?(chinaSphere()||c?.sphere):c?.sphere;
 if(sp)await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),Math.max(1800000,Math.min(15000000,sp.radius*2.65))),duration:1.3,complete:r,cancel:r}));
 if(serial!==G.navSerial)return false;
 await wait(hold,serial);return serial===G.navSerial;
}

function norm(s){return String(s||'').replace(/中华人民共和国|中国/g,'').replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|直辖市|地区|自治州|州|市|区|县/g,'').replace(/\s+/g,'').trim()}
function chinaL1Exact(name){
 const target=String(name||'').trim(),key=norm(target);if(!target||!key)return null;
 for(const f of G.chinaLevel1Geo?.features||[]){const vals=Object.values(f.properties||{}).filter(v=>typeof v==='string'||typeof v==='number').map(v=>String(v).trim());if(vals.includes(target))return f;for(const v of vals){if(norm(v)===key)return f}}
 return null;
}
function bbox(g){const p=G.collect?.(g,[])||[];if(!p.length)return null;let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const c of p){if(!valid(c?.[0],c?.[1]))continue;w=Math.min(w,+c[0]);s=Math.min(s,+c[1]);e=Math.max(e,+c[0]);n=Math.max(n,+c[1])}return Number.isFinite(w)?[w,s,e,n]:null}
function reasonable(g,lon,lat,type){const b=bbox(g);if(!b)return false;const[w,s,e,n]=b,dx=Math.abs(e-w),dy=Math.abs(n-s);if(/区|县/.test(type||'')){if(dx>5||dy>5)return false}else if(/市|地区|州/.test(type||'')){if(dx>12||dy>12)return false}else if(/省|自治区|直辖市/.test(type||'')){if(dx>35||dy>35)return false}if(valid(lon,lat)){try{if(G.pointInGeom?.(+lon,+lat,g))return true}catch{}const cx=(w+e)/2,cy=(s+n)/2,d=Math.hypot((cx-+lon)*Math.cos(+lat*Math.PI/180),cy-+lat);const lim=/省|自治区|直辖市/.test(type||'')?8:/市|地区|州/.test(type||'')?3.5:1.8;if(d>lim)return false}return true}
async function queryExact(names,step,iso,parentNames=[]){
 const expectedLon=Number(step?.lon),expectedLat=Number(step?.lat);const country=String(G.news?.[G.current]?.country||'');
 const queries=[];for(const nm of names.filter(Boolean)){const base=String(nm).trim();if(parentNames.length)queries.push(parentNames.join('')+base);queries.push(base)}
 const seen=new Set();
 for(const qloc of queries){if(seen.has(qloc))continue;seen.add(qloc);try{const q=new URLSearchParams({location:qloc,placeType:String(step?.placeType||'地区'),country,countryIso3:String(iso||''),lon:Number.isFinite(expectedLon)?String(expectedLon):'',lat:Number.isFinite(expectedLat)?String(expectedLat):''});const r=await fetch('/api/geo-highlight?'+q,{cache:'force-cache'});if(!r.ok)continue;const j=await r.json();if(j?.approximate||!j?.geometry)continue;if(!reasonable(j.geometry,expectedLon,expectedLat,step?.placeType))continue;return j.geometry}catch{}}
 return null;
}
async function showGeometry(g,label,serial,hold=1500){if(!g)return false;G.clearCountry?.();G.clearLocal?.();const fake={location:label,focusLabel:label,placeType:'地区'};G.drawAdminArea?.(g,fake,120);const p=G.centerOf?.(g);if(p)G.localLabelEntity=G.label?.(label,p[0],p[1],'country');G.flyArea?.({geometry:g},fake,serial,'admin');await wait(hold,serial);return serial===G.navSerial}
async function showAdminStrict(step,iso,serial,parents=[]){if(!step)return true;const name=String(step.focusLabel||step.location||'').trim(),type=String(step.placeType||'地区');if(!name)return true;
 let g=null;
 if(String(iso).toUpperCase()==='CHN'&&/省|自治区|直辖市/.test(type))g=chinaL1Exact(step.location||name)?.geometry||null;
 if(!g)g=await queryExact([step.location,name],step,iso,parents);
 if(serial!==G.navSerial)return false;
 if(g)return showGeometry(g,name,serial,1550);
 /* Never jump to a similarly named place: safe point fallback at the supplied coordinates. */
 if(valid(step.lon,step.lat)){G.clearCountry?.();G.clearLocal?.();const lon=+step.lon,lat=+step.lat;G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,/省|自治区|直辖市/.test(type)?1800000:/市|地区|州/.test(type)?850000:480000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15});await wait(750,serial);if(serial!==G.navSerial)return false;G.localLabelEntity=G.label?.(name,lon,lat,'country');await wait(1100,serial);G.clearLocal?.();return true}
 return false;
}

/* West Bank: first request an exact boundary; if unavailable, use the West Bank component of Natural Earth's Palestine geometry instead of a hand-drawn approximation. */
function westBankFromPSE(){const g=G.countries?.get?.('PSE')?.feature?.geometry;if(!g)return null;if(g.type==='Polygon')return g;if(g.type!=='MultiPolygon')return null;let best=null,bestScore=-Infinity;for(const p of g.coordinates||[]){const gg={type:'Polygon',coordinates:p},b=bbox(gg);if(!b)continue;const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;const contains=G.pointInGeom?.(35.25,31.95,gg)?100:0;const score=contains+cx*2-Math.abs(cy-31.95);if(score>bestScore){bestScore=score;best=gg}}return best}
function westBankReasonable(g){const b=bbox(g);if(!b)return false;return b[0]>34.75&&b[2]<35.85&&b[1]>31.15&&b[3]<32.75&&G.pointInGeom?.(35.25,31.95,g)}
async function exactWestBank(){const aliases=['约旦河西岸','West Bank','West Bank, Palestine'];for(const loc of aliases){try{const q=new URLSearchParams({location:loc,placeType:'地区',country:'Palestine',countryIso3:'PSE',lon:'35.25',lat:'31.95'});const r=await fetch('/api/geo-highlight?'+q,{cache:'force-cache'});if(!r.ok)continue;const j=await r.json();if(j?.geometry&&!j?.approximate&&westBankReasonable(j.geometry))return j.geometry}catch{}}return westBankFromPSE()}
async function showWestBank(n,serial){const g=await exactWestBank();if(serial!==G.navSerial)return false;if(!g)return false;G.clearCountry?.();G.clearLocal?.();const fake={location:'约旦河西岸',focusLabel:'约旦河西岸',placeType:'地区'};G.drawAdminArea?.(g,fake,100);const p=G.centerOf?.(g);if(p)G.localLabelEntity=G.label?.('约旦河西岸',p[0],p[1],'country');G.flyArea?.({geometry:g},fake,serial,'admin');await wait(3400,serial);return serial===G.navSerial}

function adminChain(n){return Array.isArray(n?.adminChain)?n.adminChain.filter(Boolean):[]}
function isInstitutionOrPlace(n){const s=text(n),t=String(n?.placeType||'');return /中央部门|政府机构|政府部门|部委|机构|单位|学校|大学|学院|医院|使馆|大使馆|领馆|领事馆|法院|委员会|办公室|大会会场|会场/.test(t)||/教育部|外交部|国防部|商务部|大学|学院|医院|大使馆|领事馆/.test(s)}
function isEnterpriseStop(n){return /企业总部区域|总部所在区域|总部区域|企业总部/.test(text(n))}
function isRegionFinal(n){return /生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区/.test(text(n))}
function nationalOnly(n,iso){if(String(iso).toUpperCase()==='CHN'&&(n?.countryOnly===true||String(n?.placeType)==='国家'||String(n?.region)==='全国'))return true;return false}
function pointLabel(n){if(/教育部/.test(text(n)))return'教育部';return String(n?.location||n?.focusLabel||'新闻地点').replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g,'').replace(/[A-Za-z][A-Za-z0-9._\-/ ]*/g,'').replace(/所在区域|所在地区/g,'').trim()||'新闻地点'}
async function showPoint(n,serial){G.clearCountry?.();G.clearLocal?.();if(!valid(n?.lon,n?.lat))return false;const lon=+n.lon,lat=+n.lat;G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(260000,+n.pointHeight||420000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15});await wait(800,serial);if(serial!==G.navSerial)return false;const e=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,30000),point:{pixelSize:9.5,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});G.localHighlightEntities?.push(e);G.localLabelEntity=G.label?.(pointLabel(n),lon,lat,'country');return wait(3200,serial)}
async function showFinalRegion(n,iso,serial,parents){const names=[n?.focusLabel,n?.location,n?.region].filter(Boolean);const g=await queryExact(names,{location:n.location,focusLabel:n.focusLabel,placeType:n.placeType,lon:n.lon,lat:n.lat},iso,parents);if(serial!==G.navSerial)return false;if(!g)return false;return showGeometry(g,String(n.focusLabel||n.location||'区域'),serial,3300)}

const prevRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 iso=String(iso||n?.countryIso3||'').toUpperCase();
 if(warLike(n))return prevRun(n,iso,serial);
 /* Alliance handling from V37 stays intact and takes priority over country wording in the story. */
 if(/欧盟|北约|NATO|东盟|ASEAN|海合会|GCC/i.test(text(n)))return prevRun(n,iso,serial);
 if(/约旦河西岸/.test(text(n)))return showWestBank(n,serial);
 if(nationalOnly(n,iso))return showCountryWhole(n,iso,serial,4200);
 const chain=adminChain(n);
 if(chain.length){
   if(!await showCountryWhole(n,iso,serial,1400))return false;
   const parents=[];
   for(const st of chain){if(serial!==G.navSerial)return false;const ok=await showAdminStrict(st,iso,serial,parents);if(!ok)return false;parents.push(String(st.location||st.focusLabel||''));}
   if(isEnterpriseStop(n))return wait(2600,serial);
   if(isInstitutionOrPlace(n))return showPoint(n,serial);
   if(isRegionFinal(n)){const ok=await showFinalRegion(n,iso,serial,parents);if(ok)return ok;return wait(2500,serial)}
   return prevRun(n,iso,serial);
 }
 /* Generic province/state/city stories without an explicit chain: country first, then the verified subdivision. */
 if(/省|州|自治区|直辖市|市|县|区/.test(String(n?.placeType||''))&&!/国家/.test(String(n?.placeType||''))){if(!await showCountryWhole(n,iso,serial,1400))return false;const step={location:n.location,focusLabel:n.focusLabel||n.location,placeType:n.placeType,lon:n.lon,lat:n.lat};return showAdminStrict(step,iso,serial,[])}
 return prevRun(n,iso,serial);
};
console.info('[News Globe] V38 hierarchy + precision fix loaded');
})(window.NG14);
