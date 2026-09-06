(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
if(G.__v45SemanticStageFix)return;G.__v45SemanticStageFix=true;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const wait=(ms,serial)=>G.wait?G.wait(ms,serial):new Promise(r=>setTimeout(r,ms));
const txt=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);
const strictRegion=n=>/生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区|约旦河西岸|加沙地带|顿巴斯|戈兰高地|克里米亚/.test(txt(n));
const pointFinal=n=>!strictRegion(n)&&(/城市|会晤城市|会谈城市|联合演习城市|机场|港口|离港点|会场|总部|大学|学院|医院|学校|机构|设施|大会会场/.test(String(n?.placeType||''))||/机场|港|大学|学院|医院|会场|总部/.test(String(n?.location||'')));

G.v45Entities=[];
const add=e=>{if(e)G.v45Entities.push(e);return e};
function clear45(){for(const e of G.v45Entities||[])try{G.viewer?.entities?.remove(e)}catch{}G.v45Entities=[]}
function clearScene(){clear45();try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}}

function polys(g){if(!g)return[];if(g.type==='Feature')return polys(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polys(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function points(g){const out=[];for(const p of G.collect?.(g,[])||[])if(valid(p?.[0],p?.[1]))out.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));return out}
function bbox(g){const a=G.collect?.(g,[])||[];let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const p of a){if(!valid(p?.[0],p?.[1]))continue;w=Math.min(w,+p[0]);e=Math.max(e,+p[0]);s=Math.min(s,+p[1]);n=Math.max(n,+p[1])}return Number.isFinite(w)?[w,s,e,n]:null}
function hierarchy(poly,h=7200){const ring=poly?.[0]||[];if(ring.length<3)return null;return new C.PolygonHierarchy(ring.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],h)))}
function countryFeatures(iso){iso=String(iso||'').toUpperCase();if(iso==='CHN'&&Array.isArray(G.chinaLevel1Geo?.features))return G.chinaLevel1Geo.features;const f=G.countries?.get?.(iso)?.feature;return f?[f]:[]}
const ZH={CHN:'中华人民共和国',RUS:'俄罗斯',DEU:'德国',THA:'泰国',USA:'美国',UKR:'乌克兰',IRN:'伊朗',EGY:'埃及',SGP:'新加坡',AUT:'奥地利'};
function countryLabel(iso){return ZH[String(iso||'').toUpperCase()]||G.countryName?.(iso)||String(iso||'')}
function label(text,lon,lat,mode='country'){if(!text||!valid(lon,lat))return;const e=G.label?.(String(text),+lon,+lat,mode);if(e)add(e)}
function drawGeom(g,color,alpha=.22,width=2.3){for(const poly of polys(g)){const h=hierarchy(poly);if(!h)continue;add(G.viewer.entities.add({polygon:{hierarchy:h,height:7200,perPositionHeight:false,arcType:C.ArcType.GEODESIC,material:color.withAlpha(alpha),outline:false}}));const pos=G.positions?.(poly[0],18000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width,material:new C.PolylineGlowMaterialProperty({glowPower:.18,color:color.withAlpha(.96)})}}))}}
async function flyToPoints(arr,serial,min=1800000,max=24000000,factor=2.7){if(!arr.length)return false;const sp=C.BoundingSphere.fromPoints(arr);const range=Math.max(min,Math.min(max,sp.radius*factor));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.35,complete:r,cancel:r}));return serial===G.navSerial}
async function showCountryWhole(n,iso,serial,hold=1300){clearScene();iso=String(iso||n?.countryIso3||'').toUpperCase();const feats=countryFeatures(iso);if(!feats.length)return false;const red=C.Color.fromCssColorString('#ff3b45'),pts=[];for(const f of feats){drawGeom(f.geometry,red,.23,2.5);pts.push(...points(f.geometry))}const c=G.countries?.get?.(iso)?.center||G.centerOf?.(feats[0]?.geometry);if(c)label(countryLabel(iso),c[0],c[1]);if(!await flyToPoints(pts,serial,1800000,15000000,2.65))return false;await wait(hold,serial);return serial===G.navSerial}
async function showCountryGroup(isos,serial,hold=2300,allRed=false){clearScene();const uniq=[...new Set((isos||[]).map(x=>String(x||'').toUpperCase()).filter(Boolean))],pts=[];for(let i=0;i<uniq.length;i++){const iso=uniq[i],features=countryFeatures(iso),color=(allRed||i===0)?C.Color.fromCssColorString('#ff3b45'):C.Color.fromCssColorString('#43aefe');for(const f of features){drawGeom(f.geometry,color,(allRed||i===0)?.21:.18,2.2);pts.push(...points(f.geometry))}if(!allRed){const c=G.countries?.get?.(iso)?.center||G.centerOf?.(features[0]?.geometry);if(c)label(countryLabel(iso),c[0],c[1],i===0?'country':'secondary-country')}}if(!await flyToPoints(pts,serial,2500000,26000000,2.75))return false;await wait(hold,serial);return serial===G.navSerial}

/* Land-only Chon Buri province boundary. Avoids OSM administrative maritime polygons that cover a large Gulf area. */
const CHON_BURI={type:'Polygon',coordinates:[[[101.7201309,13.1797104],[101.6984787,13.1512289],[101.6479568,13.1630716],[101.5889130,13.1181908],[101.5581360,13.0717993],[101.5277023,13.0736504],[101.4649658,13.0322609],[101.4383469,13.0508404],[101.4229202,13.0378418],[101.3811798,13.0375709],[101.3267517,13.0823927],[101.2733231,13.0564289],[101.2378311,13.0639496],[101.1964493,13.0867214],[101.1745758,13.0718403],[101.1712189,13.0451307],[101.1016922,13.0451202],[101.0686722,13.0050802],[101.0916824,12.9970093],[101.0901031,12.9149008],[101.0666580,12.8608494],[101.0577469,12.8238106],[101.0147018,12.7856493],[101.0046997,12.7335119],[100.9856033,12.6911516],[100.9926758,12.6558781],[100.9683533,12.6441603],[100.9627762,12.6013927],[100.9188309,12.6203022],[100.9295197,12.6467018],[100.9026566,12.6624117],[100.8615189,12.6521807],[100.8575668,12.67486],[100.8340073,12.7134304],[100.8398666,12.7508507],[100.8703308,12.7698822],[100.9027786,12.7777767],[100.9134903,12.8071299],[100.8935394,12.8643589],[100.8557587,12.9104900],[100.8835526,12.9394178],[100.8824997,12.9680595],[100.9176712,12.9853611],[100.9279785,13.01031],[100.9147186,13.0447226],[100.8911133,13.0424986],[100.8719482,13.0769405],[100.8788910,13.1099997],[100.9250031,13.1705542],[100.9358368,13.2047215],[100.9274979,13.2577791],[100.9009628,13.2991409],[100.9239197,13.3393154],[100.9758301,13.3591661],[100.9838867,13.3938913],[100.9669418,13.4347219],[100.9787369,13.4701347],[101.0081024,13.4626894],[101.0343628,13.4960814],[101.0718994,13.5173607],[101.0562973,13.5517206],[101.0951691,13.5527010],[101.1306076,13.5692797],[101.1427917,13.5926304],[101.1677094,13.5977507],[101.1909027,13.5843306],[101.2740402,13.5567789],[101.3242722,13.4967918],[101.3678589,13.4576502],[101.4263763,13.4516697],[101.4261627,13.4296513],[101.4534540,13.4065218],[101.4974976,13.4185219],[101.5483169,13.3964710],[101.5652313,13.3310299],[101.6008530,13.3020220],[101.6407166,13.2920208],[101.6687927,13.2723217],[101.7201309,13.1797104]]]};
function chinaL1(name){const key=String(name||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市/g,'');for(const f of G.chinaLevel1Geo?.features||[]){const vals=Object.values(f.properties||{}).map(String);if(vals.includes(String(name))||vals.some(v=>key&&v.includes(key)))return f}return null}
function sane(g,step){const b=bbox(g);if(!b)return false;const dx=b[2]-b[0],dy=b[3]-b[1],t=String(step?.placeType||'');let mx=8,my=8,lim=4;if(/省|自治区|直辖市|特别行政区|州$|府$|province|state/i.test(t)){mx=18;my=18;lim=8}else if(/市|城市|地区|自治州|prefecture|city/i.test(t)){mx=6;my=6;lim=3}else if(/县|区|county|district/i.test(t)){mx=3;my=3;lim=1.6}if(dx>mx||dy>my)return false;const lon=+step?.lon,lat=+step?.lat;if(valid(lon,lat)){try{if(G.pointInGeom?.(lon,lat,g))return true}catch{}const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,d=Math.hypot((cx-lon)*Math.cos(lat*Math.PI/180),cy-lat);if(d>lim)return false}return true}
async function adminGeometry(step,iso,parents,n){const name=String(step?.focusLabel||step?.location||'').trim(),type=String(step?.placeType||'');if(!name)return null;if(/春武里府|Chon\s*Buri/i.test(name))return CHON_BURI;if(String(iso).toUpperCase()==='CHN'&&/省|自治区|直辖市|特别行政区/.test(type)){const f=chinaL1(step.location||name);if(f?.geometry)return f.geometry}const country=String(n?.country||'');const queries=[];if(parents.length)queries.push(parents.join('')+name);queries.push(name);for(const loc of queries){try{const q=new URLSearchParams({location:loc,placeType:type||'地区',country,countryIso3:String(iso||''),lon:String(step?.lon??n?.lon??''),lat:String(step?.lat??n?.lat??'')});const r=await fetch('/api/geo-highlight?'+q,{cache:'no-store'});if(!r.ok)continue;const j=await r.json();if(j?.geometry&&!j?.approximate&&sane(j.geometry,step))return j.geometry}catch{}}return null}
async function showAdmin(step,iso,serial,parents,n){const name=String(step?.focusLabel||step?.location||''),g=await adminGeometry(step,iso,parents,n);if(serial!==G.navSerial)return false;if(!g)return false;clearScene();const red=C.Color.fromCssColorString('#ff3b45');drawGeom(g,red,.21,2.55);const c=G.centerOf?.(g);if(c)label(name,c[0],c[1]);if(!await flyToPoints(points(g),serial,240000,6500000,2.55))return false;await wait(1450,serial);return serial===G.navSerial}

const carrierSvg='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="170" height="62" viewBox="0 0 170 62"><path d="M8 34 31 10h107l25 19-15 27H27z" fill="#8d9aa0" stroke="#eff8fb" stroke-width="2"/><path d="M38 31h102M80 13v38" stroke="#fff" stroke-width="1" opacity=".75"/><rect x="122" y="14" width="18" height="15" fill="#40525b"/></svg>');
const flagIso2={USA:'us',THA:'th',CHN:'cn',RUS:'ru',DEU:'de',SGP:'sg',EGY:'eg'};
function addCarrierAt(n){if(n?.displayMode!=='carrier-port'||!valid(n?.lon,n?.lat))return;const lon=+n.lon,lat=+n.lat;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,41000),billboard:{image:carrierSvg,width:42,height:15,pixelOffset:new C.Cartesian2(0,11),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));const cc=flagIso2[String(n?.platformCountryIso3||'USA').toUpperCase()];if(cc)add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,56000),billboard:{image:'https://flagcdn.com/w40/'+cc+'.png',width:21,height:13,pixelOffset:new C.Cartesian2(0,-8),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
async function showPoint(n,serial){clearScene();if(!valid(n?.lon,n?.lat))return false;const lon=+n.lon,lat=+n.lat;await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(250000,+n.pointHeight||390000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15,complete:r,cancel:r}));if(serial!==G.navSerial)return false;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,31000),point:{pixelSize:10,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));label(String(n?.focusLabel||n?.location||'新闻地点').replace(/所在区域|所在地区/g,''),lon,lat);addCarrierAt(n);await wait(3300,serial);return serial===G.navSerial}

const OPEC_PLUS=['DZA','COG','GNQ','GAB','IRN','IRQ','KWT','LBY','NGA','SAU','ARE','VEN','AZE','BHR','BRN','KAZ','MYS','MEX','OMN','RUS','SSD','SDN'];
async function showOpec(serial){const ok=await showCountryGroup(OPEC_PLUS,serial,3200,true);if(!ok)return false;label('OPEC+',48,31);await wait(1200,serial);return serial===G.navSerial}

if(typeof G.storyUI==='function'){
 const oldUI=G.storyUI;G.storyUI=(n,iso)=>{oldUI(n,iso);try{if(n?.displayCountriesLabel&&G.$?.('country'))G.$('country').textContent=n.displayCountriesLabel}catch{}};
}

const prevRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 iso=String(iso||n?.countryIso3||'').toUpperCase();
 clear45();
 if(warLike(n))return prevRun(n,iso,serial);
 if(n?.displayMode==='alliance'&&String(n?.alliance||'').toUpperCase()==='OPEC+')return showOpec(serial);
 if(n?.displayMode==='dual-diplomatic')return showCountryGroup(n.relatedCountryIso3s||[iso,n.secondaryCountryIso3],serial,4300,false);
 if(n?.displayMode==='city-point'&&!Array.isArray(n?.adminChain)){if(!await showCountryWhole(n,iso,serial,1500))return false;return showPoint(n,serial)}
 const chain=Array.isArray(n?.adminChain)?n.adminChain.filter(Boolean):[];
 if(chain.length&&pointFinal(n)){
   const related=Array.isArray(n.relatedCountryIso3s)?n.relatedCountryIso3s.filter(Boolean):[];
   if(related.length>1){if(!await showCountryGroup(related,serial,1900,false))return false}
   if(!await showCountryWhole(n,iso,serial,1250))return false;
   const parents=[];
   for(const st of chain){if(serial!==G.navSerial)return false;const ok=await showAdmin(st,iso,serial,parents,n);if(!ok){console.warn('[V45] rejected inaccurate admin geometry:',st?.location);break}parents.push(String(st?.location||st?.focusLabel||''))}
   if(serial!==G.navSerial)return false;
   return showPoint(n,serial);
 }
 return prevRun(n,iso,serial);
};
G.__stableNewsGlobeVersion='V45';
console.info('[News Globe] V45 semantic stage fix loaded');
})(window.NG14);
