/* V52: prevent anonymous incident dots and missing country flags on final frames.
   Operates only on the current story; never manufactures a coordinate. */
(function(G){
'use strict';
if(!G||G.__v52FinalAnnotationGuard||typeof G.runSequence!=='function')return;
G.__v52FinalAnnotationGuard=true;
const C=window.Cesium,oldRun=G.runSequence;
const ISO2={IDN:'id',CHN:'cn',PSE:'ps',ISR:'il',SGP:'sg'};
const countryCode=n=>String(n?.scenePlan?.primaryIso3||n?.countryIso3||'').toUpperCase();
const valid=(a,b)=>a!==null&&a!==undefined&&a!==''&&b!==null&&b!==undefined&&b!==''&&
 Number.isFinite(+a)&&Number.isFinite(+b)&&Math.abs(+a)<=180&&Math.abs(+b)<=90&&!(+a===0&&+b===0);
const textOf=e=>{try{const v=e?.label?.text;return String(v?.getValue?v.getValue(G.viewer.clock.currentTime):v||'').trim()}catch{return ''}};
function visibleScene(){
 const ents=G.viewer?.entities;
 return (G.v51SceneEntities||[]).filter(e=>e&&ents?.contains?.(e)&&e.show!==false);
}
const named=n=>{
 const city=typeof n.city==='string'?n.city:n.city?.focusLabel||n.city?.location;
 return String(n.scenePlan?.targetLabel||city||n.focusLabel||n.location||n.region||'').trim();
};
function addEntity(spec){
 const e=G.viewer.entities.add(spec);
 if(Array.isArray(G.v51SceneEntities))G.v51SceneEntities.push(e);
 return e;
}
function addFlag(iso,lon,lat,offsetX=32,offsetY=-21){
 const cc=ISO2[iso]||String(G.countries?.get(iso)?.iso2||'').trim().toLowerCase();
 if(!/^[a-z]{2}$/.test(cc))return false;
 const image=G.v52FlagImages?.[cc]||'https://flagcdn.com/w40/'+cc+'.png';
 addEntity({__v52FinalFlag:true,__v52FlagIso:iso,position:C.Cartesian3.fromDegrees(lon,lat,34000),
  billboard:{image,width:25,height:17,pixelOffset:new C.Cartesian2(offsetX,offsetY),
   disableDepthTestDistance:Number.POSITIVE_INFINITY}});
 return true;
}
function addName(name,lon,lat){
 addEntity({__v52FinalLocationLabel:true,position:C.Cartesian3.fromDegrees(lon,lat,36000),
  label:{text:name,font:'600 14px "Microsoft YaHei",sans-serif',
   fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,
   style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,
   backgroundColor:C.Color.fromCssColorString('#030a12').withAlpha(.72),
   pixelOffset:new C.Cartesian2(0,-45),
   horizontalOrigin:C.HorizontalOrigin.CENTER,
   verticalOrigin:C.VerticalOrigin.CENTER,
   disableDepthTestDistance:Number.POSITIVE_INFINITY}});
}
function ensure(n,serial){
 if(serial!==G.navSerial||G.overviewMode||!G.viewer?.entities||!C)return;
 const mode=String(n.sceneMode||'').toUpperCase(),iso=countryCode(n),place=named(n);
 if(/ATTACK|CARRIER|ORGANIZATION/.test(mode))return;
 const entities=visibleScene();
 const flagNear=(lon,lat)=>entities.some(e=>{
  if(!e.billboard||!e.position)return false;
  const pos=e.position.getValue?.(G.viewer.clock?.currentTime)||e.position;
  if(!pos)return false;
  if(typeof C.Cartesian3?.distance!=='function')return true; // legacy test harness
  return C.Cartesian3.distance(pos,C.Cartesian3.fromDegrees(lon,lat,34000))<95000;
 });
 const hasFlag=entities.some(e=>!!e.billboard);
 const hasLabel=name=>entities.some(e=>textOf(e)===name);
 const hasPlace=valid(n.lon,n.lat)&&n.noPoint!==true&&n.countryOnly!==true;
 const isLocality=hasPlace && (n.scenePlan?.finalLocation===true||
   ['POINT','CITY','LOCATION_FOCUS','REGION','DIPLOMACY','DIPLOMACY_2','DIPLOMACY_MULTI'].includes(mode)||
   /^(城市|城镇|乡镇|县城|地点|地区|city|region)$/i.test(String(n.placeType||'')));
 if(isLocality){
  const name=place||'新闻定位点';
  if(!hasLabel(name))addName(name,+n.lon,+n.lat);
  const countryPair=Array.isArray(n.scenePlan?.focusCountries)?[...new Set(n.scenePlan.focusCountries.map(x=>String(x||'').toUpperCase()))]:[];
  if(countryPair.length===2){
    // The v51 final frame already has the primary flag. Add the partner
    // directly beside it (rather than at the unrelated country's centroid).
    // Both flags remain tethered to the exact event anchor as the camera moves.
    const nearIso=code=>entities.some(e=>e.billboard&&e.__v52FlagIso===code&&e.show!==false);
    countryPair.forEach((code,i)=>{if(!nearIso(code))addFlag(code,+n.lon,+n.lat,i===0?-24:26,-10)});
    G.__v52FinalAnnotation={serial,iso,location:name,countries:countryPair,status:'dual-country-point'};
  }else{
    if(!flagNear(+n.lon,+n.lat))addFlag(iso,+n.lon,+n.lat);
    G.__v52FinalAnnotation={serial,iso,location:name,status:'point-annotated'};
  }
 }else if(iso&&G.countries?.has(iso)){
  const name=G.countryNameZh?.(iso)||G.countries.get(iso)?.name||iso;
  const center=G.countries.get(iso)?.center;
  if(!hasFlag&&valid(center?.[0],center?.[1]))addFlag(iso,+center[0],+center[1]);
  G.__v52FinalAnnotation={serial,iso,location:name,status:'country-flag-checked'};
 }
 G.viewer.scene?.requestRender?.();
}
G.runSequence=async function(n,iso,serial){
 const result=await oldRun.call(this,n,iso,serial);
 if(result!==false&&serial===G.navSerial&&!G.overviewMode)ensure(n,serial);
 return result;
};
G.v52FinalAnnotationGuard={version:'20261025-r1',getDiagnostics:()=>G.__v52FinalAnnotation||null};
})(window.NG14);
