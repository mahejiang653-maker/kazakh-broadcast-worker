(function(G){
if(!G||!window.Cesium)return;
const C=Cesium;
if(G.__v44RegressionGuard)return;G.__v44RegressionGuard=true;
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const text=n=>[n?.title,n?.summary,n?.location,n?.region,n?.placeType,n?.focusLabel].join(' ');
const warLike=n=>!!(n?.attackType||n?.potentialStrike||n?.regionalDual===true);
const allianceLike=n=>/欧盟|北约|NATO|东盟|ASEAN|海合会|GCC/i.test(text(n));
const strictRegion=n=>/约旦河西岸|生态治理区|保护区|自然保护区|工业园区|产业园区|开发区|自贸区|港区|矿区|灾区|流域|河谷|湖区|山区|沿岸|海域|海峡|海湾|湾区|群岛|半岛|景区|加沙地带|顿巴斯|戈兰高地|克里米亚/i.test(text(n));
const centralInstitution=n=>!warLike(n)&&(/中央部门|部委|政府机构|政府部门/.test(String(n?.placeType||''))||/教育部|外交部|国防部|商务部|国家发展改革委|国家卫生健康委/.test(text(n)));
const pointFacility=n=>!warLike(n)&&(/大学|学院|医院|学校|使馆|大使馆|领馆|领事馆|企业总部|总部|研究院|实验室/.test(text(n))||/学校|大学|医院|企业总部|单个设施|具体地点/.test(String(n?.placeType||'')));
const enterprise=n=>/企业总部|总部所在区域|总部区域/.test(text(n));

function cleanZhLabel(s){
 s=String(s||'').trim();
 s=s.replace(/[（(][^（）()]*[A-Za-z][^（）()]*[）)]/g,'');
 s=s.replace(/[A-Za-z][A-Za-z0-9._\-/ ]*/g,'');
 s=s.replace(/所在区域|所在地区|目标区域|目标区|打击区域|打击区|（示意）|\(示意\)|示意/g,'');
 s=s.replace(/\s+/g,'').replace(/^[-—·]+|[-—·]+$/g,'');
 if(/纳坦兹/.test(s))return'纳坦兹附近核设施';
 if(/教育部/.test(s))return'教育部';
 return s||'新闻地点';
}
function dynamicOffset(lon,lat){
 const pos=C.Cartesian3.fromDegrees(+lon,+lat,52000);
 return new C.CallbackProperty(()=>{
  try{const fn=C.SceneTransforms?.worldToWindowCoordinates||C.SceneTransforms?.wgs84ToWindowCoordinates;const p=fn?.(G.viewer.scene,pos),h=G.viewer.scene.canvas.clientHeight||400,w=G.viewer.scene.canvas.clientWidth||700;if(p){if(p.y<74)return new C.Cartesian2(0,38);if(p.y>h-64)return new C.Cartesian2(0,-40);if(p.x<90)return new C.Cartesian2(48,-18);if(p.x>w-90)return new C.Cartesian2(-48,-18)}}catch{}
  return new C.Cartesian2(0,-34);
 },false);
}

/* Every Cesium label goes through one simplified-Chinese cleanup and collision-safe offset. */
if(typeof G.label==='function'){
 const oldLabel=G.label;
 G.label=(label,lon,lat,mode)=>{const e=oldLabel(cleanZhLabel(label),lon,lat,mode);try{if(e?.label)e.label.pixelOffset=dynamicOffset(lon,lat)}catch{}return e};
}

/* Remove legacy English fragments from the visible location/region chips too. */
if(typeof G.storyUI==='function'){
 const oldStoryUI=G.storyUI;
 G.storyUI=(n,iso)=>{oldStoryUI(n,iso);try{const loc=G.$?.('location'),reg=G.$?.('region');if(loc)loc.textContent=cleanZhLabel(n?.location||'');if(reg&&n?.region)reg.textContent=cleanZhLabel(n.region)}catch{}};
}

function provinceStep(st){return /省|自治区|直辖市|特别行政区|province|state/i.test(String(st?.placeType||''))}
function cityStep(st){return /市|地区|自治州|盟|prefecture|city/i.test(String(st?.placeType||''))&&!provinceStep(st)}
function filteredChain(n,mode){const src=Array.isArray(n?.adminChain)?n.adminChain.filter(Boolean):[];if(!src.length)return src;const out=[];for(const st of src){if(provinceStep(st)){out.push(st);continue}if(mode==='point'&&cityStep(st)){out.push(st);continue}}return out}

async function countryFirst(n,iso,serial){if(!iso||typeof G.countryStage!=='function')return true;const ok=await G.countryStage(n,iso,serial);return ok!==false&&serial===G.navSerial}
async function showFinalPoint(n,serial){
 if(!valid(n?.lon,n?.lat)||serial!==G.navSerial)return false;
 G.clearCountry?.();G.clearLocal?.();const lon=+n.lon,lat=+n.lat;
 await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,Math.max(260000,+n.pointHeight||420000)),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.15,complete:r,cancel:r}));
 if(serial!==G.navSerial)return false;
 const p=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,31000),point:{pixelSize:10,color:C.Color.fromCssColorString('#ff3038'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});G.localHighlightEntities?.push(p);
 const pulse=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,700),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>12500+((Math.sin((G.pulsePhase||0)*2.2)+1)/2)*23000,false),semiMinorAxis:new C.CallbackProperty(()=>12500+((Math.sin((G.pulsePhase||0)*2.2)+1)/2)*23000,false),material:C.Color.fromCssColorString('#ff3038').withAlpha(.12),outline:true,outlineColor:C.Color.fromCssColorString('#ff676b').withAlpha(.7)}});G.localHighlightEntities?.push(pulse);
 G.localLabelEntity=G.label?.(cleanZhLabel(n?.location||n?.focusLabel||'新闻地点'),lon,lat,'country');
 return G.wait?G.wait(3000,serial):true;
}

const prevRun=G.runSequence;
G.runSequence=async(n,iso,serial)=>{
 iso=String(iso||n?.countryIso3||'').toUpperCase();
 if(warLike(n)||allianceLike(n))return prevRun(n,iso,serial);

 /* Strict named regions may never fall back to a focusBounds rectangle/ellipse. */
 if(strictRegion(n)){
  const fb=n.focusBounds,bb=n.focusBBox;
  try{delete n.focusBounds;delete n.focusBBox;return await prevRun(n,iso,serial)}finally{if(fb!==undefined)n.focusBounds=fb;if(bb!==undefined)n.focusBBox=bb}
 }

 const chain=Array.isArray(n?.adminChain)?n.adminChain:null;
 if(centralInstitution(n)){
  const saved=n.adminChain;
  try{
   if(chain?.length)n.adminChain=filteredChain(n,'institution');
   else if(!await countryFirst(n,iso,serial))return false;
   return await prevRun(n,iso,serial);
  }finally{n.adminChain=saved}
 }

 if(pointFacility(n)){
  const saved=n.adminChain;
  try{
   if(chain?.length)n.adminChain=filteredChain(n,'point');
   else if(!await countryFirst(n,iso,serial))return false;
   const r=await prevRun(n,iso,serial);
   /* V38 intentionally stopped enterprise-HQ stories at the city. V44 restores the final point. */
   if(enterprise(n)&&serial===G.navSerial)return showFinalPoint(n,serial);
   return r;
  }finally{n.adminChain=saved}
 }
 return prevRun(n,iso,serial);
};

/* Keep all future ellipse entities valid so one bad region cannot halt the 13-story run. */
try{
 const proto=C.EntityCollection?.prototype;if(proto&&!proto.__v44EllipseGuard){proto.__v44EllipseGuard=true;const add0=proto.add;proto.add=function(entity){try{const el=entity?.ellipse;if(el){const a=el.semiMajorAxis,b=el.semiMinorAxis;if(typeof a==='number'&&typeof b==='number'&&a<b){el.semiMajorAxis=b;el.semiMinorAxis=a}}}catch{}return add0.call(this,entity)}}
}catch{}
G.__stableNewsGlobeVersion='V44';
console.info('[News Globe] V44 regression guard loaded');
})(window.NG14);
