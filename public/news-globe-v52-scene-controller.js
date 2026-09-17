(function boot(){
const G=window.NG14;if(!G||!window.Cesium||!G.viewer)return setTimeout(boot,80);if(G.__v52AttackTransitionFix)return;G.__v52AttackTransitionFix=true;
const C=Cesium,legacy=G.runSequence,own=[];
const ISO2={CHN:'cn',USA:'us',RUS:'ru',UKR:'ua',IRN:'ir',ISR:'il',PSE:'ps',LBN:'lb',DEU:'de',FRA:'fr',GBR:'gb',POL:'pl',ROU:'ro',TUR:'tr',SYR:'sy',JOR:'jo',EGY:'eg',IND:'in',PAK:'pk',AFG:'af',JPN:'jp',PRK:'kp',AUS:'au',CAN:'ca',BRA:'br',THA:'th',SGP:'sg',SAU:'sa',ARE:'ae',QAT:'qa',IRQ:'iq',KWT:'kw',VEN:'ve',KAZ:'kz',OMN:'om',DZA:'dz',LBY:'ly',NGA:'ng',MEX:'mx',MYS:'my',IDN:'id',PHL:'ph',VNM:'vn',MMR:'mm',BHR:'bh',BRN:'bn',AZE:'az',SDN:'sd',SSD:'ss',COG:'cg',GNQ:'gq',GAB:'ga',LTU:'lt',BLR:'by',YEM:'ye',DNK:'dk',KOR:'kr'};
const good=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b),wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
function rm(e){try{G.viewer.entities.remove(e)}catch{}}function clearOwn(){for(const e of own.splice(0))rm(e)}
function flag(iso,lon,lat,dx=24){const cc=ISO2[String(iso||'').toUpperCase()];if(!cc||!good(lon,lat))return;own.push(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,72000),billboard:{image:`https://flagcdn.com/w40/${cc}.png`,width:21,height:13,pixelOffset:new C.Cartesian2(dx,-11),disableDepthTestDistance:Number.POSITIVE_INFINITY}}))}
function center(iso){const e=G.countries?.get?.(String(iso||'').toUpperCase());if(Array.isArray(e?.center)&&good(e.center[0],e.center[1]))return{lon:+e.center[0],lat:+e.center[1]};return null}
async function fit(a,b,s){const ps=[C.Cartesian3.fromDegrees(a.lon,a.lat,0),C.Cartesian3.fromDegrees(b.lon,b.lat,0)],sp=C.BoundingSphere.fromPoints(ps),range=Math.max(420000,Math.min(2800000,sp.radius*3));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:.95,complete:r,cancel:r}));return s===G.navSerial}
async function attack(n,iso,s){
 const p=n.scenePlan||{},att=String(p.attackerIso3||n.sourceCountryIso3||'').toUpperCase(),vic=String(p.victimIso3||n.targetCountryIso3||n.countryIso3||iso||'').toUpperCase();
 const target={lon:+(n.targetLon??n.lon),lat:+(n.targetLat??n.lat)};if(!att||!vic||!good(target.lon,target.lat))return legacy(n,iso,s);
 /* Important: there is deliberately NO countryStage/pairStage here. The camera enters the actual event scene directly. */
 let source=good(n.sourceLon,n.sourceLat)?{lon:+n.sourceLon,lat:+n.sourceLat}:center(att);if(!source)return legacy(n,iso,s);
 clearOwn();try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearArc?.()}catch{};
 if(!await fit(source,target,s))return;
 const info={attackerIso:att,targetIso:vic,sourceLon:source.lon,sourceLat:source.lat,targetLon:target.lon,targetLat:target.lat,attackType:n.attackType,sourceType:p.sourceType||n.sourceType,sourceLabel:p.sourceLabel||`${att}方向`,targetLabel:p.targetLabel||n.focusLabel||n.location,potential:String(n.sceneMode).toUpperCase()==='POTENTIAL_ATTACK'};
 if(info.potential)G.v29ShowPotential?.(info);else if(String(n.attackType).toLowerCase()==='drone')G.v29ShowDrone?.(n,info);else G.v29ShowMissile?.(n,info);
 /* Flags are information elements, not camera stages: keep both parties visible in the real attack scene. */
 flag(att,source.lon,source.lat);flag(vic,target.lon,target.lat);
 G.__v52AttackTransitionTrace={id:n.id,overviewStage:false,flags:[att,vic],source,target};
 await wait(String(n.attackType).toLowerCase()==='drone'?3500:2300,s);if(s!==G.navSerial)return;
 /* Let the stable V52 final-location renderer/camera continue only after the attack scene. */
 clearOwn();
 if(good(n.lon,n.lat))await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+n.lon,+n.lat,Number(n.pointHeight)||250000),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.0,complete:r,cancel:r}));
}
G.runSequence=function(n,iso,s){const m=String(n.sceneMode||'').toUpperCase();if(m==='ATTACK'||m==='POTENTIAL_ATTACK')return attack(n,iso,s);return legacy(n,iso,s)};
console.info('[News Globe] V52 attack transition fix loaded: flags kept, standalone two-country camera removed');
})();