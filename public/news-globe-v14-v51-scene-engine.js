(function(G){
if(!G||!window.Cesium||G.__v51SceneEngine)return;
G.__v51SceneEngine=true;
const C=Cesium;
const fallbackRun=G.runSequence;
const fallbackDuration=G.storyDuration;
const COLOR={main:'#ff4050',second:'#3dbdff',attack:'#ff982f',victim:'#ff3b4d',org:'#ff5967'};
const N={CHN:'中国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',PSE:'巴勒斯坦',LBN:'黎巴嫩',DEU:'德国',FRA:'法国',GBR:'英国',POL:'波兰',ROU:'罗马尼亚',TUR:'土耳其',SYR:'叙利亚',JOR:'约旦',EGY:'埃及',IND:'印度',PAK:'巴基斯坦',AFG:'阿富汗',JPN:'日本',PRK:'朝鲜',AUS:'澳大利亚',CAN:'加拿大',BRA:'巴西',THA:'泰国',SGP:'新加坡',SAU:'沙特阿拉伯',ARE:'阿联酋',QAT:'卡塔尔',IRQ:'伊拉克',KWT:'科威特',VEN:'委内瑞拉',KAZ:'哈萨克斯坦',OMN:'阿曼',DZA:'阿尔及利亚',LBY:'利比亚',NGA:'尼日利亚',MEX:'墨西哥',MYS:'马来西亚',IDN:'印度尼西亚',PHL:'菲律宾',VNM:'越南',MMR:'缅甸',BHR:'巴林',BRN:'文莱',AZE:'阿塞拜疆',SDN:'苏丹',SSD:'南苏丹',COG:'刚果（布）',GNQ:'赤道几内亚',GAB:'加蓬',LTU:'立陶宛',BLR:'白俄罗斯',YEM:'也门',DNK:'丹麦',KOR:'韩国'};
// ISO 3166-1: i18n-iso-countries 7.14.0 (MIT); complete flag identity independent of GeoJSON fields.
const ISO2={"ABW":"aw","AFG":"af","AGO":"ao","AIA":"ai","ALA":"ax","ALB":"al","AND":"ad","ARE":"ae","ARG":"ar","ARM":"am","ASM":"as","ATA":"aq","ATF":"tf","ATG":"ag","AUS":"au","AUT":"at","AZE":"az","BDI":"bi","BEL":"be","BEN":"bj","BES":"bq","BFA":"bf","BGD":"bd","BGR":"bg","BHR":"bh","BHS":"bs","BIH":"ba","BLM":"bl","BLR":"by","BLZ":"bz","BMU":"bm","BOL":"bo","BRA":"br","BRB":"bb","BRN":"bn","BTN":"bt","BVT":"bv","BWA":"bw","CAF":"cf","CAN":"ca","CCK":"cc","CHE":"ch","CHL":"cl","CHN":"cn","CIV":"ci","CMR":"cm","COD":"cd","COG":"cg","COK":"ck","COL":"co","COM":"km","CPV":"cv","CRI":"cr","CUB":"cu","CUW":"cw","CXR":"cx","CYM":"ky","CYP":"cy","CZE":"cz","DEU":"de","DJI":"dj","DMA":"dm","DNK":"dk","DOM":"do","DZA":"dz","ECU":"ec","EGY":"eg","ERI":"er","ESH":"eh","ESP":"es","EST":"ee","ETH":"et","FIN":"fi","FJI":"fj","FLK":"fk","FRA":"fr","FRO":"fo","FSM":"fm","GAB":"ga","GBR":"gb","GEO":"ge","GGY":"gg","GHA":"gh","GIB":"gi","GIN":"gn","GLP":"gp","GMB":"gm","GNB":"gw","GNQ":"gq","GRC":"gr","GRD":"gd","GRL":"gl","GTM":"gt","GUF":"gf","GUM":"gu","GUY":"gy","HKG":"hk","HMD":"hm","HND":"hn","HRV":"hr","HTI":"ht","HUN":"hu","IDN":"id","IMN":"im","IND":"in","IOT":"io","IRL":"ie","IRN":"ir","IRQ":"iq","ISL":"is","ISR":"il","ITA":"it","JAM":"jm","JEY":"je","JOR":"jo","JPN":"jp","KAZ":"kz","KEN":"ke","KGZ":"kg","KHM":"kh","KIR":"ki","KNA":"kn","KOR":"kr","KWT":"kw","LAO":"la","LBN":"lb","LBR":"lr","LBY":"ly","LCA":"lc","LIE":"li","LKA":"lk","LSO":"ls","LTU":"lt","LUX":"lu","LVA":"lv","MAC":"mo","MAF":"mf","MAR":"ma","MCO":"mc","MDA":"md","MDG":"mg","MDV":"mv","MEX":"mx","MHL":"mh","MKD":"mk","MLI":"ml","MLT":"mt","MMR":"mm","MNE":"me","MNG":"mn","MNP":"mp","MOZ":"mz","MRT":"mr","MSR":"ms","MTQ":"mq","MUS":"mu","MWI":"mw","MYS":"my","MYT":"yt","NAM":"na","NCL":"nc","NER":"ne","NFK":"nf","NGA":"ng","NIC":"ni","NIU":"nu","NLD":"nl","NOR":"no","NPL":"np","NRU":"nr","NZL":"nz","OMN":"om","PAK":"pk","PAN":"pa","PCN":"pn","PER":"pe","PHL":"ph","PLW":"pw","PNG":"pg","POL":"pl","PRI":"pr","PRK":"kp","PRT":"pt","PRY":"py","PSE":"ps","PYF":"pf","QAT":"qa","REU":"re","ROU":"ro","RUS":"ru","RWA":"rw","SAU":"sa","SDN":"sd","SEN":"sn","SGP":"sg","SGS":"gs","SHN":"sh","SJM":"sj","SLB":"sb","SLE":"sl","SLV":"sv","SMR":"sm","SOM":"so","SPM":"pm","SRB":"rs","SSD":"ss","STP":"st","SUR":"sr","SVK":"sk","SVN":"si","SWE":"se","SWZ":"sz","SXM":"sx","SYC":"sc","SYR":"sy","TCA":"tc","TCD":"td","TGO":"tg","THA":"th","TJK":"tj","TKL":"tk","TKM":"tm","TLS":"tl","TON":"to","TTO":"tt","TUN":"tn","TUR":"tr","TUV":"tv","TWN":"tw","TZA":"tz","UGA":"ug","UKR":"ua","UMI":"um","URY":"uy","USA":"us","UZB":"uz","VAT":"va","VCT":"vc","VEN":"ve","VGB":"vg","VIR":"vi","VNM":"vn","VUT":"vu","WLF":"wf","WSM":"ws","XKK":"xk","XKX":"xk","YEM":"ye","ZAF":"za","ZMB":"zm","ZWE":"zw"};
const OPEC=['DZA','COG','GNQ','GAB','IRN','IRQ','KWT','LBY','NGA','SAU','ARE','VEN','AZE','BHR','BRN','KAZ','MYS','MEX','OMN','RUS','SSD','SDN'];
const OPEC_GROUPS=[['IRN','IRQ','KWT','SAU','ARE','BHR','OMN'],['DZA','COG','GNQ','GAB','LBY','NGA','SSD','SDN'],['RUS','AZE','KAZ'],['MYS','BRN'],['VEN','MEX']];
const good=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b);
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const countryLabel=iso=>{iso=String(iso||'').toUpperCase();const v=G.countryNameZh?.(iso)||G.countryName?.(iso)||N[iso];return v&&!/^[A-Z]{3}$/.test(String(v))?String(v):(N[iso]||'未知国家')};
G.v51SceneEntities=[];
G.v52FlagAudit={created:0,removed:0,loadSuccess:0,loadError:0,invalid:0,events:[],snapshot(){const v=G.viewer;return {created:this.created,removed:this.removed,loadSuccess:this.loadSuccess,loadError:this.loadError,invalid:this.invalid,active:this.events.filter(x=>x.entity&&v?.entities?.contains?.(x.entity)).length,items:this.events.slice(-12).map(x=>({iso:x.iso,createdAt:x.at,stillInScene:!!v?.entities?.contains?.(x.entity),imageType:typeof x.entity?.billboard?.image?.getValue?.(C.JulianDate.now()),show:x.entity?.show}))}}};

const add=e=>{if(e)G.v51SceneEntities.push(e);return e};
function purgeList(k){const a=G[k];if(!Array.isArray(a))return;for(const e of a.splice(0))try{G.viewer.entities.remove(e)}catch{}}
function clearScene(){G.v52Attack?.clear();for(const e of G.v51SceneEntities.splice(0))try{if(G.v52FlagAudit.events.some(x=>x.entity===e))G.v52FlagAudit.removed++;G.viewer.entities.remove(e)}catch{};for(const k of ['v50Entities','v49Entities','v48Entities','v47Entities','v45bEntities','v44Entities','v38Entities','v37Entities','v36Entities'])purgeList(k);try{G.clearInteractionEffects?.()}catch{}try{G.clearSecondaryCountry?.()}catch{}try{G.clearLocal?.()}catch{}try{G.clearCountry?.()}catch{}try{G.clearArc?.()}catch{}const h=document.getElementById('scenePlanHud');if(h){h.style.display='none';h.innerHTML=''}}
function hideBase(){try{if(G.markers?.[G.current])G.markers[G.current].show=false;if(G.pulses?.[G.current])G.pulses[G.current].show=false}catch{}}
// Replace the preceding stage only after the next admin geometry is ready.
G.v51PrepareAdmin=()=>{clearScene();hideBase()};
function raw(iso){return G.countries?.get?.(String(iso||'').toUpperCase())?.feature||null}
/* Country geometry must always come from the country boundary feature. Province GeoJSON is only for flashAdmin/adminChain. */
function viewFeatures(iso){const f=raw(iso);return f?[f]:[]}
function polygons(g){if(!g)return[];if(g.type==='Feature')return polygons(g.geometry);if(g.type==='FeatureCollection')return(g.features||[]).flatMap(x=>polygons(x));if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates||[];return[]}
function collect(g,out=[]){if(!g)return out;if(Array.isArray(g)){if(g.length>=2&&typeof g[0]==='number'&&typeof g[1]==='number')out.push(g);else for(const x of g)collect(x,out)}else if(g.coordinates)collect(g.coordinates,out);else if(g.geometry)collect(g.geometry,out);else if(Array.isArray(g.features))for(const f of g.features)collect(f,out);return out}
function carts(iso){const a=[];for(const f of viewFeatures(iso))for(const p of collect(f,[]))if(good(p[0],p[1]))a.push(C.Cartesian3.fromDegrees(+p[0],+p[1],0));return a}
function area(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(+r[j][0])*(+r[i][1])-(+r[i][0])*(+r[j][1]);return Math.abs(a/2)}
function mainRing(iso){let best=null,ba=-1;for(const p of polygons(raw(iso))){const r=p?.[0]||[],a=area(r);if(r.length>3&&a>ba){best=r;ba=a}}return best}
function centroid(r){let x=0,y=0,n=0;for(const p of r||[]){if(good(p?.[0],p?.[1])){x+=+p[0];y+=+p[1];n++}}return n?[x/n,y/n]:null}
function mainland(iso){iso=String(iso||'').toUpperCase();if(iso==='CHN')return[103.8,35.4];return centroid(mainRing(iso))||G.countries?.get?.(iso)?.center||null}
// Countries with distant overseas territories need a camera that frames the
// relevant territorial component. Keep every real polygon rendered: only the
// overview CAMERA chooses its local group (e.g. metropolitan France).
const DISPERSED_TERRITORIES=new Set(['FRA','USA','GBR','ESP','PRT','NLD','NOR']);
function countryFramePoints(iso,focus=null){
 iso=String(iso||'').toUpperCase();const all=carts(iso);
 if(!DISPERSED_TERRITORIES.has(iso)||all.length<4)return all;
 const pieces=polygons(raw(iso)).map(poly=>poly?.[0]).filter(r=>r?.length>=3);
 if(pieces.length<2)return all;
 const target=good(focus?.lon,focus?.lat)?[+focus.lon,+focus.lat]:null;
 let best=null,score=Infinity;
 for(const ring of pieces){
  const pts=ring.filter(p=>good(p?.[0],p?.[1])).map(p=>C.Cartesian3.fromDegrees(+p[0],+p[1],0));
  if(pts.length<3)continue;
  const sphere=C.BoundingSphere.fromPoints(pts);
  // Without a known incident, prefer the largest landmass. With one, frame
  // the nearest component, including real incidents in overseas territories.
  const d=target?C.Cartesian3.distance(sphere.center,C.Cartesian3.fromDegrees(target[0],target[1],0)):-area(ring);
  if(d<score){best=pts;score=d}
 }
 if(!best)return all;
 const whole=C.BoundingSphere.fromPoints(all),regional=C.BoundingSphere.fromPoints(best);
 return whole.radius>Math.max(180000,regional.radius*1.65)?best:all;
}
function impactHeight(ctx){
 const canvas=G.viewer.scene.canvas,aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
 const pts=countryFramePoints(ctx.data.vic,ctx.data.target);
 const radius=pts.length?C.BoundingSphere.fromPoints(pts).radius:Infinity;
 const scale=radius<180000?.30:radius<350000?.45:1;
 // Tight enough for the West Bank, Israel and other small states, but not so
 // tight that a portrait phone loses all geographic context.
 return Math.round(Math.max(aspect<.8?500000:350000,(aspect<.8?2400000:1650000)*scale));
}
/* Fill follows the same existing China outline as the border; camera fitting stays unchanged. */
function drawCountry(iso,color,alpha=.14,width=2.35){const col=C.Color.fromCssColorString(color),outline=String(iso).toUpperCase()==='CHN'?G.countries?.get('CHN')?.authoritativeOutline:null;for(const f of outline?[outline]:viewFeatures(iso))for(const p of polygons(f)){const r=p?.[0]||[];if(r.length<3)continue;add(G.viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(r.map(q=>C.Cartesian3.fromDegrees(+q[0],+q[1],5000))),height:5000,material:col.withAlpha(alpha),outline:false}}))}}
function label(text,lon,lat,{dx=0,dy=-27,font=14,bg=.43,color='#f5f9ff',height=65000}={}){if(!text||!good(lon,lat))return;const e=add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,height),label:{text:String(text),font:`600 ${font}px "Microsoft YaHei","PingFang SC",sans-serif`,fillColor:C.Color.fromCssColorString(color),outlineColor:C.Color.BLACK.withAlpha(.94),outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#030a12').withAlpha(bg),padding:new C.Cartesian2(7,4),pixelOffset:new C.Cartesian2(dx,dy),horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));e.__v52FixedLabelOffset=new C.Cartesian2(dx,dy);return e}
function flag(iso,lon,lat,{dx=0,dy=-17,w=21,h=13}={}){
 const key=String(iso||'').toUpperCase(),cc=ISO2[key]||String(G.countries?.get(key)?.iso2||'').toLowerCase();
 if(!/^[a-z]{2}$/.test(cc)||!good(lon,lat)){G.v52FlagAudit.invalid++;return;}
 const remote='https://flagcdn.com/w40/'+cc+'.png';
 // Always render a local PNG immediately. Android/Chrome supports Unicode flag emoji in canvas.
 // A remote PNG can replace it after loading, but a blocked CDN never leaves an empty billboard.
 const local=G.v52FlagImages?.[cc];
 let initial=local||remote;
 if(!local)try{
  if(typeof document?.createElement==='function'){
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=40;
   const ctx=canvas.getContext('2d');
   if(ctx){ctx.fillStyle='#f3f5f8';ctx.fillRect(0,0,64,40);
    const emoji=[...cc.toUpperCase()].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('');
    ctx.font='34px "Noto Color Emoji","Apple Color Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(emoji,32,21);initial=canvas.toDataURL('image/png')}
  }
 }catch{}
 const entity=add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,30000),billboard:{image:initial,width:w,height:h,pixelOffset:new C.Cartesian2(dx,dy),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));

// Viewport-level fallback avoids Cesium container stacking and clipping.
 try{
  const scene=G.viewer?.scene;
  if(scene?.postRender&&typeof document?.createElement==='function'&&document.body){
   const el=document.createElement('img');el.alt=key+' flag';el.src=initial;el.dataset.flagSource=local?'bundled':'remote';
   el.style.cssText='position:fixed;z-index:2147483000;width:'+Math.max(30,w)+'px;height:'+Math.max(20,h)+'px;object-fit:fill;pointer-events:none;display:none;transform:translate(-50%,-50%)';
   document.body.appendChild(el);
   G.v52FlagAudit.domCreated=(G.v52FlagAudit.domCreated||0)+1;
   const update=()=>{
    try{
     if(!G.viewer?.entities?.contains?.(entity)){
      scene.postRender.removeEventListener(update);el.remove();G.v52FlagAudit.domRemoved=(G.v52FlagAudit.domRemoved||0)+1;return;
     }
     const p=entity.position?.getValue?.(G.viewer.clock.currentTime);
     const project=C.SceneTransforms?.worldToWindowCoordinates||C.SceneTransforms?.wgs84ToWindowCoordinates;const xy=p&&typeof project==='function'&&project(scene,p);
     const rect=scene.canvas?.getBoundingClientRect?.();
     if(!xy||!rect||!Number.isFinite(xy.x)||!Number.isFinite(xy.y)||xy.x<0||xy.y<0||xy.x>rect.width||xy.y>rect.height){
      el.style.display='none';G.v52FlagAudit.domOffscreen=(G.v52FlagAudit.domOffscreen||0)+1;return;
     }
     const offset=entity.billboard.pixelOffset.getValue(G.viewer.clock.currentTime);el.style.left=(rect.left+xy.x+offset.x)+'px';el.style.top=(rect.top+xy.y+offset.y)+'px';el.style.display='block';
     G.v52FlagAudit.domVisible=(G.v52FlagAudit.domVisible||0)+1;
    }catch(e){el.style.display='none';G.v52FlagAudit.domError=String(e?.message||e)}
   };
   scene.postRender.addEventListener(update);update();
  }else{G.v52FlagAudit.domError='scene/postRender/body unavailable'}
 }catch(e){G.v52FlagAudit.domError=String(e?.message||e)}
 G.v52FlagAudit.created++;G.v52FlagAudit.events.push({iso:key,at:Date.now(),entity});if(G.v52FlagAudit.events.length>40)G.v52FlagAudit.events.shift();
 if(!local&&typeof Image!=='undefined'&&initial!==remote){const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{G.v52FlagAudit.loadSuccess++;try{if(G.viewer?.entities?.contains?.(entity))entity.billboard.image=img}catch{}};img.onerror=()=>{G.v52FlagAudit.loadError++};img.src=remote}
 return entity;
}
function mark(lon,lat,text,{size=10,color=COLOR.victim,dy=-29}={}){if(!good(lon,lat))return;add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,30000),point:{pixelSize:size,color:C.Color.fromCssColorString(color),outlineColor:C.Color.WHITE,outlineWidth:1.8,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));add(G.viewer.entities.add({position:C.Cartesian3.fromDegrees(+lon,+lat,700),ellipse:{semiMajorAxis:new C.CallbackProperty(()=>8500+((Math.sin((G.pulsePhase||0)*2.1)+1)/2)*14500,false),semiMinorAxis:new C.CallbackProperty(()=>8500+((Math.sin((G.pulsePhase||0)*2.1)+1)/2)*14500,false),material:new C.ColorMaterialProperty(new C.CallbackProperty(()=>C.Color.fromCssColorString(color).withAlpha(.08),false)),outline:true,outlineColor:new C.CallbackProperty(()=>C.Color.fromCssColorString(color).withAlpha(.48),false)}}));if(text)label(text,lon,lat,{dy,font:14,bg:.46,height:30000})}
async function flyPoint(lon,lat,height,s,duration=1.0){if(s!==G.navSerial||!good(lon,lat))return false;const completed=await new Promise(r=>G.viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(+lon,+lat,+height),orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0},duration,complete:()=>r(true),cancel:()=>r(false)}));return completed&&s===G.navSerial}
async function flyFit(ps,s,{factor=2.15,min=450000,max=15000000,duration=1.0}={}){if(s!==G.navSerial||!ps.length)return false;const sp=C.BoundingSphere.fromPoints(ps),range=Math.max(min,Math.min(max,sp.radius*factor));const completed=await new Promise(r=>G.viewer.camera.flyToBoundingSphere(sp,{offset:new C.HeadingPitchRange(0,C.Math.toRadians(-89),range),duration,complete:()=>r(true),cancel:()=>r(false)}));return completed&&s===G.navSerial}
function countryMin(iso,ps=countryFramePoints(iso)){if(!ps.length)return 800000;const r=C.BoundingSphere.fromPoints(ps).radius;if(r<180000)return 390000;if(r<400000)return 600000;if(r<800000)return 930000;if(r<1600000)return 1380000;return 1900000}
function placeLabel(n){if(G.v52PlaceLabel)return G.v52PlaceLabel(n);let s=String(n.scenePlan?.targetLabel||n.focusLabel||n.location||'').trim();if(!s||/^(事件发生地|冲突发生地|新闻地点|实际发生地)$/.test(s))s=String(n.location||n.region||'').trim();return s||'新闻地点'}
async function countryStage(iso,s,{color=COLOR.main,hold=800,event=null,focus=null}={}){if(s!==G.navSerial)return false;G.v52Director?.stage('country',s);clearScene();hideBase();const ps=countryFramePoints(iso,focus);if(!ps.length)return false;drawCountry(iso,color,.14,2.4);const a=mainland(iso);if(a){label(countryLabel(iso),a[0],a[1],{dy:5,font:15,bg:.34});flag(iso,a[0],a[1],{dy:-22,w:22,h:14})}if(event&&good(event.lon,event.lat))mark(event.lon,event.lat,event.label,{size:8.5,dy:-25});if(!await flyFit(ps,s,{factor:iso==='CHN'?3.20:2.02,min:countryMin(iso,ps),max:14500000,duration:1.0}))return false;G.__v52CountryFrame={serial:s,iso};return wait(hold,s)}
function sample(r,max=220){if(!r)return[];if(r.length<=max)return r;const step=Math.ceil(r.length/max),out=[];for(let i=0;i<r.length;i+=step)out.push(r[i]);return out}
function closestMainland(a,b){const A=sample(mainRing(a)),B=sample(mainRing(b));if(!A.length||!B.length)return null;let best=null,bd=Infinity;for(const p of A)for(const q0 of B){let qx=+q0[0],px=+p[0];let dl=qx-px;if(dl>180)qx-=360;if(dl<-180)qx+=360;const lat=(+p[1]+ +q0[1])/2,dx=(qx-px)*Math.cos(lat*Math.PI/180),dy=+q0[1]-+p[1],d=dx*dx+dy*dy;if(d<bd){bd=d;best={p:[px,+p[1]],q:[qx,+q0[1]],gap:Math.sqrt(d)}}}if(!best)return null;const ca=mainland(a)||best.p,cb=mainland(b)||best.q;const p=[best.p[0]*.9+ca[0]*.1,best.p[1]*.9+ca[1]*.1],q=[best.q[0]*.9+cb[0]*.1,best.q[1]*.9+cb[1]*.1];let lon=(p[0]+q[0])/2;while(lon>180)lon-=360;while(lon<-180)lon+=360;return{p,q,mid:[lon,(p[1]+q[1])/2],gap:best.gap}}
async function pairStage(a,b,s,{attack=false,primary=a,hold=950}={}){G.v52Director?.stage('country',s);const g=closestMainland(a,b);if(!g||g.gap>32)return false;clearScene();hideBase();drawCountry(a,attack?COLOR.attack:(a===primary?COLOR.main:COLOR.second),.13,2.3);drawCountry(b,attack?COLOR.victim:(b===primary?COLOR.main:COLOR.second),.13,2.3);const h=Math.max(700000,Math.min(4100000,680000+g.gap*165000));if(!await flyPoint(g.mid[0],g.mid[1],h,s,.95))return false;flag(a,g.p[0],g.p[1],{dy:-18,w:22,h:14});flag(b,g.q[0],g.q[1],{dy:-18,w:22,h:14});label(countryLabel(a),g.p[0],g.p[1],{dy:17,font:12,bg:.3});label(countryLabel(b),g.q[0],g.q[1],{dy:17,font:12,bg:.3});return wait(hold,s)}
function directionalOrigin(attacker,targetLon,targetLat){const r=mainRing(attacker),ca=mainland(attacker);if(!r||!ca)return null;let best=null,bd=Infinity;for(const p of sample(r,320)){let dx=+p[0]-targetLon;if(dx>180)dx-=360;if(dx<-180)dx+=360;const dy=+p[1]-targetLat,d=(dx*Math.cos(targetLat*Math.PI/180))**2+dy**2;if(d<bd){bd=d;best=[+p[0],+p[1]]}}if(!best)return null;return{lon:best[0]*.9+ca[0]*.1,lat:best[1]*.9+ca[1]*.1}}
function eventHeight(n){const t=String(n.scenePlan?.finalType||n.placeType||'').toLowerCase();if(/port|港/.test(t))return 150000;if(/airport|机场/.test(t))return 185000;if(/炼油厂|核设施|facility|设施|会场|venue|大学|学校|机构/.test(t))return 170000;if(/city|城市|市$/.test(t))return 235000;if(/空袭|海峡|海域|border|边境/.test(t))return 315000;return Number(n.pointHeight)||250000}
async function finalLocation(n,s,{text=null,flagIso=null}={}){if(s!==G.navSerial)return false;G.v52Director?.stage('location',s);clearScene();hideBase();if(!['city','town','village','城市','城镇','乡镇','村庄','市','县城'].includes(String(n.placeType||'').trim().toLowerCase()) && G.v52RenderGeographicFeature&&await G.v52RenderGeographicFeature(n,s)){if(s===G.navSerial)flag(flagIso||n.scenePlan?.primaryIso3||n.countryIso3,+n.lon,+n.lat,{dx:25,dy:-11,w:20,h:12});if(G.v52Director&&s===G.navSerial)return wait(2100,s);return s===G.navSerial;}if(s!==G.navSerial)return false;mark(+n.lon,+n.lat,text||placeLabel(n),{size:10,dy:-29});flag(flagIso||n.scenePlan?.primaryIso3||n.countryIso3,+n.lon,+n.lat,{dx:25,dy:-11,w:20,h:12});if(!await flyPoint(+n.lon,+n.lat,eventHeight(n),s,1.02))return false;G.v52StartDetailedBorders?.(s);return wait(2100,s)}
async function runAdmins(n,iso,s,steps=null){const arr=Array.isArray(steps)?steps:(G.adminSteps?.(n)||[]);for(const st of arr){if(s!==G.navSerial)return false;await G.flashAdmin?.(st,iso,s,1750,{keepVisible:true,beforeShow:G.v51PrepareAdmin});if(s!==G.navSerial)return false;await wait(300,s)}return true}
async function localFit(a,b,s){const ps=[];if(a&&good(a.lon,a.lat))ps.push(C.Cartesian3.fromDegrees(a.lon,a.lat,0));if(b&&good(b.lon,b.lat))ps.push(C.Cartesian3.fromDegrees(b.lon,b.lat,0));return flyFit(ps,s,{factor:3.0,min:290000,max:2450000,duration:.95})}
// Attack context remains visible after the one-shot animation has finished.
// Launch coordinates and country display anchors are deliberately separate.
function attackData(n){
 const resolved=G.v52AttackModel?.resolve(n);if(resolved)return resolved;
 const p=n.scenePlan||{};
 return {att:String(p.attackerIso3||n.sourceCountryIso3||'').toUpperCase(),
  vic:String(p.victimIso3||n.targetCountryIso3||n.countryIso3||'').toUpperCase(),
  target:{lon:+(n.targetLon??n.lon),lat:+(n.targetLat??n.lat)},
  source:p.sourceUnconfirmed!==true&&n.sourceLon!=null&&n.sourceLat!=null&&good(n.sourceLon,n.sourceLat)&&
   !['unknown','direction','directional','approximate'].includes(String(p.sourcePrecision||'').toLowerCase())?
   {lon:+n.sourceLon,lat:+n.sourceLat}:null,
  attackType:String(n.attackType||'missile').toLowerCase(),targetLabel:placeLabel(n),
  potential:String(n.sceneMode||'').toUpperCase()==='POTENTIAL_ATTACK',enabled:true,impactEnabled:true};
}
function placeAttackLabels(ctx){
 const scene=G.viewer.scene,t=G.viewer.clock.currentTime,project=p=>C.SceneTransforms.worldToWindowCoordinates(scene,p);
 const target=project(C.Cartesian3.fromDegrees(ctx.data.target.lon,ctx.data.target.lat,30000)),used=[];
 const measure=document.createElement('canvas').getContext('2d');
 if(!target)return;
 for(const item of ctx.badges||[]){
  if(!item.flag)continue;
  const p=project(item.flag.position.getValue(t));if(!p)continue;
  const side=p.x>=target.x?1:-1;
  const candidates=[[0,-8],[side*36,8],[-side*36,8],[0,35],[side*45,-24]];
  let chosen=candidates[0],best=-Infinity;
  for(const offset of candidates){const x=p.x+offset[0],y=p.y+offset[1];
   if(x<20||y<14||x>scene.canvas.clientWidth-20||y>scene.canvas.clientHeight-14)continue;
   const distance=Math.min(Math.hypot(x-target.x,y-target.y),...used.map(q=>Math.hypot(x-q.x,y-q.y)));
   const score=Math.min(60,distance)-Math.hypot(...offset)*.15;
   if(score>best){best=score;chosen=offset;}
  }
  const offset=new C.Cartesian2(...chosen);item.flag.billboard.pixelOffset=offset;
  used.push({x:p.x+offset.x,y:p.y+offset.y});
  if(item.label){const labelOffset=new C.Cartesian2(chosen[0]+side*14,chosen[1]+30);
   // Keep the whole country name inside the canvas when its flag is visible.
   // Do not pull labels for distant off-screen anchors into a target close-up.
   if(best!==-Infinity){
    const text=String(item.label.label.text.getValue(t));
    if(measure)measure.font=item.label.label.font.getValue(t);
    const half=(measure?measure.measureText(text).width:text.length*14)/2+9;
    labelOffset.x=Math.max(half+4,Math.min(scene.canvas.clientWidth-half-4,p.x+labelOffset.x))-p.x;
    labelOffset.y=Math.max(17,Math.min(scene.canvas.clientHeight-17,p.y+labelOffset.y))-p.y;
   }
   item.label.label.pixelOffset=labelOffset;item.label.__v52FixedLabelOffset=labelOffset;}
 }
 scene.requestRender();
}
let activeAttack=null;
function stopAttack(){
 if(!activeAttack)return;
 for(const id of activeAttack.timers)clearTimeout(id);
 activeAttack.timers.clear();activeAttack.cancelGeometry?.();activeAttack.removeResize?.();activeAttack=null;
}
G.v52Attack={version:'20261018-attack-v7',clear:stopAttack,getDiagnostics:()=>activeAttack?{
 serial:activeAttack.serial,stage:activeAttack.stage,attacker:activeAttack.data.att,victim:activeAttack.data.vic,
 source:activeAttack.data.source,target:activeAttack.data.target,attackType:activeAttack.data.attackType,
 anchors:activeAttack.anchors,trajectory:!!activeAttack.data.source&&activeAttack.data.enabled,
 impactCount:activeAttack.impactCount,pendingTimers:activeAttack.timers.size,
 geometryReady:!!activeAttack.geometryReady,geometryWaitMs:activeAttack.geometryWaitMs||0,geometryTimedOut:!!activeAttack.geometryTimedOut,
 playbackReady:['settled','cancelled','geometry-unavailable'].includes(activeAttack.stage)&&performance.now()-(activeAttack.settledAt||0)>=2000,
 entities:G.v51SceneEntities.filter(e=>e.__v52AttackSerial===activeAttack.serial&&G.viewer.entities.contains(e)).map(e=>({id:e.id,kind:e.__v52AttackKind}))
}:null};
function endAttackStage(ctx,stage){
 if(activeAttack===ctx&&ctx.serial===G.navSerial){ctx.stage=stage;ctx.settledAt=performance.now();}
 return false;
}
function attackEntity(options,kind,ctx){
 const e=add(G.viewer.entities.add(options));e.__v52AttackSerial=ctx.serial;e.__v52AttackKind=kind;return e;
}
function attackLater(ctx,ms,fn){
 const id=setTimeout(()=>{ctx.timers.delete(id);if(activeAttack===ctx&&ctx.serial===G.navSerial&&!G.overviewMode)fn();},ms);
 ctx.timers.add(id);return id;
}
function attackAnchor(iso,target){
 const ring=mainRing(iso),center=mainland(iso);if(!ring?.length||!center)return center;
 const aim=C.Cartesian3.fromDegrees(target.lon,target.lat);
 let nearest=ring[0],distance=Infinity;
 for(const q of ring){const d=C.Cartesian3.distanceSquared(aim,C.Cartesian3.fromDegrees(q[0],q[1]));if(d<distance){distance=d;nearest=q;}}
 const line=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(nearest[0],nearest[1]),C.Cartographic.fromDegrees(center[0],center[1]));
 const inside=(lon,lat)=>{let hit=false;const wrap=x=>lon+((x-lon+540)%360)-180;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j],x=wrap(a[0]),y=wrap(b[0]);
   if((a[1]>lat)!==(b[1]>lat)&&lon<(y-x)*(lat-a[1])/(b[1]-a[1])+x)hit=!hit;
  }return hit;};
 // Prefer a nearby interior label anchor, rather than the centre of a continent.
 for(const meters of [350000,220000,120000,50000]){
  const q=line.interpolateUsingFraction(Math.min(.45,meters/Math.max(1,line.surfaceDistance)));
  const lon=C.Math.toDegrees(q.longitude),lat=C.Math.toDegrees(q.latitude);
  if(inside(lon,lat))return [lon,lat];
 }
 return center;
}
async function fitAttack(ctx,duration=1.15){
 if(activeAttack!==ctx||ctx.serial!==G.navSerial)return false;
 // A location-only attack must finish at the actual impact site, not at a
 // whole-country bounding sphere (which leaves cities tiny on mobile).
 // Preserve the wider framing for confirmed launch-to-target trajectories.
 const a=ctx.data;
 ctx.targetAspect=G.viewer.scene.canvas.clientWidth/Math.max(1,G.viewer.scene.canvas.clientHeight);
 if(!a.source){
  const canvas=G.viewer.scene.canvas;
  const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
  // Medium-range globe framing: keep visible curvature and regional context.
  // Portrait needs extra altitude because its horizontal field of view is narrow.
  const height=impactHeight(ctx);
  const ok=await flyPoint(a.target.lon,a.target.lat,height,ctx.serial,duration);
  return ok&&activeAttack===ctx;
 }
 const points=[...countryFramePoints(a.vic,a.target),C.Cartesian3.fromDegrees(a.target.lon,a.target.lat)];
 if(ctx.anchors.attacker)points.push(C.Cartesian3.fromDegrees(...ctx.anchors.attacker));
 if(a.source)points.push(C.Cartesian3.fromDegrees(a.source.lon,a.source.lat));
 const sp=C.BoundingSphere.fromPoints(points),frustum=G.viewer.camera.frustum;
 const aspect=G.viewer.scene.canvas.clientWidth/Math.max(1,G.viewer.scene.canvas.clientHeight);
 const fovy=frustum.fovy||C.Math.toRadians(60),fovx=2*Math.atan(Math.tan(fovy/2)*aspect);
 const factor=1.12/Math.sin(Math.min(fovy,fovx)/2);
 return flyFit(points,ctx.serial,{factor,min:500000,max:30000000,duration});
}
let impactSprite=null,projectileSprites={};
function impactImage(){
 if(impactSprite)return impactSprite;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const x=canvas.getContext('2d');
 const glow=x.createRadialGradient(64,64,3,64,64,61);glow.addColorStop(0,'rgba(255,245,165,.95)');
 glow.addColorStop(.14,'rgba(255,146,50,.78)');glow.addColorStop(.4,'rgba(255,64,38,.28)');glow.addColorStop(1,'rgba(255,64,38,0)');
 x.fillStyle=glow;x.fillRect(0,0,128,128);x.strokeStyle='#ffb64b';x.lineWidth=3;
 x.beginPath();x.arc(64,64,43,0,Math.PI*2);x.stroke();x.strokeStyle='rgba(255,219,130,.6)';x.lineWidth=1.5;
 x.beginPath();x.arc(64,64,57,0,Math.PI*2);x.stroke();return impactSprite=canvas.toDataURL('image/png');
}
function impact(ctx,onComplete){
 if(activeAttack!==ctx||ctx.serial!==G.navSerial)return;
 const a=ctx.data,start=performance.now(),duration=1150;ctx.impactCount++;
 const e=attackEntity({position:C.Cartesian3.fromDegrees(a.target.lon,a.target.lat,36000),billboard:{
  image:impactImage(),width:100,height:100,
  scale:new C.CallbackProperty(()=>.2+.9*Math.min(1,(performance.now()-start)/duration),false),
  color:new C.CallbackProperty(()=>C.Color.WHITE.withAlpha(Math.max(0,1-(performance.now()-start)/duration)),false),
  disableDepthTestDistance:Infinity}},'impact',ctx);
 attackLater(ctx,duration,()=>{G.viewer.entities.remove(e);const i=G.v51SceneEntities.indexOf(e);if(i>=0)G.v51SceneEntities.splice(i,1);onComplete?.();});
}
function flight(ctx){
 const a=ctx.data,geodesic=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(a.source.lon,a.source.lat),C.Cartographic.fromDegrees(a.target.lon,a.target.lat));
 const peak=Math.min(600000,Math.max(45000,geodesic.surfaceDistance*.12));
 const positions=Array.from({length:129},(_,i)=>{const t=i/128,q=geodesic.interpolateUsingFraction(t);return C.Cartesian3.fromRadians(q.longitude,q.latitude,35000+peak*Math.sin(Math.PI*t));});
 const path=attackEntity({polyline:{positions,width:2.8,material:new C.PolylineGlowMaterialProperty({glowPower:.22,color:C.Color.fromCssColorString('#ffae55')})}},'trajectory',ctx);
 const start=performance.now(),duration=a.attackType==='drone'?5200:3600;
 if(!projectileSprites[a.attackType]){
  const body=a.attackType==='drone'?'<path d="M4 16 27 11 38 2l4 11 18 3-18 3-4 11-11-9Z" fill="#e4f8ff" stroke="#42b9ff"/>':'<path d="M4 11h31l20 5-20 5H4l8-5Z" fill="#fff0cf" stroke="#ff993d"/>';
  projectileSprites[a.attackType]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">'+body+'</svg>');
 }
 const currentIndex=()=>Math.min(127,Math.floor(Math.min(1,(performance.now()-start)/duration)*128));
 const mover=attackEntity({position:new C.CallbackProperty(()=>positions[currentIndex()],false),billboard:{
  image:projectileSprites[a.attackType],width:40,height:20,disableDepthTestDistance:Infinity,
  rotation:new C.CallbackProperty(()=>{const i=currentIndex(),fn=C.SceneTransforms.worldToWindowCoordinates;
   const p=fn(G.viewer.scene,positions[i]),q=fn(G.viewer.scene,positions[i+1]);return p&&q?Math.atan2(-(q.y-p.y),q.x-p.x):0;},false)}},'projectile',ctx);
 ctx.stage='flight';
 attackLater(ctx,duration,()=>{G.viewer.entities.remove(mover);const i=G.v51SceneEntities.indexOf(mover);if(i>=0)G.v51SceneEntities.splice(i,1);
  path.polyline.material=new C.PolylineGlowMaterialProperty({glowPower:.1,color:C.Color.fromCssColorString('#ffae55').withAlpha(.38)});
  showImpacts(ctx);
  // Only after the real projectile reaches the impact area, finish on a
  // closer incident-site camera. The earlier launch-to-target shot is kept.
  if(activeAttack===ctx&&ctx.serial===G.navSerial){
   flyPoint(a.target.lon,a.target.lat,impactHeight(ctx),ctx.serial,1.05).then(ok=>{
    if(ok&&activeAttack===ctx&&ctx.serial===G.navSerial)placeAttackLabels(ctx);
   });
  }
 });
}
// Cesium 1.145's display-wide ready flag includes unrelated dynamic ellipses.
// Query the actual per-entity visualizer batches so those ellipses cannot starve an attack.
function attackGeometryReady(entity,display,bounds){
 const visualizers=display._defaultDataSource?._visualizers;
 if(!Array.isArray(visualizers))return display.getBoundingSphere(entity,false,bounds)===0;
 let done=false;
 for(const visualizer of visualizers){
  if(typeof visualizer.getBoundingSphere!=='function')continue;
  let state;try{state=visualizer.getBoundingSphere(entity,bounds);}catch{return false;}
  if(state===1)return false;if(state===0)done=true;
 }
 return done;
}
function waitAttackGeometry(ctx){
 const viewer=G.viewer,display=viewer.dataSourceDisplay;
 if(typeof display?.getBoundingSphere!=='function'){ctx.geometryReady=true;return Promise.resolve(true);}
 ctx.stage='geometry';const start=performance.now(),bounds=new C.BoundingSphere();
 const entities=G.v51SceneEntities.filter(e=>e.__v52AttackSerial===ctx.serial&&e.polygon);
 for(const iso of [ctx.data.att,ctx.data.vic]){
  const border=G.countries?.get(iso)?.entities?.find(e=>e.show&&e.polyline);if(border)entities.push(border);
 }
 return new Promise(resolve=>{
  let finished=false;
  const finish=ready=>{if(finished)return;finished=true;ctx.cancelGeometry=null;ctx.geometryReady=ready;ctx.geometryWaitMs=Math.round(performance.now()-start);resolve(ready);};
  ctx.cancelGeometry=()=>finish(false);
  const check=()=>{
   if(activeAttack!==ctx||ctx.serial!==G.navSerial||G.overviewMode){finish(false);return;}
   viewer.scene.requestRender();
   if(entities.length&&entities.every(e=>viewer.entities.contains(e)&&attackGeometryReady(e,display,bounds))){finish(true);return;}
   if(performance.now()-start>=90000){ctx.geometryTimedOut=true;finish(false);return;}
   const id=setTimeout(()=>{ctx.timers.delete(id);check();},100);ctx.timers.add(id);
  };check();
 });
}
function showImpacts(ctx){
 ctx.stage='impact';
 const settle=()=>{ctx.stage='settled';ctx.settledAt=performance.now();G.viewer.scene.requestRender();};
 // Slow frames can delay the third pulse beyond a fixed 3.5s deadline.
 // Enter the idle stage only after its actual entity and timer are removed.
 if(ctx.data.enabled&&ctx.data.impactEnabled&&!ctx.data.potential){
  impact(ctx);attackLater(ctx,1150,()=>impact(ctx));attackLater(ctx,2300,()=>impact(ctx,settle));
 }else attackLater(ctx,3500,settle);
}
async function renderAttack(n,iso,s){
 G.v52Director?.stage('country',s);
 const a=attackData(n);if(!a.vic||!a.target||!good(a.target.lon,a.target.lat))return fallbackRun(n,iso,s);
 clearScene();hideBase();
 const ctx=activeAttack={serial:s,data:a,timers:new Set(),stage:'framing',impactCount:0,anchors:{
  attacker:a.att&&a.att!==a.vic?attackAnchor(a.att,a.target):null,victim:mainland(a.vic)}};
 const country=(code,color)=>{const before=G.v51SceneEntities.length;drawCountry(code,color,.18);
  for(const e of G.v51SceneEntities.slice(before)){e.__v52AttackSerial=s;e.__v52AttackKind='country-'+code;}};
 if(a.att&&a.att!==a.vic)country(a.att,COLOR.attack);country(a.vic,COLOR.victim);
 ctx.badges=[];
 if(ctx.anchors.attacker){const [lon,lat]=ctx.anchors.attacker;
  ctx.badges.push({label:label(countryLabel(a.att),lon,lat,{dy:18,font:13,height:30000}),flag:flag(a.att,lon,lat,{dx:0,dy:-8,w:30,h:20})});}
 // Keep the victim flag on a stable country anchor, apart from the impact marker.
 const victim=ctx.anchors.victim||[a.target.lon,a.target.lat];
 ctx.badges.push({label:label(countryLabel(a.vic),victim[0],victim[1],{dy:18,font:13,height:30000}),flag:flag(a.vic,victim[0],victim[1],{dx:0,dy:-8,w:30,h:20})});
 mark(a.target.lon,a.target.lat,a.targetLabel,{size:11,dy:-28});
 G.v52SceneTrace?.push({type:'attack-render',serial:s,index:(G.current??0)+1,at:Date.now(),attacker:a.att,victim:a.vic,source:a.source,target:a.target});
 // Establish the geographic relationship before moving to the impact site.
 // Armed groups are not countries: only show a second country when its ISO is known.
 const overviewCountries=[...new Set([a.att,a.vic].filter(Boolean))];
 const overviewPoints=overviewCountries.flatMap(code=>countryFramePoints(code,code===a.vic?a.target:null));
 // The first country view must be real geometry, even on a cold Worker cache.
 // A timeout is a failed render, never permission to start impact effects.
 const geometryReady=await waitAttackGeometry(ctx);
 if(activeAttack!==ctx||s!==G.navSerial)return false;
 if(!geometryReady)return endAttackStage(ctx,'geometry-unavailable');
 G.v52SceneTrace?.push({type:'attack-geometry',serial:s,ready:true,waitMs:ctx.geometryWaitMs});
 if(overviewPoints.length){
  ctx.stage='country-overview';
  const overviewOk=await flyFit(overviewPoints,s,{factor:2.0,min:2600000,max:16500000,duration:1.15});
  if(!overviewOk)return endAttackStage(ctx,'cancelled');
  if(activeAttack!==ctx||s!==G.navSerial)return false;
  placeAttackLabels(ctx);
  if(!await wait(1550,s)||activeAttack!==ctx||s!==G.navSerial)return false;
 }
 ctx.stage='target-approach';
 G.v52Director?.stage('location',s);
 if(!await fitAttack(ctx,1.75))return endAttackStage(ctx,'cancelled');
 if(activeAttack!==ctx||s!==G.navSerial)return false;
 const aspect=G.viewer.scene.canvas.clientWidth/Math.max(1,G.viewer.scene.canvas.clientHeight);
 if(Math.abs(aspect-ctx.targetAspect)>.01&&!await fitAttack(ctx,.35))return endAttackStage(ctx,'cancelled');
 if(activeAttack!==ctx||s!==G.navSerial)return false;
 placeAttackLabels(ctx);
 const settled=attackEntity({position:C.Cartesian3.fromDegrees(a.target.lon,a.target.lat,35000),billboard:{
  image:impactImage(),width:40,height:40,color:C.Color.WHITE.withAlpha(.55),disableDepthTestDistance:Infinity}},'event',ctx);
 if(a.potential||!a.enabled)settled.show=false;
 placeAttackLabels(ctx);
 if(G.v52Director&&!await G.v52Director.checkpoint('location',s))return false;
 if(activeAttack!==ctx||s!==G.navSerial)return false;
 const resumeAspect=G.viewer.scene.canvas.clientWidth/Math.max(1,G.viewer.scene.canvas.clientHeight);
 if(Math.abs(resumeAspect-ctx.targetAspect)>.01&&!await fitAttack(ctx,.35))return endAttackStage(ctx,'cancelled');
 if(activeAttack!==ctx||s!==G.navSerial)return false;
 placeAttackLabels(ctx);
 G.v52Director?.stage('event',s,{effects:true});
 if(a.source&&a.enabled&&!a.potential)flight(ctx);else showImpacts(ctx);
 let resizeTimer=null;
 const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(activeAttack===ctx&&s===G.navSerial)fitAttack(ctx,.35).then(ok=>{if(ok&&activeAttack===ctx)placeAttackLabels(ctx);});},180);};
 window.addEventListener('resize',resize,{passive:true});ctx.removeResize=()=>{clearTimeout(resizeTimer);window.removeEventListener('resize',resize);};
 G.v52StartDetailedBorders?.(s);return true;
}
const attackFocus=G.focus;
if(typeof attackFocus==='function')G.focus=function(...args){
 stopAttack();const attack=G.v52AttackModel?.resolve(G.news?.[args[0]]),frame=document.querySelector('.map-frame');
 frame?.classList.toggle('v52-attack-view',!!attack);
 if(attack)window.scrollTo({top:0,left:0,behavior:'instant'});
 return attackFocus.apply(this,args);
};

async function renderCarrier(n,iso,s){const p=n.scenePlan||{},primary=String(p.primaryIso3||n.countryIso3||'THA').toUpperCase(),ctx=(p.contextCountries||['USA',primary]).map(x=>String(x).toUpperCase()),other=ctx.find(x=>x!==primary);if(other){const ok=await pairStage(other,primary,s,{primary,hold:800});if(!ok){await countryStage(other,s,{color:COLOR.second,hold:550});if(s!==G.navSerial)return}}await countryStage(primary,s,{color:COLOR.main,hold:700});if(s!==G.navSerial)return;await runAdmins(n,primary,s);if(s!==G.navSerial)return;clearScene();hideBase();const from={lon:+(p.approachLon??100.70),lat:+(p.approachLat??13.00)},to={lon:+(p.dockLon??n.lon),lat:+(p.dockLat??n.lat)};await localFit(from,to,s);if(s!==G.navSerial)return;mark(+n.lon,+n.lat,n.focusLabel||n.location,{size:9.5,dy:-29});if(G.v52Director&&!await G.v52Director.checkpoint('location',s))return false;G.v52Director?.stage('event',s,{effects:true});const t0=performance.now(),dur=2300,pos=movePos(from,to,t0,dur);add(G.viewer.entities.add({position:pos,billboard:{image:CARRIER,width:48,height:18,verticalOrigin:C.VerticalOrigin.CENTER,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));const cc=ISO2[String(p.platformCountryIso3||'USA').toUpperCase()];if(cc)add(G.viewer.entities.add({position:pos,billboard:{image:`https://flagcdn.com/w40/${cc}.png`,width:20,height:12,pixelOffset:new C.Cartesian2(0,-18),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));label(p.platformLabel||'航母',to.lon,to.lat,{dy:27,font:12,bg:.35});await wait(3600,s)}
async function renderPoint(n,iso,s){const p=n.scenePlan||{};const primary=String(p.primaryIso3||n.countryIso3||iso||'').toUpperCase();if(p.hierarchyPresented){const seen=G.__v52CountryFrame;if(seen?.serial!==s||seen?.iso!==primary){if(!await countryStage(primary,s,{color:COLOR.main,hold:750,focus:n}))return false;}return finalLocation(n,s,{text:placeLabel(n)});}const ctx=(p.contextCountries||p.participants||[]).map(x=>String(x).toUpperCase()).filter(Boolean),others=[...new Set(ctx.filter(x=>x!==primary))];if(others.length===1){const ok=await pairStage(others[0],primary,s,{primary,hold:750});if(!ok){await countryStage(others[0],s,{color:COLOR.second,hold:520});if(s!==G.navSerial)return}}else for(const x of others){await countryStage(x,s,{color:COLOR.second,hold:480});if(s!==G.navSerial)return}if(primary){await countryStage(primary,s,{color:COLOR.main,hold:650,focus:n});if(s!==G.navSerial)return}await runAdmins(n,primary||iso,s);if(s!==G.navSerial)return;return finalLocation(n,s,{text:placeLabel(n)})}
async function renderDiplomacy(n,iso,s){const p=n.scenePlan||{},arr=(p.participants||[]).map(x=>String(x).toUpperCase()),a=arr[0]||String(n.secondaryCountryIso3||'').toUpperCase(),b=arr[1]||String(p.primaryIso3||n.countryIso3||iso||'').toUpperCase();if(a&&b){const ok=await pairStage(a,b,s,{primary:String(p.primaryIso3||b).toUpperCase(),hold:1800});if(ok)return}if(a)await countryStage(a,s,{color:COLOR.second,hold:600});if(s!==G.navSerial)return;if(b)await countryStage(b,s,{color:COLOR.main,hold:1300})}
async function renderOrg(n,iso,s){const p=n.scenePlan||{},org=String(p.organization||n.alliance||n.location||'');if(org!=='OPEC+')return fallbackRun(n,iso,s);clearScene();hideBase();let ps=[];for(const m of OPEC){drawCountry(m,COLOR.org,.12,2.0);ps.push(...carts(m))}await flyFit(ps,s,{factor:2.5,min:7600000,max:19000000,duration:1.2});await wait(1150,s);if(s!==G.navSerial)return;for(const group of OPEC_GROUPS){clearScene();hideBase();let q=[];for(const m of group){drawCountry(m,COLOR.org,.14,2.1);q.push(...carts(m))}if(q.length)await flyFit(q,s,{factor:2.25,min:1700000,max:9000000,duration:.85});await wait(600,s);if(s!==G.navSerial)return}const keys=(p.keyCountries||[]).map(x=>String(x).toUpperCase());if(keys.length){for(const k of keys){await countryStage(k,s,{color:COLOR.main,hold:1900});if(s!==G.navSerial)return}}}
G.runSequence=async(n,iso,s)=>{if(s!==G.navSerial)return false;const mode=G.v52AttackModel?.resolve(n)?.mode||String(n.sceneMode||'').toUpperCase();if(!n.scenePlan?.hierarchyPresented){clearScene();hideBase()}if(mode==='ATTACK'||mode==='MISSILE_ATTACK'||mode==='DRONE_ATTACK'||mode==='POTENTIAL_ATTACK')return renderAttack(n,iso,s);if(mode==='CARRIER_PORT'||n.scenePlan?.carrierDocking)return renderCarrier(n,iso,s);if(mode==='ORGANIZATION')return renderOrg(n,iso,s);if(mode==='DIPLOMACY_2')return renderDiplomacy(n,iso,s);if(mode==='POINT'||mode==='ADMIN'||mode==='DIPLOMACY_MULTI'||(mode!=='COUNTRY'&&G.v52Geography?.kind(n)))return renderPoint(n,iso,s);if(mode==='COUNTRY'){const p=String(n.scenePlan?.primaryIso3||n.countryIso3||iso||'').toUpperCase();return countryStage(p,s,{color:COLOR.main,hold:1900,focus:n})}return fallbackRun(n,iso,s)};
G.storyDuration=n=>{const m=String(n.sceneMode||'').toUpperCase();if(m==='ATTACK'||m==='MISSILE_ATTACK'||m==='DRONE_ATTACK'||m==='POTENTIAL_ATTACK')return 17000;if(m==='CARRIER_PORT')return 17000;if(m==='ORGANIZATION')return 21000;if(m==='DIPLOMACY_MULTI')return 18500;if(m==='DIPLOMACY_2')return 12500;if(m==='POINT'||m==='ADMIN')return 15500+(G.adminSteps?.(n)?.length||0)*1500;return typeof fallbackDuration==='function'?fallbackDuration(n):15000};

// Opt-in on-screen audit for Android devices without remote DevTools.
// Open the globe with ?flagdebug=1; normal visitors see no extra UI.
if(typeof window!=='undefined' && /(?:[?&])flagdebug=1(?:&|$)/.test(String(window.location?.search||''))){
 const showAudit=()=>{
  if(!document.body)return;
  let el=document.getElementById('v52-flag-debug');
  if(!el){el=document.createElement('div');el.id='v52-flag-debug';el.style.cssText='position:fixed;left:8px;bottom:70px;z-index:2147483647;background:rgba(0,0,0,.88);color:#fff;font:12px/1.5 monospace;padding:8px;border:1px solid #ffd447;max-width:94vw;pointer-events:none;white-space:pre-wrap';document.body.appendChild(el)}
  const d=G.v52FlagAudit?.snapshot?.();
  if(!d){el.textContent='Flag audit: not initialized';return}
  const last=d.items?.slice(-3).map(x=>x.iso+':'+(x.stillInScene?'present':'removed')+'/'+String(x.imageType)).join(' ');
  el.textContent='FLAG R21 created='+d.created+' active='+d.active+' removed='+d.removed+' invalid='+d.invalid+' CDN ok='+d.loadSuccess+' fail='+d.loadError+'\nDOM created='+(G.v52FlagAudit.domCreated||0)+' visibleFrames='+(G.v52FlagAudit.domVisible||0)+' offscreen='+(G.v52FlagAudit.domOffscreen||0)+' error='+(G.v52FlagAudit.domError||'-')+'\n'+last;
 };
 setInterval(showAudit,1500);setTimeout(showAudit,500);
}
})(window.NG14);
