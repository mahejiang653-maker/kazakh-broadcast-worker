(function(G){
if(!G||!window.Cesium||G.__v52AttackSequenceHotfix)return;
G.__v52AttackSequenceHotfix=true;
const C=Cesium, prevRun=G.runSequence;
const COLORS={att:'#ff982f',vic:'#ff3b4d'};
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const good=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const add=e=>{if(e){G.__v52AttackEntities=G.__v52AttackEntities||[];G.__v52AttackEntities.push(e)}return e};
function clearOwn(){for(const e of (G.__v52AttackEntities||[]).splice(0))try{G.viewer.entities.remove(e)}catch{}}
function clean(){clearOwn();try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{}}
function geom(iso){return G.countries?.get?.(String(iso||'').toUpperCase())?.feature?.geometry||null}
function rings(g){if(!g)return[];if(g.type==='Polygon')return g.coordinates?.[0]?[g.coordinates[0]]:[];if(g.type==='MultiPolygon')return(g.coordinates||[]).map(p=>p?.[0]).filter(Boolean);return[]}
function area(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(+r[j][0])*(+r[i][1])-(+r[i][0])*(+r[j][1]);return Math.abs(a/2)}
function mainRing(iso){let best=null,ba=-1;for(const r of rings(geom(iso))){const a=area(r);if(r?.length>3&&a>ba){best=r;ba=a}}return best}
function sample(r,max=260){if(!r)return[];if(r.length<=max)return r;const step=Math.ceil(r.length/max),out=[];for(let i=0;i<r.length;i+=step)out.push(r[i]);return out}
function center(r){let x=0,y=0,n=0;for(const p of r||[])if(good(p?.[0],p?.[1])){x+=+p[0];y+=+p[1];n++}return n?[x/n,y/n]:null}
function closest(a,b){const A=sample(mainRing(a)),B=sample(mainRing(b));if(!A.length||!B.length)return null;let best=null,bd=Infinity;for(const p of A)for(const q0 of B){let px=+p[0],qx=+q0[0],dl=qx-px;if(dl>180)qx-=360;if(dl<-180)qx+=360;const lat=(+p[1]+ +q0[1])/2,dx=(qx-px)*Math.cos(lat*Math.PI/180),dy=+q0[1]-+p[1],d=dx*dx+dy*dy;if(d<bd){bd=d;best={p:[px,+p[1]],q:[qx,+q0[1]],gap:Math.sqrt(d)}}}if(!best)return null;let lon=(best.p[0]+best.q[0])/2;while(lon>180)lon-=360;while(lon<-180)lon+=360;return{...best,mid:[lon,(best.p[1]+best.q[1])/2]}}
function drawCountry(iso,color){const col=C.Color.fromCssColorString(color);for(const r of rings(geom(iso))){if(r.length<3)continue;add(G.viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(r.map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],4500))),height:4500,material:col.withAlpha(.12),outline:false}}));const ps=G.positions?.(r,10500)||[];if(ps.length)add(G.viewer.entities.add({polyline:{positions:ps,width:2.2,material:new C.PolylineGlowMaterialProperty({glowPower:.1,color:col.withAlpha(.95)})}}))}}
async function flyPoint(lon,lat,height,s,duration=1){await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+lon,+lat,+height),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration,complete:r,cancel:r}));return s===G.navSerial}
async function borderStage(att,vic,s){const g=closest(att,vic);if(!g)return false;clean();drawCountry(att,COLORS.att);drawCountry(vic,COLORS.vic);const h=Math.max(700000,Math.min(3600000,650000+g.gap*155000));if(!await flyPoint(g.mid[0],g.mid[1],h,s,.95))return false;return wait(1300,s)}
function origin(att,targetLon,targetLat){const r=sample(mainRing(att),340),c=center(mainRing(att));if(!r.length)return null;let best=null,bd=Infinity;for(const p of r){let dx=+p[0]-targetLon;if(dx>180)dx-=360;if(dx<-180)dx+=360;const dy=+p[1]-targetLat,d=(dx*Math.cos(targetLat*Math.PI/180))**2+dy**2;if(d<bd){bd=d;best=[+p[0],+p[1]]}}if(!best)return null;if(!c)return{lon:best[0],lat:best[1]};return{lon:best[0]*.92+c[0]*.08,lat:best[1]*.92+c[1]*.08}}
async function fitRoute(a,b,s){const ps=[C.Cartesian3.fromDegrees(a.lon,a.lat,0),C.Cartesian3.fromDegrees(b.lon,b.lat,0)],sp=C.BoundingSphere.fromPoints(ps);const range=Math.max(420000,Math.min(4800000,sp.radius*2.8));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration:.95,complete:r,cancel:r}));return s===G.navSerial}
async function finalPoint(n,s){clean();if(!good(n.lon,n.lat))return false;if(!await flyPoint(+n.lon,+n.lat,+n.pointHeight||320000,s,1.0))return false;const e=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+n.lon,+n.lat,30000),point:{pixelSize:10,color:C.Color.fromCssColorString('#ff4050'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});G.localHighlightEntities?.push(e);G.localLabelEntity=G.label?.(n.focusLabel||n.location,+n.lon,+n.lat,'country');return wait(2600,s)}
async function runAttack(n,iso,s){const p=n.scenePlan||{},att=String(p.attackerIso3||n.sourceCountryIso3||'').toUpperCase(),vic=String(p.victimIso3||n.targetCountryIso3||n.countryIso3||iso||'').toUpperCase();if(!att||!vic||!good(n.lon,n.lat))return prevRun(n,iso,s);
  /* First frame for a two-country attack is the two-country border/spatial relation. Do not show victim-country-wide first. */
  if(!await borderStage(att,vic,s))return prevRun(n,iso,s);if(s!==G.navSerial)return;
  const type=String(n.attackType||p.finalType||'').toLowerCase();
  if(/airstrike|空袭/.test(type))return finalPoint(n,s);
  const src=good(n.sourceLon,n.sourceLat)?{lon:+n.sourceLon,lat:+n.sourceLat}:origin(att,+n.lon,+n.lat);if(!src)return finalPoint(n,s);
  clean();if(!await fitRoute(src,{lon:+n.lon,lat:+n.lat},s))return;if(s!==G.navSerial)return;
  const info={attackerIso:att,targetIso:vic,sourceLon:src.lon,sourceLat:src.lat,targetLon:+n.lon,targetLat:+n.lat,sourceLabel:p.sourceLabel||'发起方',targetLabel:n.focusLabel||n.location,potential:!!n.potentialStrike};
  if(/drone|无人机/.test(type))G.v29ShowDrone?.(n,info);else G.v29ShowMissile?.(n,info);
  await wait(/drone|无人机/.test(type)?3300:2200,s);if(s!==G.navSerial)return;return finalPoint(n,s)
}
G.runSequence=async function(n,iso,s){const mode=String(n?.sceneMode||'').toUpperCase();if((mode==='ATTACK'||mode==='POTENTIAL_ATTACK')&&n?.secondaryCountryIso3)return runAttack(n,iso,s);return prevRun(n,iso,s)};
console.info('[News Globe] V52 dual-country attack sequence hotfix loaded');
})(window.NG14);