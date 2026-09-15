(function(G){
if(!G||G.__v52HardRules)return;G.__v52HardRules=true;
const COUNTRY_ZH={CHN:'中国',USA:'美国',RUS:'俄罗斯',UKR:'乌克兰',IRN:'伊朗',ISR:'以色列',PSE:'巴勒斯坦',LTU:'立陶宛',BLR:'白俄罗斯',YEM:'也门',SAU:'沙特阿拉伯',DNK:'丹麦',IRQ:'伊拉克',KOR:'韩国',KAZ:'哈萨克斯坦',ARE:'阿联酋',QAT:'卡塔尔',DEU:'德国',FRA:'法国',GBR:'英国',POL:'波兰',ROU:'罗马尼亚',TUR:'土耳其',SYR:'叙利亚',LBN:'黎巴嫩',JOR:'约旦',EGY:'埃及',IND:'印度',PAK:'巴基斯坦',AFG:'阿富汗',JPN:'日本',PRK:'朝鲜',AUS:'澳大利亚',CAN:'加拿大',MEX:'墨西哥',BRA:'巴西',VEN:'委内瑞拉',THA:'泰国',SGP:'新加坡',MYS:'马来西亚',IDN:'印度尼西亚',PHL:'菲律宾',VNM:'越南',MMR:'缅甸'};
const oldCountryName=G.countryName;
G.countryNameZh=iso=>COUNTRY_ZH[String(iso||'').toUpperCase()]||(oldCountryName?oldCountryName.call(G,iso):'')||'未知国家';
G.countryName=function(iso){return G.countryNameZh(iso)};

/* Explicit adminChain is the single source of truth for hierarchical stories.
   This makes every future CHN province/prefecture/county story run:
   country -> province -> prefecture/city -> county -> final point. */
const oldAdminSteps=G.adminSteps;
G.adminSteps=function(n){const a=n?.scenePlan?.adminChain;if(Array.isArray(a)&&a.length)return a.slice();return oldAdminSteps?oldAdminSteps.call(this,n):[]};

function normalize(n){
 if(!n)return n;const p=n.scenePlan||(n.scenePlan={});
 const mode=String(n.sceneMode||'').toUpperCase();
 /* Uncertain origin/direction must never become a confirmed attacker. */
 if(p.sourceUnconfirmed){delete p.attackerIso3;delete p.victimIso3;}
 /* A named non-state actor is not a state. Never synthesize a country attacker. */
 if(p.nonStateActor){delete p.attackerIso3;delete p.victimIso3;}
 /* Region/country-wide stories must not fabricate a precise event point. */
 if(mode==='ADMIN_REGION'||mode==='COUNTRY'){p.finalLocation=false;n.noPoint=true;}
 if(Array.isArray(p.adminChain)&&p.adminChain.length){n.forceAdminChain=true;p.forceAdminChain=true;}
 return n;
}
G.applyV52HardRules=news=>(Array.isArray(news)?news:[]).map(normalize);
if(Array.isArray(G.news))G.news=G.applyV52HardRules(G.news);
if(Array.isArray(G.demo))G.demo=G.applyV52HardRules(G.demo);

const oldRun=G.runSequence;
const wait=(ms,s)=>G.wait?G.wait(ms,s):new Promise(r=>setTimeout(()=>r(s===G.navSerial),ms));
async function runCountry(iso,n,s,hold=1700){
 if(!iso||typeof oldRun!=='function')return false;
 const q={...n,sceneMode:'COUNTRY',countryIso3:iso,secondaryCountryIso3:null,noPoint:true,scenePlan:{...(n.scenePlan||{}),primaryIso3:iso,contextCountries:[],adminChain:[],finalLocation:false}};
 const r=await oldRun.call(G,q,iso,s);if(s!==G.navSerial)return false;await wait(hold,s);return r!==false;
}
async function showActorCard(n,s){
 const p=n.scenePlan||{},actor=String(p.nonStateActor||'').trim();if(!actor)return;
 const h=document.getElementById('scenePlanHud');if(!h)return;
 const target=String(n.focusLabel||n.location||'目标地点');
 h.style.display='block';h.innerHTML='<div style="font-weight:700">'+actor+'</div><div style="opacity:.8;margin-top:4px">袭击目标：'+target+'</div>';
 await wait(1450,s);h.style.display='none';
}
G.runSequence=async function(n,iso,s){
 normalize(n);if(s!==G.navSerial)return false;const p=n.scenePlan||{},mode=String(n.sceneMode||'').toUpperCase(),primary=String(p.primaryIso3||n.countryIso3||iso||'').toUpperCase();
 /* Nationwide: always show the complete country in red and stop there. */
 if(mode==='ADMIN_REGION'&&!p.regionalContext)return runCountry(primary,n,s,2100);
 /* Regional story: establish every relevant country first; do not invent one red point. */
 if(mode==='ADMIN_REGION'&&p.regionalContext){const arr=[primary,...(p.contextCountries||[])].map(x=>String(x).toUpperCase()).filter(Boolean);for(const x of [...new Set(arr)]){if(s!==G.navSerial)return false;await runCountry(x,n,s,900)}return true;}
 /* Non-state attack: first identify target country, then explicitly identify the actor,
    then let the point renderer finish at the real target. No fake Yemen/state trajectory. */
 if(p.nonStateActor){await runCountry(primary,n,s,900);if(s!==G.navSerial)return false;await showActorCard(n,s);if(s!==G.navSerial)return false;const q={...n,scenePlan:{...p,contextCountries:[],adminChain:p.adminChain||[]}};return oldRun?oldRun.call(this,q,iso,s):false;}
 /* Hierarchical point stories are handled by the engine naturally now that adminSteps
    reads scenePlan.adminChain: country -> every admin level -> final point. */
 try{if(typeof oldRun==='function')return await oldRun.call(this,n,iso,s)}catch(e){console.warn('V52 semantic scene fallback',e)}
 return false;
};
})(window.NG14);