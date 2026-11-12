/* V52 universal geographic camera runtime.
 * Loaded after V52 daily-10/hard rules, before existing playback director.
 * Reuses the one NG14 viewer, borders and polygon caches. No extra Viewer.
 */
(function(G,Semantic){
'use strict';
if(!G||!Semantic||G.v52GeoDirector||!window.Cesium)return;
const C=window.Cesium, previous=G.runSequence, blue='#38a7f6', red='#ff4555';
let owned=[],generation=0,trace=[],currentPlan=null,diagnostic=[],activeSerial=-1;
const diag=(phase,data={})=>{diagnostic.push({phase,serial:G.navSerial,gen:generation,...data});if(diagnostic.length>40)diagnostic.shift();};
const live=(s,t)=>s===G.navSerial&&t===generation&&!G.overviewMode;
const valid=(x,y)=>x!==null&&y!==null&&x!==undefined&&y!==undefined&&Number.isFinite(+x)&&Number.isFinite(+y)&&Math.abs(+x)<=180&&Math.abs(+y)<=90;
const details=(s)=>G.v52Director?.stage?.(s,G.navSerial);
// The legacy occlusion restyler re-shows its base marker after every camera move.
// Semantic scenes own their red event marker, so suppress that reference dot.
const oldOcclusion=G.updateOcclusion;
if(typeof oldOcclusion==='function')G.updateOcclusion=function(...args){
 const result=oldOcclusion.apply(this,args);
 if(currentPlan&&G.started&&!G.overviewMode&&activeSerial===G.navSerial){
   const marker=G.markers?.[G.current],pulse=G.pulses?.[G.current];
   if(marker)marker.show=false;if(pulse)pulse.show=false;
 }
 return result;
};
const wait=async(ms,s,t)=>{const v=await (G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(true),ms)));return live(s,t)&&v!==false;};
function cleanup(){
 try{if(G.markers?.[G.current])G.markers[G.current].show=false;if(G.pulses?.[G.current])G.pulses[G.current].show=false;}catch{}
 const viewer=G.viewer;
 try{viewer?.entities?.suspendEvents?.();for(const e of owned) viewer.entities.remove(e);}catch{}
 finally{try{viewer?.entities?.resumeEvents?.()}catch{}}
 owned=[];try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}
}
function track(spec){const e=G.viewer.entities.add(spec);owned.push(e);return e;}
function coordinates(geo){
 if(!geo)return[];
 if(geo.type==='Feature')return coordinates(geo.geometry);
 if(geo.type==='FeatureCollection')return(geo.features||[]).flatMap(coordinates);
 const result=[];
 function walk(v){if(!Array.isArray(v))return;if(typeof v[0]==='number'&&typeof v[1]==='number'){
   if(valid(v[0],v[1]))result.push([+v[0],+v[1]]);return;
 }for(const x of v)walk(x);}
 walk(geo.coordinates);return result;
}
function cartesian(points){
 // Sampling keeps mobile GPU work predictable, while retaining min/max extremes.
 if(points.length>2800){const step=Math.ceil(points.length/2800),sample=[];for(let i=0;i<points.length;i+=step)sample.push(points[i]);points=sample;}
 return points.map(p=>C.Cartesian3.fromDegrees(p[0],p[1],0));
}
function cameraFit(points,s,t,{min=400000,max=18000000,duration=1.35}={}){
 // Country camera receives an existing Cesium BoundingSphere, not an array.
 if(!points?.center && !points?.length)return Promise.resolve(false);
 const b=points.center&&points.radius?points:C.BoundingSphere.fromPoints(points);
 const mobile=Math.min(window.innerWidth||900,window.innerHeight||900)<700;
 diag('fit-start',{s,t,radius:b.radius,active:live(s,t),center:!!b.center});
 const range=Math.max(min,Math.min(max,b.radius*(mobile?3.9:3.05)));
 details('approach');
 return new Promise(resolve=>{
   if(!live(s,t)){diag('fit-stale',{s,t});resolve(false);return;}
   try{G.viewer.camera.flyToBoundingSphere(b,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-87),range),
     duration,easingFunction:C.EasingFunction?.CUBIC_IN_OUT,complete:()=>{diag('fit-complete',{live:live(s,t)});resolve(live(s,t));},cancel:()=>{diag('fit-cancelled',{s,t});resolve(false);}});}
   catch(error){diag('fit-exception',{message:String(error?.message||error)});console.warn('[V52 Geo] camera fit fallback',error);resolve(false);}
 });
}
function cameraPoint(lon,lat,height,s,t){
 if(!valid(lon,lat))return Promise.resolve(false);
 const mobile=Math.min(window.innerWidth||900,window.innerHeight||900)<700;
 const safeHeight=Math.max(190000,Math.min(6500000,+height||420000))*(mobile?1.42:1);
 details('approach');
 return new Promise(resolve=>{
   if(!live(s,t)){resolve(false);return;}
   try{G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+lon,+lat,safeHeight),
     orientation:{heading:0,pitch:C.Math.toRadians(-89),roll:0},duration:1.25,
     easingFunction:C.EasingFunction?.CUBIC_IN_OUT,complete:()=>resolve(live(s,t)),cancel:()=>resolve(false)});}
   catch{resolve(false);}
 });
}
function centerCountry(id){
 const c=G.countries?.get(id);
 if(!c)return null;
 if(id==='CHN')return [103.8,35.4];
 const p=c.center||G.centerOf?.(c.feature?.geometry);
 return Array.isArray(p)&&valid(p[0],p[1])?[+p[0],+p[1]]:null;
}
function label(text,lon,lat,white=true){
 if(!text||!valid(lon,lat))return null;
 const e=G.label?.(String(text),lon,lat,'country');
 if(e?.label&&white){e.label.fillColor=C.Color.WHITE;e.label.outlineColor=C.Color.BLACK;e.__v52OwnedLabel=true;}
 return e;
}
async function country(step,n,s,t){
 const id=step.iso3,c=G.countries?.get(id);
 diag('country-start',{id,s,t,c:!!c,active:live(s,t)});
 if(!c||!live(s,t))return false;
 details('country');
 cleanup();
 const view={...n,scenePlan:{...(n.scenePlan||{}),territoryRole:'blue'}};
 if(G.flashCountry?.(id,view)===false){diag('country-flash-missing',{id});return false;}
 diag('country-flash-done',{id});
 const sphere=c.sphere||C.BoundingSphere.fromPoints(cartesian(coordinates(c.feature?.geometry)));
 if(!await cameraFit(sphere,s,t,{min:650000,max:22000000})){diag('country-camera-failed',{id,s,t});return false;}
 // Paint from clipped authoritative polygons, not the location point.
 // Existing shared setters may be restyled during animation; reassert after
 // camera settles without adding a duplicate world-country mesh.
 const col=C.Color.fromCssColorString(blue).withAlpha(.55);
 for(const e of G.countryFillEntities||[])if(e?.polygon)e.polygon.material=col;
 G.setCountry?.(id,true);
 G.viewer.scene.requestRender?.();
 trace.push({type:'country-highlight',iso3:id,color:blue,flag:true,entireTerritory:true});
 return wait(step.hold||1300,s,t);
}
function provinceFeatures(names){
 const all=G.chinaLevel1Geo?.features||[];
 return names.map(name=>all.find(f=>{
   const values=Object.values(f.properties||{}).filter(x=>typeof x==='string');
   return values.some(v=>v.includes(name));
 })).filter(Boolean);
}
async function region(step,n,s,t){
 details('admin');cleanup();
 if(step.iso3!=='CHN'||!Array.isArray(step.provinces))return false;
 const selected=provinceFeatures(step.provinces);
 // All requested provinces are necessary; never pretend a partial area is exact.
 if(selected.length!==step.provinces.length){
   trace.push({type:'region-fallback',regionKey:step.regionKey,available:selected.length,required:step.provinces.length});
   return country({iso3:step.iso3,hold:1400},n,s,t);
 }
 const points=selected.flatMap(f=>coordinates(f.geometry));
 if(!points.length)return country({iso3:step.iso3,hold:1200},n,s,t);
 const col=C.Color.fromCssColorString(blue);
 G.viewer.entities.suspendEvents?.();
 try{for(const f of selected){
   const g=f.geometry,polys=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
   for(const poly of polys)G.addPolygon?.(poly,col,false);
 }}finally{G.viewer.entities.resumeEvents?.();}
 for(const e of G.localHighlightEntities||[])if(e?.polygon)e.polygon.material=C.Color.fromCssColorString(blue).withAlpha(.38);
 if(!await cameraFit(cartesian(points),s,t,{min:850000,max:9400000,duration:1.55}))return false;
 const bbox=C.BoundingSphere.fromPoints(cartesian(points)),loc=C.Cartographic.fromCartesian(bbox.center);
 if(loc){const lon=C.Math.toDegrees(loc.longitude),lat=C.Math.toDegrees(loc.latitude);G.localLabelEntity=label(step.label,lon,lat);}
 trace.push({type:'region-highlight',regionKey:step.regionKey,provinces:step.provinces,source:'china-level1-geojson',approximate:true,point:false});
 return wait(step.hold||1700,s,t);
}
async function point(step,s,t){
 const p=step.point;
 if(!p||!valid(p.lon,p.lat))return false;
 details('location');cleanup();
 if(!await cameraPoint(p.lon,p.lat,p.verified?270000:440000,s,t))return false;
 track({position:C.Cartesian3.fromDegrees(p.lon,p.lat,1600),point:{
   pixelSize:12,color:C.Color.fromCssColorString(red),outlineColor:C.Color.WHITE,outlineWidth:2,
   disableDepthTestDistance:Number.POSITIVE_INFINITY}});
 G.localLabelEntity=label(p.label,p.lon,p.lat);
 trace.push({type:'point-focus',label:p.label,lon:p.lon,lat:p.lat,precision:p.precision,reference:!p.verified});
 return wait(step.hold||1400,s,t);
}
async function overview(step,s,t){
 details('country');cleanup();
 const ids=step.countries.filter(id=>G.countries?.has(id)).slice(0,35);
 if(!ids.length)return false;
 const ps=[],col=C.Color.fromCssColorString(blue);
 G.viewer.entities.suspendEvents?.();
 try{for(const id of ids){
   const c=G.countries.get(id);
   const geo=id==='CHN'&&c.authoritativeOutline?.geometry?c.authoritativeOutline.geometry:c.feature?.geometry;
   G.addCountryFill?.(geo,blue,.25);
   const center=centerCountry(id);if(center)ps.push(center);
   // Keep existing border set; display actual polygon segments only.
   for(const e of c.entities||[])if(e.polyline){e.show=true;e.polyline.material=C.Color.WHITE.withAlpha(.92);}
 }}finally{G.viewer.entities.resumeEvents?.();}
 if(!ps.length)return false;
 if(!await cameraFit(cartesian(ps),s,t,{min:950000,max:18000000,duration:1.5}))return false;
 trace.push({type:'multi-country-overview',countries:ids,role:step.role||'participants',color:blue});
 return wait(step.hold||1500,s,t);
}
function relationPoints(step){
 const a=centerCountry(step.from),b=centerCountry(step.to);
 if(!a||!b)return null;
 return {a,b,positions:[C.Cartesian3.fromDegrees(a[0],a[1],160000),C.Cartesian3.fromDegrees(b[0],b[1],160000)]};
}
async function line(step,s,t){
 const r=relationPoints(step);if(!r)return false;
 details('event');cleanup();
 const abstract=step.type==='directional-relation'||step.evidence!=='verified';
 let pts=r.positions;
 if(!abstract&&Array.isArray(step.verifiedCoordinates)&&step.verifiedCoordinates.length>=2&&
    step.verifiedCoordinates.length<=1000&&step.verifiedCoordinates.every(p=>Array.isArray(p)&&valid(p[0],p[1])))
   pts=step.verifiedCoordinates.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],170000));
 track({polyline:{positions:pts,width:3,
   material:abstract?new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#8fd3ff'),dashLength:16}):
     C.Color.fromCssColorString('#53ddff'),arcType:C.ArcType.GEODESIC}});
 if(!await cameraFit(pts,s,t,{min:500000,max:18000000}))return false;
 const mid=[(r.a[0]+r.b[0])/2,(r.a[1]+r.b[1])/2];
 if(valid(mid[0],mid[1]))G.localLabelEntity=label(step.type==='directional-relation'?'行动关系（非实际轨迹）':abstract?'示意路线':'已核实路线',mid[0],mid[1]);
 trace.push({type:step.type,from:step.from,to:step.to,evidence:step.evidence||'abstract-relation',actualTrajectory:!abstract});
 return wait(step.hold||1200,s,t);
}
async function area(step,n,s,t){
 details('admin');cleanup();
 const raw=G.v52Geography?.explicit?.(n);
 const geo=raw?.type==='Feature'?raw.geometry:raw;
 const points=coordinates(geo);
 if(geo&&points.length){
   const safe={...n,title:'',summary:'',conflict:false,placeType:'地理区域'};
   G.drawArea?.(geo,safe);
   if(!await cameraFit(cartesian(points),s,t,{min:350000,max:5000000}))return false;
   trace.push({type:'waterbody-focus',label:step.label,source:'explicit-geometry',point:false});
 }else if(step.center&&valid(step.center.lon,step.center.lat)){
   // A reference center is a camera target, not an incident marker or geometry.
   if(!await cameraPoint(step.center.lon,step.center.lat,1250000,s,t))return false;
   trace.push({type:'waterbody-reference',label:step.label,point:false,geometryUnknown:true});
 }else return false;
 return wait(step.hold||1400,s,t);
}
async function execute(plan,n,s,t){
 for(const step of plan.steps){
   if(!live(s,t))return false;
   let ok=false;
   switch(step.type){
     case 'country-highlight':ok=await country(step,n,s,t);break;
     case 'region-highlight':ok=await region(step,n,s,t);break;
     case 'point-focus':ok=await point(step,s,t);break;
     case 'multi-country-overview':ok=await overview(step,s,t);break;
     case 'cross-border-route':
     case 'directional-relation':ok=await line(step,s,t);break;
     case 'waterbody-focus':ok=await area(step,n,s,t);break;
     default:ok=false;
   }
   if(!ok){
     if(!live(s,t))return false;
     // A boundary gap must degrade to a country, never an invented point.
     if(plan.fallback?.iso3&&G.countries.has(plan.fallback.iso3))
       return country({type:'country-highlight',iso3:plan.fallback.iso3,hold:900},n,s,t);
     return false;
   }
 }
 return true;
}
// Existing authored V52 speciality shots retain their mature renderer. The
// semantic engine drives ordinary daily stories; this is based on scene
// capabilities and evidence fields, never edition, rank, place or headline.
function legacySpecializedScene(story,plan){
 const mode=String(story?.sceneMode||'').toUpperCase();
 const p=story?.scenePlan||{};
 return (mode==='POINT'&&plan?.scenario==='single-place')
   || (mode==='POINT'&&plan?.scenario==='waterbody'&&p.attackEffect)
   || (mode==='REGION'&&p.regionalContext===true)
   || /^(ADMIN_REGION|CARRIER_PORT|ORG|ORGANIZATION|MISSILE_ATTACK|DRONE_ATTACK|BORDER_CONFLICT|POTENTIAL_ATTACK|ATTACK)$/.test(mode)
   || mode==='DIPLOMACY'
   || (Array.isArray(story?.eventSites)&&story.eventSites.length>1)
   || !!(story?.eventLocation?.verified===true&&story?.eventLocation?.sourceUrl)
   || !!p.hierarchyPresented;
}
G.runSequence=async function(story,iso,s){
 const t=++generation;trace=[];currentPlan=null;activeSerial=s;diagnostic=[];diag('dispatch',{s,t,iso});
 try{
   if(!G.viewer||!G.countries?.size){currentPlan=null;return previous.call(this,story,iso,s);}
   const plan=Semantic.validate(Semantic.analyze(story),G.countries.keys());
   if(legacySpecializedScene(story,plan)){diag('legacy-special-scene',{mode:story.sceneMode});currentPlan=null;return previous.call(this,story,iso,s);}
   currentPlan=plan;
   if(!plan.steps.length){currentPlan=null;return previous.call(this,story,iso,s);}
   if(!live(s,t))return false;
   // Purge specialized legacy points/effects before switching to generic scenes.
   G.v51PrepareAdmin?.();
   return await execute(plan,story,s,t);
 }catch(error){
   console.error('[V52 Geo] degraded safely',error);
   if(!live(s,t))return false;
   if(currentPlan?.fallback?.iso3&&G.countries?.has(currentPlan.fallback.iso3))
     return country({iso3:currentPlan.fallback.iso3,hold:1000},story,s,t);
   currentPlan=null;return previous.call(this,story,iso,s);
 }
};
G.v52GeoDirector={version:'20261112-r1',plan:story=>Semantic.analyze(story),
 getState:()=>({generation,plan:currentPlan,trace:trace.slice(),diagnostic:diagnostic.slice()}),
 getTrace:()=>trace.slice(),cancel:()=>{generation++;cleanup();G.viewer?.camera?.cancelFlight?.();}};
console.info('[V52] universal geographic semantic director installed');
})(window.NG14,window.V52GeoSemantic);
