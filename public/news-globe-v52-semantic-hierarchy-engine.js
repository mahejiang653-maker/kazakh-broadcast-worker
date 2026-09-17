(function(G){
if(!G||!window.Cesium||G.__v52SemanticHierarchyEngine)return;
G.__v52SemanticHierarchyEngine=true;
const C=Cesium, previous=G.runSequence;
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const own=[];const add=e=>{if(e)own.push(e);return e};
function purge(k){const a=G[k];if(!Array.isArray(a))return;for(const e of a.splice(0))try{G.viewer.entities.remove(e)}catch{}}
function clear(){for(const e of own.splice(0))try{G.viewer.entities.remove(e)}catch{};for(const k of ['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities'])purge(k);try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{};try{if(G.markers)for(const m of G.markers)m.show=false;if(G.pulses)for(const p of G.pulses)p.show=false}catch{}}
function feat(iso){return G.countries?.get?.(String(iso||'').toUpperCase())?.feature||null}
function collect(g,out=[]){if(!g)return out;if(Array.isArray(g)){if(g.length>=2&&typeof g[0]==='number'&&typeof g[1]==='number')out.push(g);else for(const x of g)collect(x,out)}else if(g.coordinates)collect(g.coordinates,out);else if(g.geometry)collect(g.geometry,out);else if(g.features)for(const x of g.features)collect(x,out);return out}
function pts(iso){return collect(feat(iso),[]).filter(p=>valid(p[0],p[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0))}
async function fit(ps,s,min=850000,max=15000000){if(!ps.length)return false;const sp=C.BoundingSphere.fromPoints(ps),range=Math.max(min,Math.min(max,sp.radius*2.3));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:1.05,complete:r,cancel:r}));return s===G.navSerial}
async function country(n,iso,s){clear();if(!iso)return false;G.flashCountry?.(iso,n);const ps=pts(iso);if(ps.length)await fit(ps,s);if(s!==G.navSerial)return false;G.__v52SemanticTrace.push({type:'country',iso});return wait(1300,s)}
function chain(n){const p=n.scenePlan||{},a=Array.isArray(n.adminChain)?n.adminChain:Array.isArray(p.adminChain)?p.adminChain:Array.isArray(p.targetAdminChain)?p.targetAdminChain:[];return a.filter(Boolean)}
async function admins(n,iso,s){for(const st of chain(n)){if(s!==G.navSerial)return false;clear();await G.flashAdmin?.(st,iso,s,1750);G.__v52SemanticTrace.push({type:'admin',name:st.focusLabel||st.location});if(!await wait(450,s))return false}return true}
function named(n){return /海峡|海湾|海域|湾区|群岛|半岛|流域|河谷|山区|边境|地区/.test(String(n.placeType||'')+' '+String(n.focusLabel||n.location||''))}
async function final(n,s){if(!valid(n.lon,n.lat))return false;clear();const h=named(n)?Math.max(280000,+n.pointHeight||420000):Math.max(180000,+n.pointHeight||300000);await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+n.lon,+n.lat,h),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration:1.05,complete:r,cancel:r}));if(s!==G.navSerial)return false;G.localLabelEntity=G.label?.(n.focusLabel||n.location,+n.lon,+n.lat,'country');G.__v52SemanticTrace.push({type:'final',label:n.focusLabel||n.location});return wait(2300,s)}
async function regional(n,s){const p=n.scenePlan||{},arr=[String(p.primaryIso3||n.countryIso3||'').toUpperCase(),...(p.contextCountries||[]).map(x=>String(x).toUpperCase())].filter(Boolean),uniq=[...new Set(arr)];clear();let all=[];for(const iso of uniq){G.flashCountry?.(iso,{...n,countryIso3:iso});all.push(...pts(iso))}if(all.length)await fit(all,s,1000000,6000000);if(s!==G.navSerial)return false;G.__v52SemanticTrace.push({type:'regional',countries:uniq});await wait(1500,s);return final(n,s)}
function own(n){const m=String(n.sceneMode||'').toUpperCase();return m==='POINT'||m==='ADMIN'||chain(n).length||named(n)}
G.__v52SemanticTrace=[];G.getV52SemanticTrace=()=>G.__v52SemanticTrace.slice();
G.runSequence=async function(n,iso,s){G.__v52SemanticTrace.length=0;clear();iso=String(n.countryIso3||iso||'').toUpperCase();const mode=String(n.sceneMode||'').toUpperCase();
 /* Attack stories no longer get an extra two-country overview. Delegate directly to the attack renderer. */
 if(mode==='ATTACK'||mode==='POTENTIAL_ATTACK')return previous(n,iso,s);
 if(!own(n))return previous(n,iso,s);
 /* Regional geography such as Hormuz explicitly shows only the countries declared as geographic context. */
 if(n.scenePlan?.regionalContext)return regional(n,s);
 /* Context countries are semantic metadata only. They must never leak flags/highlights into ordinary point stories. */
 if(!await country(n,iso,s))return false;
 if(!await admins(n,iso,s))return false;
 return final(n,s)
};
console.info('[News Globe] V52 semantic hierarchy engine r2 loaded');
})(window.NG14);