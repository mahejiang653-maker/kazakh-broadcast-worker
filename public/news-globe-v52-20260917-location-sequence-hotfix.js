(function(G){
if(!G||!window.Cesium||G.__daily20260917LocationSequenceFix)return;
G.__daily20260917LocationSequenceFix=true;
const C=Cesium, oldRun=G.runSequence;
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
function clean(){try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{}}
async function flySphere(iso,s,hold=1350){clean();if(!G.flashCountry?.(iso))return false;const c=G.countries?.get?.(iso),sp=c?.sphere;if(!sp)return false;await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-88),Math.max(900000,Math.min(15000000,sp.radius*2.65))),duration:1.15,complete:r,cancel:r}));if(s!==G.navSerial)return false;return wait(hold,s)}
async function flyPoint(n,s,hold=2500){if(!valid(n.lon,n.lat))return false;clean();await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+n.lon,+n.lat,+n.pointHeight||330000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.05,complete:r,cancel:r}));if(s!==G.navSerial)return false;const e=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+n.lon,+n.lat,30000),point:{pixelSize:10,color:C.Color.fromCssColorString('#ff4050'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});G.localHighlightEntities?.push(e);G.localLabelEntity=G.label?.(n.focusLabel||n.location,+n.lon,+n.lat,'country');return wait(hold,s)}
async function adminStep(st,iso,s){if(!st)return true;clean();try{await G.flashAdmin?.(st,iso,s,1750)}catch{}if(s!==G.navSerial)return false;return wait(450,s)}
async function pointSequence(n,iso,s){const p=n.scenePlan||{},primary=String(p.primaryIso3||n.countryIso3||iso||'').toUpperCase();
  /* TOP9 is a named waterway: show Oman/Iran context, then MUST finish on the strait itself. */
  if(n.id===9){await flySphere('OMN',s,650);if(s!==G.navSerial)return;await flySphere('IRN',s,650);if(s!==G.navSerial)return;return flyPoint({...n,pointHeight:360000},s,3300)}
  if(primary){if(!await flySphere(primary,s,1450))return oldRun(n,iso,s);if(s!==G.navSerial)return}
  const chain=Array.isArray(n.adminChain)?n.adminChain:(Array.isArray(p.adminChain)?p.adminChain:[]);
  for(const st of chain){if(s!==G.navSerial)return;if(typeof st==='object')await adminStep(st,primary,s)}
  if(s!==G.navSerial)return;
  return flyPoint(n,s,2800);
}
G.runSequence=async function(n,iso,s){
  if(String(G.meta?.date||'')!=='2026-09-17')return oldRun(n,iso,s);
  if(String(n.sceneMode||'').toUpperCase()==='POINT'&&[4,6,7,9,12,13].includes(+n.id))return pointSequence(n,iso,s);
  return oldRun(n,iso,s);
};
console.info('[News Globe] 20260917 V52 location/sequence hotfix loaded');
})(window.NG14);