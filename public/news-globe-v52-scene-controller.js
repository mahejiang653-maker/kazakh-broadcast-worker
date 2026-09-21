(function boot(){const G=window.NG14;if(!G||!window.Cesium||!G.viewer||!G.countries)return setTimeout(boot,80);if(G.__v52AuthoritativeController)return;G.__v52AuthoritativeController=true;G.showNeighborCountryLabels=()=>{};const C=Cesium,legacy=G.runSequence,ents=[];const good=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b),wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const ISO2={RUS:'ru',UKR:'ua',SAU:'sa',YEM:'ye',USA:'us',IRN:'ir',OMN:'om',PSE:'ps',CHN:'cn',FRA:'fr',CHE:'ch',PRK:'kp',KOR:'kr',JPN:'jp',DEU:'de',GBR:'gb',POL:'pl',TUR:'tr',ISR:'il',LBN:'lb',SYR:'sy',IND:'in',PAK:'pk',KAZ:'kz'};const NAME={RUS:'俄罗斯',UKR:'乌克兰',SAU:'沙特阿拉伯',YEM:'也门',USA:'美国',IRN:'伊朗',OMN:'阿曼',PSE:'巴勒斯坦',CHN:'中国',FRA:'法国',CHE:'瑞士',PRK:'朝鲜',KOR:'韩国',JPN:'日本',DEU:'德国',GBR:'英国',POL:'波兰',TUR:'土耳其',ISR:'以色列',LBN:'黎巴嫩',SYR:'叙利亚',IND:'印度',PAK:'巴基斯坦',KAZ:'哈萨克斯坦'};
let storyIsos=[];
const BASE_BORDER=C.Color.fromCssColorString('#d8f3ff').withAlpha(.38),ACTIVE_BORDER=C.Color.fromCssColorString('#ff6670').withAlpha(1);
function resetBorders(){for(const e of G.borderEntities||[]){if(!e?.polyline)continue;e.show=true;e.polyline.width=.42;e.polyline.material=BASE_BORDER}}
function storyCountries(n,iso){const p=n?.scenePlan||{},a=[iso,n?.countryIso3,n?.secondaryCountryIso3,p.primaryIso3,...(Array.isArray(p.contextCountries)?p.contextCountries:[]),p.attackerIso3,p.victimIso3,n?.sourceCountryIso3,n?.targetCountryIso3];return[...new Set(a.map(x=>String(x||'').toUpperCase()).filter(x=>x&&G.countries.has(x)))]}
function styleStoryBorders(){for(const iso of storyIsos){const cc=G.countries.get(iso);for(const e of cc?.entities||[]){if(!e?.polyline)continue;e.show=true;e.polyline.width=.80;e.polyline.material=ACTIVE_BORDER}}}

function rm(e){try{G.viewer.entities.remove(e)}catch{}}
function purgeForeignLabels(){try{for(const e of G.viewer.entities.values.slice())if(e?.label&&!e.__v52OwnedLabel)rm(e)}catch{}}
function clear(){for(const e of ents.splice(0))rm(e);for(const k of ['v51SceneEntities','v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities']){const a=G[k];if(Array.isArray(a))for(const e of a.splice(0))rm(e)}try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{}try{if(G.markers)for(const e of G.markers)e.show=false;if(G.pulses)for(const e of G.pulses)e.show=false}catch{}purgeForeignLabels();resetBorders();styleStoryBorders()}
function feature(iso){return G.countries.get(String(iso||'').toUpperCase())?.feature||null}function collect(x,o=[]){if(!x)return o;if(Array.isArray(x)){if(x.length>1&&typeof x[0]==='number'&&typeof x[1]==='number')o.push(x);else for(const y of x)collect(y,o)}else if(x.coordinates)collect(x.coordinates,o);else if(x.geometry)collect(x.geometry,o);else if(x.features)for(const y of x.features)collect(y,o);return o}function carts(iso){return collect(feature(iso),[]).filter(p=>good(p[0],p[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0))}
function polygons(g){if(!g)return[];if(g.type==='Feature')return polygons(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(x=>polygons(x));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}function area(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(+r[j][0])*(+r[i][1])-(+r[i][0])*(+r[j][1]);return Math.abs(a/2)}function mainRing(iso){let best=null,ba=-1;for(const p of polygons(feature(iso))){const r=p?.[0]||[],a=area(r);if(r.length>3&&a>ba){best=r;ba=a}}return best}function centroid(r){let x=0,y=0,n=0;for(const p of r||[]){if(good(p?.[0],p?.[1])){x+=+p[0];y+=+p[1];n++}}return n?[x/n,y/n]:null}function mainland(iso){return centroid(mainRing(iso))||G.countries.get(iso)?.center||null}
function sample(r,max=320){if(!r)return[];if(r.length<=max)return r;const step=Math.ceil(r.length/max),out=[];for(let i=0;i<r.length;i+=step)out.push(r[i]);return out}function directionalOrigin(att,targetLon,targetLat){const r=mainRing(att),ca=mainland(att);if(!r||!ca)return null;let best=null,bd=Infinity;for(const p of sample(r)){let dx=+p[0]-targetLon;if(dx>180)dx-=360;if(dx<-180)dx+=360;const dy=+p[1]-targetLat,d=(dx*Math.cos(targetLat*Math.PI/180))**2+dy**2;if(d<bd){bd=d;best=[+p[0],+p[1]]}}if(!best)return null;return{lon:best[0]*.9+ca[0]*.1,lat:best[1]*.9+ca[1]*.1}}
let routeRaf=0,routeResolve=null;
function cancelCameraFlight(){
  try{G.viewer.camera.cancelFlight()}catch{}
  if(routeRaf){cancelAnimationFrame(routeRaf);routeRaf=0}
  if(routeResolve){const r=routeResolve;routeResolve=null;try{r(false)}catch{}}
}
async function fit(ps,s,min=650000,max=15000000,duration=1.25){if(!ps.length)return false;cancelCameraFlight();const b=C.BoundingSphere.fromPoints(ps),range=Math.max(min,Math.min(max,b.radius*2.2));await new Promise(r=>G.viewer.camera.flyToBoundingSphere(b,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration,easingFunction:C.EasingFunction.QUADRATIC_IN_OUT,complete:r,cancel:r}));return s===G.navSerial}
async function fly(lon,lat,h,s,duration=1.20){cancelCameraFlight();await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+lon,+lat,h),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration,easingFunction:C.EasingFunction.QUADRATIC_IN_OUT,complete:r,cancel:r}));return s===G.navSerial}
function smoothCruiseToCountry(iso,s){
  iso=String(iso||'').toUpperCase();
  const ps=carts(iso),center=mainland(iso);if(!ps.length||!center)return Promise.resolve(false);
  let from;try{from=C.Cartographic.fromCartesian(G.viewer.camera.positionWC)}catch{return Promise.resolve(false)}
  const toLonRaw=C.Math.toRadians(+center[0]),toLat=C.Math.toRadians(+center[1]);
  const dlon=Math.atan2(Math.sin(toLonRaw-from.longitude),Math.cos(toLonRaw-from.longitude));
  const ang=Math.acos(Math.max(-1,Math.min(1,Math.sin(from.latitude)*Math.sin(toLat)+Math.cos(from.latitude)*Math.cos(toLat)*Math.cos(dlon))));
  if(ang<C.Math.toRadians(7))return Promise.resolve(false);
  const km=ang*6378.137,b=C.BoundingSphere.fromPoints(ps);
  const endH=Math.max(700000,Math.min(9000000,b.radius*2.2));
  const startLon=from.longitude,endLon=startLon+dlon,startLat=from.latitude,endLat=toLat,startH=Math.max(120000,from.height||120000);
  const baseCruise=1700000+Math.min(5200000,km*520);
  const cruise=Math.max(baseCruise,Math.min(12000000,Math.max(startH,endH)*1.08));
  const duration=Math.max(2.05,Math.min(3.45,1.78+km/6200));
  const smoother=x=>x<=0?0:x>=1?1:x*x*x*(x*(x*6-15)+10);
  cancelCameraFlight();
  return new Promise(resolve=>{
    routeResolve=resolve;
    const t0=performance.now();
    const finish=ok=>{if(routeRaf){cancelAnimationFrame(routeRaf);routeRaf=0}if(routeResolve===resolve)routeResolve=null;resolve(ok)};
    const step=now=>{
      if(s!==G.navSerial){finish(false);return}
      const t=Math.min(1,(now-t0)/(duration*1000));
      const u=smoother(t);
      let lon=startLon+(endLon-startLon)*u;
      lon=Math.atan2(Math.sin(lon),Math.cos(lon));
      const lat=startLat+(endLat-startLat)*u;
      // R44: altitude uses two quintic Hermite halves. At the cruise midpoint
      // vertical velocity and acceleration settle smoothly to zero, then the
      // descent restarts gently instead of snapping into the downward leg.
      let h;
      if(u<=.5){
        const q=smoother(u*2);
        h=startH+(cruise-startH)*q;
      }else{
        const q=smoother((u-.5)*2);
        h=cruise+(endH-cruise)*q;
      }
      try{G.viewer.camera.setView({destination:C.Cartesian3.fromRadians(lon,lat,h),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0}})}catch{finish(false);return}
      if(t>=1){finish(true);return}
      routeRaf=requestAnimationFrame(step)
    };
    routeRaf=requestAnimationFrame(step)
  }).then(ok=>ok?{ok:true,km,cruise,duration,endH}:false)
}
function smoothApproachPoint(lon,lat,h,s){
  if(!good(lon,lat)||!Number.isFinite(+h))return Promise.resolve(false);
  let from;try{from=C.Cartographic.fromCartesian(G.viewer.camera.positionWC)}catch{return Promise.resolve(false)}
  const endLonRaw=C.Math.toRadians(+lon),endLat=C.Math.toRadians(+lat),endH=Math.max(120000,+h);
  const dlon=Math.atan2(Math.sin(endLonRaw-from.longitude),Math.cos(endLonRaw-from.longitude));
  const startLon=from.longitude,endLon=startLon+dlon,startLat=from.latitude,startH=Math.max(120000,from.height||120000);
  const ang=Math.acos(Math.max(-1,Math.min(1,Math.sin(startLat)*Math.sin(endLat)+Math.cos(startLat)*Math.cos(endLat)*Math.cos(dlon))));
  const km=ang*6378.137;
  const heightGap=Math.abs(startH-endH);
  const duration=Math.max(1.85,Math.min(2.85,1.72+km/4300+heightGap/8000000));
  const smoother=x=>x<=0?0:x>=1?1:x*x*x*(x*(x*6-15)+10);
  cancelCameraFlight();
  return new Promise(resolve=>{
    routeResolve=resolve;
    const t0=performance.now();
    const finish=ok=>{if(routeRaf){cancelAnimationFrame(routeRaf);routeRaf=0}if(routeResolve===resolve)routeResolve=null;resolve(ok)};
    const step=now=>{
      if(s!==G.navSerial){finish(false);return}
      const t=Math.min(1,(now-t0)/(duration*1000));
      // Horizontal travel starts slightly earlier; descent follows a fraction later.
      // This prevents the camera from feeling like it suddenly dives toward the red dot.
      const uh=smoother(t);
      const uv=smoother(Math.max(0,Math.min(1,(t-.06)/.94)));
      let xlon=startLon+(endLon-startLon)*uh;
      xlon=Math.atan2(Math.sin(xlon),Math.cos(xlon));
      const xlat=startLat+(endLat-startLat)*uh;
      const xh=startH+(endH-startH)*uv;
      try{G.viewer.camera.setView({destination:C.Cartesian3.fromRadians(xlon,xlat,xh),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0}})}catch{finish(false);return}
      if(t>=1){finish(true);return}
      routeRaf=requestAnimationFrame(step)
    };
    routeRaf=requestAnimationFrame(step)
  }).then(ok=>ok?{ok:true,km,duration,startH,endH}:false)
}

function flag(iso,lon,lat,dx=0,dy=-30,w=32,h=21,kind='attack'){if(G.overviewMode)return;const cc=ISO2[iso];if(!cc||!good(lon,lat))return;const o={position:C.Cartesian3.fromDegrees(+lon,+lat,82000),billboard:{image:`https://flagcdn.com/w80/${cc}.png`,width:w,height:h,pixelOffset:new C.Cartesian2(dx,dy),disableDepthTestDistance:Number.POSITIVE_INFINITY}};if(kind==='attack')o.__v52AttackFlag=true;else o.__v52CountryIntroFlag=true;const e=G.viewer.entities.add(o);if(e){if(kind==='attack')e.__v52AttackFlag=true;else e.__v52CountryIntroFlag=true;ents.push(e)}}
function countryName(iso,lon,lat,color){if(!good(lon,lat))return;const text=NAME[iso]||G.countryNameZh?.(iso)||G.countryName?.(iso)||iso;const e=G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,76000),label:{text:String(text),font:'700 15px "Microsoft YaHei","PingFang SC",sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK.withAlpha(.95),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString(color).withAlpha(.70),padding:new C.Cartesian2(8,5),pixelOffset:new C.Cartesian2(0,12),horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}});e.__v52OwnedLabel=true;ents.push(e)}
function territory(iso,color){iso=String(iso||'').toUpperCase();const col=C.Color.fromCssColorString('#b70f1f'),ch=iso==='CHN'?G.countries.get('CHN'):null,g=ch?.authoritativeOutline||feature(iso);for(const p of polygons(g)){const r=p?.[0]||[];if(r.length<3)continue;const pos=r.filter(q=>good(q?.[0],q?.[1])).map(q=>C.Cartesian3.fromDegrees(+q[0],+q[1],5000));if(pos.length<3)continue;ents.push(G.viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(pos),height:5000,material:col.withAlpha(.34),outline:false}}))}}
async function belligerents(att,vic,s){clear();territory(att,'#ff4050');territory(vic,'#3dbdff');const ac=mainland(att),vc=mainland(vic);if(ac){countryName(att,ac[0],ac[1],'#b91f35');flag(att,ac[0],ac[1],0,-30,32,21,'attack')}if(vc){countryName(vic,vc[0],vc[1],'#167caf');flag(vic,vc[0],vc[1],0,-30,32,21,'attack')}const ps=[...carts(att),...carts(vic)];if(!ps.length)return false;if(!await fit(ps,s,900000,11000000))return false;G.__v52Trace.push({stage:'belligerents',red:att,blue:vic,names:true,flags:true});return wait(1800,s)}
async function hiSwiss(){if(G.__v52SwissPrecise)return;try{const j=await fetch('https://raw.githubusercontent.com/ZHB/switzerland-geojson/master/country/switzerland.geojson',{cache:'force-cache'}).then(r=>r.json());const f=j.type==='Feature'?j:(j.features?.[0]);if(f?.geometry){const e=G.countries.get('CHE');if(e)e.feature=f;G.__v52SwissPrecise=true}}catch(e){console.warn('[V52] precise Swiss boundary unavailable',e)}}
async function country(iso,n,s){clear();if(iso==='CHE')await hiSwiss();territory(iso,'#ff4050');const c=mainland(iso);if(c){countryName(iso,c[0],c[1],'#b91f35');flag(iso,c[0],c[1],0,-30,32,21,'country')}const ps=carts(iso),arrived=G.__v52CruiseArrival&&G.__v52CruiseArrival.iso===iso&&G.__v52CruiseArrival.serial===s;G.__v52CruiseArrival=null;if(!arrived&&ps.length&&!await fit(ps,s,iso==='CHE'?430000:700000,9000000))return false;purgeForeignLabels();const continuing=good(n?.lon,n?.lat)||chain(n).length>0;G.__v52Trace.push({stage:'country-intro',iso,red:true,name:true,flag:true,continuousArrival:!!arrived,continuing});return s===G.navSerial&&wait(continuing?720:2100,s)}
function chain(n){const p=n.scenePlan||{};return (Array.isArray(n.adminChain)?n.adminChain:Array.isArray(p.targetAdminChain)?p.targetAdminChain:Array.isArray(p.adminChain)?p.adminChain:[]).filter(Boolean)}
async function cityStage(a,iso,s){if(!a||!good(a.lon,a.lat))return true;clear();const label=String(a.focusLabel||a.location||'城市');if(!await fly(+a.lon,+a.lat,850000,s,1.25))return false;if(s!==G.navSerial)return false;try{G.localLabelEntity=G.label?.(label,+a.lon,+a.lat,'country');if(G.localLabelEntity)G.localLabelEntity.__v52OwnedLabel=true}catch{}G.__v52Trace.push({stage:'city',name:label,iso,lon:+a.lon,lat:+a.lat,height:850000});return wait(1700,s)}
function taiwanFeature(){const fs=G.chinaLevel1Geo?.features||[];const norm=x=>String(x||'').replace(/中华人民共和国|中国|台湾省|台湾地区|台湾/g,'台湾').replace(/省|地区/g,'');for(const f of fs){const vals=Object.values(f.properties||{}).map(String);if(vals.some(v=>/台湾/.test(v)||norm(v)==='台湾'))return f}return null}
async function taiwanStage(a,s){let f=taiwanFeature();if(!f?.geometry){const q=new URLSearchParams({location:'台湾地区',placeType:'省级行政区',country:'中国',countryIso3:'CHN',lon:'120.97',lat:'23.70'});try{const r=await fetch('/api/geo-highlight?'+q,{cache:'no-store'}),j=r.ok?await r.json():null;if(j?.geometry&&!j.approximate)f={geometry:j.geometry}}catch{}}if(!f?.geometry)return false;clear();const col=C.Color.fromCssColorString('#ff4050');let ps=[];for(const p of polygons(f)){const r=p?.[0]||[],pos=r.filter(q=>good(q?.[0],q?.[1])).map(q=>C.Cartesian3.fromDegrees(+q[0],+q[1],6000));if(pos.length<3)continue;ps.push(...pos);ents.push(G.viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(pos),height:6000,material:col.withAlpha(.28),outline:true,outlineColor:col.withAlpha(.98)}}))}const cc=centroid(collect(f,[]));if(cc)countryName('CHN',cc[0],cc[1],'#b91f35');if(ps.length&&!await fit(ps,s,480000,2600000))return false;G.__v52Trace.push({stage:'admin',name:'台湾地区',fullTaiwan:true});return wait(1900,s)}
async function admins(n,iso,s){for(const a of chain(n)){if(s!==G.navSerial)return false;const type=String(a.placeType||'');if((a.fullTaiwan||/台湾/.test(String(a.location||a.focusLabel||'')))&&iso==='CHN'){if(!await taiwanStage(a,s))return false;continue}if(/市|city/i.test(type)){if(!await cityStage(a,iso,s))return false;continue}clear();await G.flashAdmin?.(a,iso,s,1700);G.__v52Trace.push({stage:'admin',name:a.focusLabel||a.location});if(s!==G.navSerial)return false;await wait(450,s)}return true}
async function final(n,s,flagIso=null){if(!good(n.lon,n.lat))return false;const regional=/海峡|海湾|海域|湾区|群岛|半岛/.test(String(n.focusLabel||n.location||'')),targetH=regional?430000:Math.max(190000,+n.pointHeight||260000);const approach=await smoothApproachPoint(+n.lon,+n.lat,targetH,s);if(!approach)return false;if(s!==G.navSerial)return false;clear();G.localLabelEntity=G.label?.(n.focusLabel||n.location,+n.lon,+n.lat,'country');if(G.localLabelEntity)G.localLabelEntity.__v52OwnedLabel=true;if(flagIso)flag(flagIso,+n.lon,+n.lat,25,-11,21,13,'attack');G.__v52Trace.push({stage:'final',lon:+n.lon,lat:+n.lat,label:n.focusLabel||n.location,continuousApproach:true,duration:+approach.duration.toFixed(2)});return wait(2100,s)}async function regional(n,s){const p=n.scenePlan||{},is=[String(p.primaryIso3||n.countryIso3||'').toUpperCase(),...(p.contextCountries||[]).map(x=>String(x).toUpperCase())].filter(Boolean),uniq=[...new Set(is)];clear();let ps=[];for(let i=0;i<uniq.length;i++){const x=uniq[i];if(x==='CHE')await hiSwiss();const color=i===0?'#ff4050':'#3dbdff';territory(x,color);const c=mainland(x);if(c){countryName(x,c[0],c[1],i===0?'#b91f35':'#167caf');flag(x,c[0],c[1],0,-30,32,21,'country')}ps.push(...carts(x))}if(ps.length)await fit(ps,s,900000,6500000);G.__v52Trace.push({stage:'regional',countries:uniq,names:true,flags:true});if(s!==G.navSerial)return false;await wait(1800,s);return final(n,s)}
async function attack(n,iso,s){const p=n.scenePlan||{},att=String(p.attackerIso3||n.sourceCountryIso3||'').toUpperCase(),vic=String(p.victimIso3||n.targetCountryIso3||n.countryIso3||iso||'').toUpperCase(),target={lon:+(n.targetLon??n.lon),lat:+(n.targetLat??n.lat)};if(!att||!vic||!good(target.lon,target.lat))return legacy(n,iso,s);if(!await belligerents(att,vic,s))return;if(s!==G.navSerial)return;clear();const src=good(n.sourceLon,n.sourceLat)?{lon:+n.sourceLon,lat:+n.sourceLat}:directionalOrigin(att,target.lon,target.lat);if(!src)return final(n,s,vic);const ps=[C.Cartesian3.fromDegrees(src.lon,src.lat,0),C.Cartesian3.fromDegrees(target.lon,target.lat,0)];await fit(ps,s,300000,2300000);if(s!==G.navSerial)return;const info={attackerIso:att,targetIso:vic,sourceLon:src.lon,sourceLat:src.lat,targetLon:target.lon,targetLat:target.lat,attackType:n.attackType,sourceType:p.sourceType||n.sourceType,sourceLabel:p.sourceLabel||`${att}方向`,targetLabel:p.targetLabel||n.focusLabel||n.location,potential:String(n.sceneMode).toUpperCase()==='POTENTIAL_ATTACK'};G.__v52Trace.push({stage:'attack-route',att,vic,source:src,target});if(info.potential)G.v29ShowPotential?.(info);else if(String(n.attackType).toLowerCase()==='drone')G.v29ShowDrone?.(n,info);else G.v29ShowMissile?.(n,info);flag(att,src.lon,src.lat,24,-11,21,13,'attack');flag(vic,target.lon,target.lat,24,-11,21,13,'attack');await wait(String(n.attackType).toLowerCase()==='drone'?3300:2200,s);if(s!==G.navSerial)return;return final(n,s,vic)}
function prelight(iso){
  iso=String(iso||'').toUpperCase();if(!iso)return;
  try{territory(iso,'#ff4050')}catch{}
}
async function travelTransition(n,iso,s){
  iso=String(iso||n?.countryIso3||'').toUpperCase();
  const result=await smoothCruiseToCountry(iso,s);
  if(result===false){
    if(s!==G.navSerial)return false;
    G.__v52Trace.push({stage:'travel-ready',iso,continuous:true,midpoint:false});
    return true
  }
  G.__v52CruiseArrival={iso,serial:s};
  G.__v52Trace.push({stage:'travel-continuous',iso,continuous:true,midpoint:true,km:Math.round(result.km),peak:Math.round(result.cruise),duration:+result.duration.toFixed(2)});
  return s===G.navSerial
}
G.__v52Trace=[];G.getV52Trace=()=>G.__v52Trace.slice();G.runSequence=async function(n,iso,s){G.__v52Trace.length=0;iso=String(n.countryIso3||iso||'').toUpperCase();storyIsos=storyCountries(n,iso);clear();prelight(iso);if(!await travelTransition(n,iso,s))return;const mode=String(n.sceneMode||'').toUpperCase(),p=n.scenePlan||{};if(mode==='ATTACK'||mode==='POTENTIAL_ATTACK')return attack(n,iso,s);if(p.regionalContext)return regional(n,s);if(mode==='POINT'||mode==='ADMIN'||chain(n).length){if(!await country(iso,n,s))return;if(!await admins(n,iso,s))return;return final(n,s)}return legacy(n,iso,s)};G.__V52_SEQUENCE_OWNER='r46-soft-final-approach';console.info('[News Globe] V52 R46: shorter country dwell and gentler continuous approach to event point');})();