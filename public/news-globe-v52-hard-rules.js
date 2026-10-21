(function(G){
if(!G||G.__v52HardRules)return;G.__v52HardRules=true;
const COUNTRY_ZH={CHN:'中国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',PSE:'巴勒斯坦',LTU:'立陶宛',BLR:'白俄罗斯',YEM:'也门',SAU:'沙特阿拉伯',DNK:'丹麦',IRQ:'伊拉克',KOR:'韩国',KAZ:'哈萨克斯坦',ARE:'阿联酋',QAT:'卡塔尔',MDA:'摩尔多瓦',BEL:'比利时',OMN:'阿曼',DEU:'德国',FRA:'法国',GBR:'英国',POL:'波兰',ROU:'罗马尼亚',TUR:'土耳其',SYR:'叙利亚',LBN:'黎巴嫩',JOR:'约旦',EGY:'埃及',IND:'印度',PAK:'巴基斯坦',AFG:'阿富汗',JPN:'日本',PRK:'朝鲜',AUS:'澳大利亚',CAN:'加拿大',MEX:'墨西哥',BRA:'巴西',VEN:'委内瑞拉',THA:'泰国',SGP:'新加坡',MYS:'马来西亚',IDN:'印度尼西亚',PHL:'菲律宾',VNM:'越南',MMR:'缅甸'};
const oldCountryName=G.countryName;G.countryNameZh=iso=>COUNTRY_ZH[String(iso||'').toUpperCase()]||(oldCountryName?oldCountryName.call(G,iso):'')||'未知国家';G.countryName=function(iso){return G.countryNameZh(iso)};
G.v52SceneTrace=[];function trace(type,data={}){const e={type,serial:G.navSerial,index:(G.current??0)+1,at:Date.now(),...data};G.v52SceneTrace.push(e);if(G.v52SceneTrace.length>300)G.v52SceneTrace.splice(0,G.v52SceneTrace.length-300);return e}G.getV52SceneTrace=()=>G.v52SceneTrace.slice();
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
const oldAdminSteps=G.adminSteps;G.adminSteps=function(n){const a=n?.scenePlan?.adminChain;if(Array.isArray(a)&&a.length)return a.slice();return oldAdminSteps?oldAdminSteps.call(this,n):[]};
const oldFlashAdmin=typeof G.flashAdmin==='function'?G.flashAdmin:null;if(oldFlashAdmin)G.flashAdmin=async function(step,iso,s,hold=2600,options={}){if(s!==G.navSerial)return false;const name=String(step?.name||step?.location||step?.focusLabel||step||''),code=String(iso||'').toUpperCase();if(!G.__v52SuppressAdminTrace){trace('admin',{name,iso:code,visible:true});trace('admin-visible-start',{name,iso:code})}const r=await oldFlashAdmin.call(this,step,iso,s,hold,{...options,keepVisible:true,beforeShow:options.beforeShow||G.v51PrepareAdmin});if(r&&s===G.navSerial){if(!G.__v52SuppressAdminTrace)trace('admin-visible-hold',{name,iso:code});await wait(1200,s)}return s===G.navSerial?r:false};
function normalize(n){if(!n)return n;G.v52AttackModel?.normalize(n);const p=n.scenePlan||(n.scenePlan={}),mode=String(n.sceneMode||'').toUpperCase();if(p.registryOnly||p.contextDisplay===false){p.regionalContext=false}if(p.registryOnly){delete p.victimIso3;delete n.targetCountryIso3}if(p.sourceUnconfirmed){/* Unknown launch coordinates do not erase known attacker/victim identities. */delete n.sourceLon;delete n.sourceLat;p.sourcePrecision='unknown'}if(p.nonStateActor){delete p.attackerIso3;delete p.victimIso3}if(mode==='ADMIN_REGION'||mode==='COUNTRY'){p.finalLocation=false;n.noPoint=true}if(Array.isArray(p.adminChain)&&p.adminChain.length){n.forceAdminChain=true;p.forceAdminChain=true}return n}
G.applyV52HardRules=news=>(Array.isArray(news)?news:[]).map(normalize);
if(Array.isArray(G.news))G.news=G.applyV52HardRules(G.news);
if(Array.isArray(G.demo))G.demo=G.applyV52HardRules(G.demo);
// A newly imported DATA LOCK replaces G.news before buildScene. Normalize it
// BEFORE building markers, not only when the first story starts playing.
const baseApplySettings=G.applySettings;
if(typeof baseApplySettings==='function')G.applySettings=function(...args){
 const input=G.$?.('jsonInput');
 let validImport=false;
 try{
   if(input?.value){
     const parsed=JSON.parse(input.value);
     if(Array.isArray(parsed?.news) && !(G.validate?.(parsed)||[]).length){
       parsed.news=G.applyV52HardRules(parsed.news);
       input.value=JSON.stringify(parsed,null,2);
       validImport=true;
     }
   }
 }catch{/* Keep the standard validation error in applySettings. */}
 const result=baseApplySettings.apply(this,args);
 // Import resets the page to overview. The old overview animated a long
 // camera flight while users immediately selected Top1. That leftover flight
 // could cancel Top1's first China country stage. After a successful import,
 // settle the overview camera instantly. Normal manual Overview remains animated.
 if(validImport && G.overviewMode && G.viewer?.camera && window.Cesium){
   try{
     const C=window.Cesium;
     G.viewer.camera.cancelFlight?.();
     G.viewer.camera.setView({
       destination:C.Cartesian3.fromDegrees(70,20,21000000),
       orientation:{heading:0,pitch:C.Math.toRadians(-90),roll:0}
     });
   }catch(error){console.warn('[V52] Imported overview camera reset unavailable',error);}
 }
 return result;
};
const oldRun=G.runSequence;
async function runCountry(iso,n,s,hold=1700,traceType='country'){if(!iso||typeof oldRun!=='function')return false;iso=String(iso).toUpperCase();const countryLabel=G.countryName(iso);trace(traceType,{iso,label:countryLabel,whole:true});const q={...n,title:countryLabel,summary:'',location:countryLabel,focusLabel:countryLabel,region:iso==='CHN'?'全国':'',placeType:'国家',countryOnly:true,countryIso3:iso,secondaryCountryIso3:null,noPoint:true,forceAdminChain:false,adminChain:[],sceneMode:'COUNTRY',scenePlan:{...(n.scenePlan||{}),primaryIso3:iso,participants:[],contextCountries:[],adminChain:[],forceAdminChain:false,finalLocation:false,regionalContext:false}};G.__v52SuppressAdminTrace=true;let r;try{r=await oldRun.call(G,q,iso,s)}finally{G.__v52SuppressAdminTrace=false}if(s!==G.navSerial)return false;await wait(hold,s);return r!==false}
function removeLegacyActorCard(){const h=document.getElementById('v52ActorStage');if(h)h.remove()}
async function showActorStage(n,s){const p=n.scenePlan||{},actor=String(p.nonStateActor||'').trim();if(!actor)return;const target=String(n.focusLabel||n.location||'目标地点');removeLegacyActorCard();trace('actor',{actor,target});trace('actor-visible',{actor,target,integrated:true});await wait(900,s)}
function chinaLevelOne(name){
 const norm=v=>String(v||'').replace(/中华人民共和国|中国|特别行政区|维吾尔自治区|自治区|省|直辖市|市/g,'').replace(/\s+/g,'').trim();
 const target=norm(name);
 if(!target)return null;
 for(const f of G.chinaLevel1Geo?.features||[]){
   const properties=Object.values(f.properties||{});
   if(properties.some(v=>(typeof v==='string'||typeof v==='number')&&norm(v)===target))
     return f.geometry||null;
 }
 return null;
}
async function runAdminHierarchy(n,primary,s){const chain=Array.isArray(n?.scenePlan?.adminChain)?n.scenePlan.adminChain.filter(Boolean):[];if(primary!=='CHN'||!chain.length||!oldFlashAdmin)return null;await runCountry('CHN',n,s,1500,'admin-country');if(s!==G.navSerial)return false;for(const step of chain){
 if(s!==G.navSerial)return false;
 let selected=step;
 // For region-wide news, never replace a province polygon with a guessed dot
 // or an imprecise geocoder match. Render the bundled level-one boundary.
 if(String(n.sceneMode||'').toUpperCase()==='ADMIN_REGION'){
   const geo=chinaLevelOne(step?.location||step?.focusLabel);
   if(!geo){trace('admin-unavailable',{name:String(step?.location||''),reason:'missing-exact-China-level1-geometry'});return false}
   selected={...step,focusGeometry:geo};
 }
 const shown=await G.flashAdmin(selected,'CHN',s);
 if(shown===false){trace('admin-unavailable',{name:String(step?.location||step?.focusLabel||'')});return false}
 if(s!==G.navSerial)return false;
}trace('admin-hierarchy-complete',{chain:chain.slice()});return true}
function canonicalizeAdminTrace(chain,s){if(!Array.isArray(chain)||!chain.length)return;const keep=[];for(const e of G.v52SceneTrace){if(e.serial===s&&e.type==='admin')continue;keep.push(e)}const now=Date.now(),idx=(G.current??0)+1;chain.forEach((step,i)=>keep.push({type:'admin',serial:s,index:idx,at:now+i,name:String(step?.name||step?.location||step?.focusLabel||step||''),iso:'CHN',visible:true}));G.v52SceneTrace=keep.slice(-300)}
G.runSequence=async function(n,iso,s){if(s!==G.navSerial)return false;normalize(n);removeLegacyActorCard();const p=n.scenePlan||{},mode=String(n.sceneMode||'').toUpperCase(),primary=String(p.primaryIso3||n.countryIso3||iso||'').toUpperCase();trace('sequence',{mode,primary,title:String(n.title||'')});
 // Attack modes share one renderer for every country and city. Do not let
 // regional/admin context branches swallow missile or drone stories.
 if(['ATTACK','MISSILE_ATTACK','DRONE_ATTACK','POTENTIAL_ATTACK'].includes(mode)){
   return typeof oldRun==='function'?oldRun.call(this,n,iso,s):false;
 }
 // A report spanning multiple confirmed cities should visit each city,
 // without suggesting that a generic midpoint is the sole attack location.
 if(mode==='POINT' && Array.isArray(n.eventSites) && n.eventSites.length>1){
   const sites=n.eventSites;
   for(let i=0;i<sites.length;i++){
     if(s!==G.navSerial)return false;
     const site=sites[i],lon=site?.lon,lat=site?.lat;
     if(lon==null||lat==null||!Number.isFinite(+lon)||!Number.isFinite(+lat)||Math.abs(+lon)>180||Math.abs(+lat)>90)return false;
     const where=String(site.location||site.label||'').trim();
     if(!where)return false;
     const iso3=String(site.countryIso3||primary).toUpperCase();
     const q={...n,eventSites:[],location:where,focusLabel:String(site.label||where),lon:+lon,lat:+lat,
       noPoint:false,countryIso3:iso3,sceneMode:'POINT',adminChain:[],forceAdminChain:false,
       scenePlan:{...p,primaryIso3:iso3,participants:[],contextCountries:[],adminChain:[],
         hierarchyPresented:i>0,forceAdminChain:false,finalLocation:true}};
     trace('multi-location',{site:i+1,total:sites.length,location:where,lon:+lon,lat:+lat});
     const result=await oldRun.call(this,q,iso3,s);
     if(result===false||s!==G.navSerial)return false;
   }
   return true;
 }
 // A precise locality story must never terminate at a whole-country fill.
 // This also guards imports whose sceneMode is lowercase 'city' or stale COUNTRY.
 const locality=/县|自治县|市|镇|乡|村|伽师|喀什|乌鲁木齐/.test(String(n.focusLabel||n.location||'')) || /^(city|county|town|village|point)$/i.test(String(n.placeType||''));
 if(locality && Number.isFinite(Number(n.lon)) && Number.isFinite(Number(n.lat)) && n.lon!=null && n.lat!=null && !['ATTACK','MISSILE_ATTACK','DRONE_ATTACK','POTENTIAL_ATTACK'].includes(mode)){
   const q={...n,sceneMode:'POINT',countryOnly:false,noPoint:false,secondaryCountryIso3:null,
     adminChain:[],forceAdminChain:false,
     scenePlan:{...p,regionalContext:false,contextCountries:[],participants:[],adminChain:[],
       forceAdminChain:false,finalLocation:true,nonStateActor:null,hierarchyPresented:false}};
   trace('locality-point',{name:q.focusLabel||q.location,lon:+q.lon,lat:+q.lat});
   return typeof oldRun==='function'?oldRun.call(this,q,iso,s):false;
 }
 if(p.regionalContext){const arr=[primary,...(p.contextCountries||[])].map(x=>String(x).toUpperCase()).filter(Boolean);for(const x of [...new Set(arr)]){if(s!==G.navSerial)return false;await runCountry(x,n,s,1050)}trace('regional-context',{countries:[...new Set(arr)]});return true}
 // Administrative-area reports have a real boundary, not an incident dot.
 // Use the existing China level-1 geometry via the admin chain.
 if(mode==='ADMIN_REGION'){
   const shown=await runAdminHierarchy(n,primary,s);
   if(shown!==null)return shown;
   return runCountry(primary,n,s,2100);
 }
 if(p.nonStateActor){await runCountry(primary,n,s,1200);if(s!==G.navSerial)return false;await showActorStage(n,s);if(s!==G.navSerial)return false;const q={...n,adminChain:[],scenePlan:{...p,participants:[],contextCountries:[],adminChain:[]}};return oldRun?oldRun.call(this,q,iso,s):false}
 const adminResult=await runAdminHierarchy(n,primary,s);if(adminResult!==null){if(!adminResult)return false;const chain=p.adminChain.slice(),q={...n,forceAdminChain:false,adminChain:[],scenePlan:{...p,adminChain:[],forceAdminChain:false,participants:[],contextCountries:[],hierarchyPresented:true}};let r=true;G.__v52SuppressAdminTrace=true;try{r=oldRun?await oldRun.call(this,q,iso,s):true}finally{G.__v52SuppressAdminTrace=false}if(s===G.navSerial)canonicalizeAdminTrace(chain,s);return r}
 const ctx=p.contextDisplay===false?[]:[...new Set((p.contextCountries||[]).map(x=>String(x).toUpperCase()).filter(x=>x&&x!==primary))];if(ctx.length){const eventCountry=primary;for(const x of ctx){if(!await runCountry(x,n,s,850,'diplomacy-country'))return false;if(s!==G.navSerial)return false}if(eventCountry){if(!await runCountry(eventCountry,n,s,850,'diplomacy-country'))return false;if(s!==G.navSerial)return false}const q={...n,sceneMode:'POINT',secondaryCountryIso3:null,adminChain:[],scenePlan:{...p,primaryIso3:eventCountry,participants:[],contextCountries:[],adminChain:[],regionalContext:false,finalLocation:true,hierarchyPresented:true}};trace('two-country-location',{countries:[...ctx,eventCountry].filter(Boolean),eventCountry,location:String(n.focusLabel||n.location||'')});return oldRun?oldRun.call(this,q,'',s):false}

 try{if(typeof oldRun==='function')return await oldRun.call(this,n,iso,s)}catch(e){console.warn('V52 semantic scene fallback',e)}return false};
})(window.NG14);
