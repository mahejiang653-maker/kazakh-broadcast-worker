(function(G){
if(!G||G.__v52HardRules)return;G.__v52HardRules=true;
const COUNTRY_ZH={CHN:'中国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',PSE:'巴勒斯坦',LTU:'立陶宛',BLR:'白俄罗斯',YEM:'也门',SAU:'沙特阿拉伯',DNK:'丹麦',IRQ:'伊拉克',KOR:'韩国',KAZ:'哈萨克斯坦',ARE:'阿联酋',QAT:'卡塔尔'};
G.countryNameZh=iso=>COUNTRY_ZH[String(iso||'').toUpperCase()]||G.countryName?.(iso)||'';
const oldCountryName=G.countryName;G.countryName=function(iso){const k=String(iso||'').toUpperCase();return COUNTRY_ZH[k]||(oldCountryName?oldCountryName.call(this,iso):'');};
function normalize(n){if(!n)return n;const p=n.scenePlan||(n.scenePlan={});
 if(n.sceneMode==='BORDER_CONFLICT'&&n.id===2)n.sceneMode='POINT';
 if(n.sceneMode==='ADMIN_REGION'){p.finalLocation=false;n.noPoint=true;n.secondaryCountryIso3=null;if(Array.isArray(p.contextCountries)&&p.contextCountries.length)p.contextCountries=[];}
 if(n.countryIso3==='CHN'&&Array.isArray(p.adminChain)&&p.adminChain.length)p.forceAdminChain=true;
 return n;}
G.applyV52HardRules=function(news){return(Array.isArray(news)?news:[]).map(normalize)};
if(Array.isArray(G.news))G.news=G.applyV52HardRules(G.news);if(Array.isArray(G.demo))G.demo=G.applyV52HardRules(G.demo);
const oldRun=G.runSequence;
G.runSequence=async function(n,iso,s){normalize(n);if(s!==G.navSerial)return false;
 // China city/county news must consume the administrative hierarchy before final point.
 if(n?.forceAdminChain&&Array.isArray(n.scenePlan?.adminChain)&&typeof G.flashAdmin==='function'){
   try{G.clearInteractionEffects?.();G.clearSecondaryCountry?.();G.clearLocal?.();G.clearCountry?.();G.clearArc?.();}catch{}
   try{if(typeof G.highlightCountry==='function')await G.highlightCountry('CHN',s);}catch{}
   for(const name of n.scenePlan.adminChain){if(s!==G.navSerial)return false;try{await G.flashAdmin(name,'CHN',s,1500);}catch{}try{await(G.wait?G.wait(300,s):new Promise(r=>setTimeout(r,300)));}catch{}}
 }
 try{if(typeof oldRun==='function'){const r=await oldRun.call(this,n,iso,s);if(r!==false)return r;}}catch(e){console.warn('V52 hard-rule scene fallback',e);}
 // Universal last-resort: a story switch may never leave the previous story frozen.
 if(s!==G.navSerial)return false;if(Number.isFinite(+n?.lon)&&Number.isFinite(+n?.lat)&&G.viewer?.camera&&window.Cesium){await new Promise(r=>G.viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(+n.lon,+n.lat,n.sceneMode==='ADMIN_REGION'?1800000:650000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0},duration:.9,complete:r,cancel:r}));return true;}return false;};
})(window.NG14);