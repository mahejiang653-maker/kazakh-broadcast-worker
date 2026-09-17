(function(G){
if(!G||!window.Cesium||G.__v52SemanticHierarchyEngine)return;
G.__v52SemanticHierarchyEngine=true;
const C=Cesium, previous=G.runSequence;
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const COLORS={primary:'#ff4050',secondary:'#3dbdff'};
const own=[]; const add=e=>{if(e)own.push(e);return e};
function clear(){for(const e of own.splice(0))try{G.viewer.entities.remove(e)}catch{};try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{} }
function feature(iso){return G.countries?.get?.(String(iso||'').toUpperCase())?.feature||null}
function collect(g,out=[]){if(!g)return out;if(Array.isArray(g)){if(g.length>=2&&typeof g[0]==='number'&&typeof g[1]==='number')out.push(g);else for(const x of g)collect(x,out)}else if(g.coordinates)collect(g.coordinates,out);else if(g.geometry)collect(g.geometry,out);else if(g.features)for(const x of g.features)collect(x,out);return out}
function points(iso){return collect(feature(iso),[]).filter(p=>valid(p[0],p[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0))}
function draw(iso,color){try{G.flashCountry?.(iso,{countryIso3:iso})}catch{};const f=feature(iso);if(!f)return;const col=C.Color.fromCssColorString(color);const gs=f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:(f.geometry?.type==='Polygon'?[f.geometry.coordinates]:[]);for(const p of gs){const r=p?.[0]||[];if(r.length<3)continue;const ps=(G.positions?.(r,11000)||[]);if(ps.length)add(G.viewer.entities.add({polyline:{positions:ps,width:2.2,material:new C.PolylineGlowMaterialProperty({glowPower:.1,color:col.withAlpha(.95)})}}))}}
async function fit(ps,s,min=900000,max=15000000){if(!ps.length)return false;const sp=C.BoundingSphere.fromPoints(ps),range=Math.max(min,Math.min(max,sp.radius*2.25));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:1.05,complete:r,cancel:r}));return s===G.navSerial}
async function countriesStage(a,b,s,hold=1200){clear();const ps=[...points(a),...points(b)];if(!ps.length)return false;draw(a,COLORS.primary);draw(b,COLORS.secondary);if(!await fit(ps,s,1200000,15000000))return false;G.__v52SemanticTrace?.push?.({type:'countries',countries:[a,b]});return wait(hold,s)}
function chain(n){const p=n.scenePlan||{};const src=Array.isArray(n.adminChain)?n.adminChain:Array.isArray(p.adminChain)?p.adminChain:Array.isArray(p.targetAdminChain)?p.targetAdminChain:[];return src.filter(Boolean)}
async function admins(n,iso,s){for(const st of chain(n)){if(s!==G.navSerial)return false;clear();if(G.flashAdmin){await G.flashAdmin(st,iso,s,1750);G.__v52SemanticTrace?.push?.({type:'admin',name:st.focusLabel||st.location});await wait(500,s)}if(s!==G.navSerial)return false}return true}
function isNamedRegion(n){return /海峡|海湾|海域|湾区|群岛|半岛|流域|河谷|山区|边境|地区/.test(String(n.placeType||'')+' '+String(n.focusLabel||n.location||''))}
async function final(n,s){if(!valid(n.lon,n.lat))return false;clear();const h=isNamedRegion(n)?Math.max(260000,+n.pointHeight||420000):Math.max(180000,+n.pointHeight||300000);await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+n.lon,+n.lat,h),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.05,complete:r,cancel:r}));if(s!==G.navSerial)return false;G.localLabelEntity=G.label?.(n.focusLabel||n.location,+n.lon,+n.lat,'country');G.__v52SemanticTrace?.push?.({type:'final',label:n.focusLabel||n.location,lon:+n.lon,lat:+n.lat});return wait(2300,s)}
function twoCountries(n){const p=n.scenePlan||{};const primary=String(p.primaryIso3||p.victimIso3||n.countryIso3||'').toUpperCase();const secondary=String(n.secondaryCountryIso3||p.attackerIso3||(p.participants||[]).find(x=>String(x).toUpperCase()!==primary)||'').toUpperCase();return primary&&secondary?[primary,secondary]:null}
function shouldOwn(n){const m=String(n.sceneMode||'').toUpperCase();return ['POINT','ADMIN'].includes(m)||!!chain(n).length||isNamedRegion(n)}
G.__v52SemanticTrace=[];G.getV52SemanticTrace=()=>G.__v52SemanticTrace.slice();
G.runSequence=async function(n,iso,s){G.__v52SemanticTrace.length=0;iso=String(iso||n.countryIso3||'').toUpperCase();const mode=String(n.sceneMode||'').toUpperCase(),pair=twoCountries(n);
 /* Universal rule: a two-country story starts with BOTH complete countries, never a border midpoint. Attack animation remains delegated after this overview. */
 if(pair&&(mode==='ATTACK'||mode==='POTENTIAL_ATTACK'||n.regionalDual===true)){await countriesStage(pair[0],pair[1],s,1250);if(s!==G.navSerial)return;return previous(n,iso,s)}
 if(!shouldOwn(n))return previous(n,iso,s);
 /* Universal hierarchy: current story starts from its own country, then every declared admin level, then the exact/named final geography. */
 clear();const cps=points(iso);if(cps.length){draw(iso,COLORS.primary);await fit(cps,s,900000,15000000);G.__v52SemanticTrace.push({type:'country',iso});await wait(1250,s)}if(s!==G.navSerial)return;
 if(!await admins(n,iso,s))return;
 return final(n,s)
};
console.info('[News Globe] V52 reusable semantic hierarchy engine loaded');
})(window.NG14);