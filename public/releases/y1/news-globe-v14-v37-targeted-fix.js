(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const storyText=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);

G.v37Entities=[];
const add=e=>{if(e)G.v37Entities.push(e);return e};
const clear37=()=>{for(const e of G.v37Entities||[])try{G.viewer.entities.remove(e)}catch{}G.v37Entities=[]};
const oldClearLocal=G.clearLocal;G.clearLocal=()=>{clear37();if(typeof oldClearLocal==='function')oldClearLocal()};
const oldClearCountry=G.clearCountry;G.clearCountry=()=>{clear37();if(typeof oldClearCountry==='function')oldClearCountry()};
const oldClearInteraction=G.clearInteractionEffects;G.clearInteractionEffects=()=>{clear37();if(typeof oldClearInteraction==='function')oldClearInteraction()};

const iso2={USA:'US',RUS:'RU',IRN:'IR',ISR:'IL',UKR:'UA',CHN:'CN',GBR:'GB',FRA:'FR',DEU:'DE',TUR:'TR',IND:'IN',PAK:'PK',SAU:'SA',ARE:'AE',YEM:'YE',LBN:'LB',SYR:'SY',IRQ:'IQ',JOR:'JO',JPN:'JP',KOR:'KR',PRK:'KP',CAN:'CA',AUS:'AU',POL:'PL',NLD:'NL',BEL:'BE'};
const flagUrl=iso=>{const cc=iso2[String(iso||'').toUpperCase()];return cc?'https://flagcdn.com/w40/'+cc.toLowerCase()+'.png':''};
function addFlag(iso,lon,lat,carrier=false){const img=flagUrl(iso);if(!img||!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,56000),billboard:{image:img,width:carrier?17:18,height:carrier?11:12,pixelOffset:new C.Cartesian2(carrier?0:13,carrier?-9:-12),verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
function addAttackFlags(n,info){if(!info)return;const iso=String(n?.sourceCountryIso3||info.attackerIso||'').toUpperCase();if(!iso)return;if(info.sourceType==='carrier')addFlag(iso,info.sourceLon,info.sourceLat,true);else if(n?.attackType)addFlag(iso,info.sourceLon,info.sourceLat,false)}

const oldPotential=G.v29ShowPotential;
if(typeof oldPotential==='function')G.v29ShowPotential=(info)=>{oldPotential(info);const n=G.news?.[G.current];addAttackFlags(n,info)};
const oldMissile=G.v29ShowMissile;
if(typeof oldMissile==='function')G.v29ShowMissile=(n,info)=>{oldMissile(n,info);addAttackFlags(n,info)};
const oldDrone=G.v29ShowDrone;
if(typeof oldDrone==='function')G.v29ShowDrone=(n,info)=>{oldDrone(n,info);addAttackFlags(n,info)};
if(G.v29ShowMissile)G.showMissileEffect=(n,info)=>G.v29ShowMissile(n,info||G.v29AttackInfo?.(n,n?.countryIso3||''));
if(G.v29ShowDrone)G.showDroneEffect=(n,info)=>G.v29ShowDrone(n,info||G.v29AttackInfo?.(n,n?.countryIso3||''));

function polygons(g){if(!g)return[];if(g.type==='Feature')return polygons(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(f=>polygons(f));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function outerHierarchy(poly,h=7000){const ring=poly?.[0]||[];if(ring.length<3)return null;return new C.PolygonHierarchy(ring.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],h)))}
function collectPoints(g){const out=[];for(const p of G.collect?.(g,[])||[])if(valid(p?.[0],p?.[1]))out.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));return out}
function mapLabel(text,lon,lat){if(!text||!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,52000),label:{text:String(text),font:'14px "Microsoft YaHei",sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.fromCssColorString('#160307').withAlpha(.96),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#2a060b').withAlpha(.74),backgroundPadding:new C.Cartesian2(10,6),pixelOffset:new C.Cartesian2(0,-28),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
function brightPoint(lon,lat,label){if(!valid(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,30000),point:{pixelSize:9.5,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,800),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>11000+((Math.sin((G.pulsePhase||0)*2.2)+1)/2)*19000,false),semiMinorAxis:new C.CallbackProperty(()=>11000+((Math.sin((G.pulsePhase||0)*2.2)+1)/2)*19000,false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString('#ff3038').withAlpha(.12),false)),outline:true,outlineColor:C.Color.fromCssColorString('#ff666b').withAlpha(.65)}}));if(label)mapLabel(label,lon,lat)}
function drawGeometry(g,label,alpha=.23){G.clearCountry();G.clearLocal();clear37();const red=C.Color.fromCssColorString('#ff3b45');for(const poly of polygons(g)){const h=outerHierarchy(poly,7200);if(!h)continue;add(G.viewer.entities.add({polygon:{hierarchy:h,height:7200,perPositionHeight:false,arcType:C.ArcType.GEODESIC,material:red.withAlpha(alpha),outline:false}}));const pos=G.positions?.(poly[0],18000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:2.7,material:new C.PolylineGlowMaterialProperty({glowPower:.2,color:C.Color.fromCssColorString('#ff737a').withAlpha(.98)})}}))}const c=G.centerOf?.(g);if(c&&label)mapLabel(label,c[0],c[1])}
async function flyGeometry(g,serial,factor=2.65){const pts=collectPoints(g);if(!pts.length)return false;const sp=C.BoundingSphere.fromPoints(pts),range=Math.max(120000,Math.min(7600000,sp.radius*factor));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),range),duration:1.3,complete:r,cancel:r}));return serial===G.navSerial}

const ALLIANCES={
'欧盟':{re:/欧盟|European Union|\bEU\b/i,members:['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE']},
'NATO':{re:/北约|NATO/i,members:['ALB','BEL','BGR','CAN','HRV','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL','ITA','LVA','LTU','LUX','MNE','NLD','MKD','NOR','POL','PRT','ROU','SVK','SVN','ESP','SWE','TUR','GBR','USA']},
'东盟':{re:/东盟|ASEAN/i,members:['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','TLS','VNM']},
'海合会':{re:/海合会|GCC/i,members:['BHR','KWT','OMN','QAT','SAU','ARE']}
};
function allianceOf(n){const s=storyText(n);if(!/政策|法规|禁令|出口|进口|关税|贸易|制裁|规定|规则|委员会|议会|成员国|供应链|决定|批准|通过|拟扩大|拟实施/.test(s))return null;for(const[name,o]of Object.entries(ALLIANCES))if(o.re.test(s))return{name,...o};return null}
async function showAlliance(a,serial){G.clearCountry();G.clearLocal();clear37();const red=C.Color.fromCssColorString('#ff3b45'),pts=[];for(const iso of a.members){const c=G.countries?.get?.(iso);if(!c?.feature?.geometry)continue;for(const p of collectPoints(c.feature.geometry))pts.push(p);for(const poly of polygons(c.feature.geometry)){const h=outerHierarchy(poly,7200);if(!h)continue;add(G.viewer.entities.add({polygon:{hierarchy:h,height:7200,perPositionHeight:false,material:red.withAlpha(.22),outline:false}}));const pos=G.positions?.(poly[0],18000)||[];if(pos.length)add(G.viewer.entities.add({polyline:{positions:pos,width:2.45,material:new C.PolylineGlowMaterialProperty({glowPower:.18,color:C.Color.fromCssColorString('#ff737a').withAlpha(.97)})}}))}}if(pts.length){const sp=C.BoundingSphere.fromPoints(pts);await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),Math.max(2500000,sp.radius*2.55)),duration:1.4,complete:r,cancel:r}));if(serial!==G.navSerial)return false;const cart=C.Cartographic.fromCartesian(sp.center),lon=C.Math.toDegrees(cart.longitude),lat=C.Math.toDegrees(cart.latitude);mapLabel(a.name,lon,lat)}return G.wait(3600,serial)}

const WEST_BANK={type:'Polygon',coordinates:[[[35.57,32.53],[35.49,32.43],[35.54,32.34],[35.48,32.25],[35.43,32.16],[35.46,32.04],[35.39,31.91],[35.48,31.80],[35.52,31.66],[35.54,31.53],[35.49,31.39],[35.41,31.36],[35.34,31.45],[35.29,31.55],[35.24,31.67],[35.17,31.80],[35.15,31.93],[35.18,32.05],[35.20,32.16],[35.18,32.26],[35.23,32.37],[35.31,32.47],[35.41,32.54],[35.50,32.55],[35.57,32.53]]]};
function customRegion(n){const s=storyText(n);if(/约旦河西岸/.test(s))return{label:'约旦河西岸',geometry:WEST_BANK};return null}
async function fetchExactRegion(n,iso){const custom=customRegion(n);if(custom)return custom;const names=[n?.focusLabel,n?.location,n?.region].filter(Boolean);for(const loc of names){try{const q=new URLSearchParams({location:String(loc),placeType:String(n?.placeType||'地区'),country:String(n?.country||''),countryIso3:String(iso||''),lon:String(n?.lon??''),lat:String(n?.lat??'')});const r=await fetch('/api/geo-highlight?'+q,{cache:'force-cache'});if(!r.ok)continue;const j=await r.json();if(j?.geometry&&!j?.approximate&&polygons(j.geometry).length)return{label:String(n?.focusLabel||n?.location||j.label||loc),geometry:j.geometry}}catch{}}return null}
const regionLike=n=>/生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|地带|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区|约旦河西岸|加沙地带|顿巴斯|戈兰高地|克里米亚/i.test(storyText(n));

const provinces=['北京市','天津市','上海市','重庆市','河北省','山西省','辽宁省','吉林省','黑龙江省','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','海南省','四川省','贵州省','云南省','陕西省','甘肃省','青海省','台湾省','内蒙古自治区','广西壮族自治区','西藏自治区','宁夏回族自治区','新疆维吾尔自治区'];
function inferProvince(n){const s=storyText(n);if(/新疆/.test(s))return'新疆维吾尔自治区';if(/台湾/.test(s))return'台湾省';for(const p of provinces)if(s.includes(p))return p;if(/北京/.test(s))return'北京市';if(/上海/.test(s))return'上海市';if(/天津/.test(s))return'天津市';if(/重庆/.test(s))return'重庆市';return''}
function inferCity(n,province){const s=String(n?.region||'')+' '+String(n?.location||'');if(province==='北京市'||province==='上海市'||province==='天津市'||province==='重庆市')return'';let r=s.replace(province,'').replace(/新疆维吾尔自治区|新疆|台湾省|台湾/g,'');const m=r.match(/([\u4e00-\u9fa5]{2,8}市)/);return m?m[1]:''}
function isInstitution(n){if(warLike(n))return false;const s=storyText(n),t=String(n?.placeType||'');return /中央部门|政府机构|政府部门|部委|机构|单位|学校|大学|医院|使馆|大使馆|领馆|领事馆|法院|议会|委员会|办公室/.test(t)||/教育部|外交部|国防部|商务部|大学|学院|医院|大使馆|领事馆/.test(s)}
function findChinaLevel1(name){const key=String(name||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g,'');for(const f of G.chinaLevel1Geo?.features||[]){const p=JSON.stringify(f.properties||{});if(p.includes(name)||(key&&p.includes(key)))return f}return null}
async function showAdminName(name,type,iso,serial){if(!name)return true;if(String(iso).toUpperCase()==='CHN'&&/省|自治区|直辖市/.test(type)){const f=findChinaLevel1(name);if(f?.geometry){drawGeometry(f.geometry,name,.18);await flyGeometry(f.geometry,serial,2.5);if(serial!==G.navSerial)return false;await G.wait(1500,serial);return true}}const step={location:name,focusLabel:name,placeType:type,lon:G.news?.[G.current]?.lon,lat:G.news?.[G.current]?.lat,country:G.news?.[G.current]?.country,countryIso3:iso};const ok=await G.flashAdmin?.(step,iso,serial,1600);return ok!==false}
function pointName(n){if(/教育部/.test(storyText(n)))return'教育部';return String(n?.location||'新闻地点').replace(/所在区域|所在地区/g,'')}
async function showHierarchyPoint(n,iso,serial){const province=inferProvince(n),city=inferCity(n,province);if(province){const ok=await showAdminName(province,/市$/.test(province)?'直辖市':/自治区$/.test(province)?'自治区':'省',iso,serial);if(!ok)return false;G.clearLocal()}if(city&&city!==province){const ok=await showAdminName(city,'市',iso,serial);if(!ok)return false;G.clearLocal()}if(serial!==G.navSerial)return false;G.clearCountry();G.clearLocal();const lon=+n.lon,lat=+n.lat;if(!valid(lon,lat))return false;G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(260000,+n.pointHeight||420000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.2});await G.wait(850,serial);if(serial!==G.navSerial)return false;brightPoint(lon,lat,pointName(n));return G.wait(3500,serial)}

const oldRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 if(warLike(n))return oldRun(n,iso,serial);
 const a=allianceOf(n);if(a)return showAlliance(a,serial);
 if(isInstitution(n))return showHierarchyPoint(n,iso,serial);
 if(regionLike(n)){
   const steps=G.adminSteps?.(n)||[];
   for(const st of steps){if(serial!==G.navSerial)return;const ok=await G.flashAdmin?.(st,iso,serial,1400);if(ok===false)break}
   if(serial!==G.navSerial)return;
   const r=await fetchExactRegion(n,iso);if(r){drawGeometry(r.geometry,r.label,.24);if(await flyGeometry(r.geometry,serial,2.6)){brightPoint(n.lon,n.lat,null);return G.wait(3500,serial)}}
   return oldRun(n,iso,serial);
 }
 return oldRun(n,iso,serial);
};

console.info('[News Globe] V37 targeted fix loaded');
})(window.NG14);
