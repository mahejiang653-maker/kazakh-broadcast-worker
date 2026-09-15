import { chromium } from 'playwright';
const url='https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260915-v52-r1.html?v=20260916-v52-visual-8';
const titles=['俄军约200架无人机夜袭乌克兰，基辅能源设施遭击。','乌军在顿涅茨克北部发动“维瓦尔第”新攻势。','北约战机在立陶宛击落疑似从白俄罗斯方向进入的无人机。','胡塞再袭沙特哈米斯穆谢特，13名平民受伤。','俄军舰向丹麦军用直升机发射照明弹，引发外交抗议。','乌克兰加速研发AI拦截系统应对俄喷气式无人机。','美军进入撤离伊拉克收尾阶段，亲伊朗民兵拒绝缴械。','韩国与哈萨克斯坦签署和平核能合作备忘录。','胡塞袭击与霍尔木兹航运下滑拖累海湾股市。','中国科技与国家安全相关新出入境规定正式生效。','联合国称加沙新发现遗体进一步引发战争罪担忧。','第三届新疆数字经济创新发展大会在乌鲁木齐启动。','新疆若羌风电装备项目一期投产，制造能力继续扩张。'];
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});if(!r?.ok())throw Error('page unreachable');await page.waitForFunction(()=>window.NG14?.viewer&&window.NG14?.news?.length===13&&window.NG14?.__v52HardRules&&window.NG14?.getV52SceneTrace,{timeout:90000});await page.waitForTimeout(5000);
const rules=await page.evaluate(()=>window.NG14.news.map(n=>({title:n.title,mode:n.sceneMode,noPoint:!!n.noPoint,ctx:n.scenePlan?.contextCountries||[],chain:n.scenePlan?.adminChain||[],attacker:n.scenePlan?.attackerIso3||'',victim:n.scenePlan?.victimIso3||'',actor:n.scenePlan?.nonStateActor||'',unconfirmed:!!n.scenePlan?.sourceUnconfirmed,regional:!!n.scenePlan?.regionalContext})));
if(JSON.stringify(rules.map(x=>x.title))!==JSON.stringify(titles))throw Error('title/order mismatch');
if(rules[2].unconfirmed&&(rules[2].attacker||rules[2].victim))throw Error('TOP3 uncertain direction became confirmed attacker');
if(rules[3].actor!=='胡塞武装'||rules[3].attacker||rules[3].victim)throw Error('TOP4 non-state actor rule failed');
for(const i of [5,6,9])if(!rules[i].noPoint)throw Error(`TOP${i+1} nationwide point not suppressed`);
if(!rules[8].regional||rules[8].ctx.join('/')!=='ARE/QAT')throw Error('TOP9 regional context lost');
if(rules[11].chain.join('/')!=='新疆/乌鲁木齐'||rules[12].chain.join('/')!=='新疆/巴音郭楞/若羌')throw Error('admin hierarchy missing');
const adminProbe=await page.evaluate(()=>{const G=window.NG14;return [G.adminSteps?.(G.news[11]),G.adminSteps?.(G.news[12]),G.countryName?.('LTU'),G.countryName?.('BLR')];});
if(adminProbe[0]?.join('/')!=='新疆/乌鲁木齐'||adminProbe[1]?.join('/')!=='新疆/巴音郭楞/若羌')throw Error('engine did not adopt explicit adminChain');
if(adminProbe[2]!=='立陶宛'||adminProbe[3]!=='白俄罗斯')throw Error('Chinese country-name resolver failed');
function hasCountry(t,iso){return t.some(e=>e.type==='country'&&e.iso===iso&&e.whole===true)}
function admins(t){return t.filter(e=>e.type==='admin').map(e=>e.name)}
async function waitForLongSequence(i){
 if(i===8)await page.waitForFunction(()=>{const t=window.NG14.getV52SceneTrace();return ['SAU','ARE','QAT'].every(iso=>t.some(e=>e.type==='country'&&e.iso===iso&&e.whole===true))&&t.some(e=>e.type==='regional-context')},{timeout:12000});
 if(i===11)await page.waitForFunction(()=>window.NG14.getV52SceneTrace().filter(e=>e.type==='admin').map(e=>e.name).join('/')==='新疆/乌鲁木齐',{timeout:12000});
 if(i===12)await page.waitForFunction(()=>window.NG14.getV52SceneTrace().filter(e=>e.type==='admin').map(e=>e.name).join('/')==='新疆/巴音郭楞/若羌',{timeout:15000});
}
for(let i=0;i<13;i++){
 await page.evaluate(idx=>{const G=window.NG14;G.v52SceneTrace.length=0;G.pause?.();G.focus?.(idx,true)},i);await page.waitForTimeout(7000);await waitForLongSequence(i);
 const s=await page.evaluate(()=>{const G=window.NG14,n=G.news[G.current??0],c=G.viewer.camera.positionCartographic,text=document.body.innerText;return{idx:(G.current??0)+1,title:n?.title,h:c?.height,lon:Cesium.Math.toDegrees(c.longitude),lat:Cesium.Math.toDegrees(c.latitude),isoLeak:/\b(?:LTU|BLR|YEM|DNK|KOR|KAZ|PSE|IRQ|UKR|RUS|USA|IRN|SAU|ARE|QAT)\b/.test(text),trace:G.getV52SceneTrace()};});
 if(s.idx!==i+1||s.title!==titles[i])throw Error(`TOP${i+1} switch failed`);if(!Number.isFinite(s.h)||s.h<=0||!Number.isFinite(s.lon)||!Number.isFinite(s.lat))throw Error(`TOP${i+1} camera invalid`);if(s.isoLeak)throw Error(`TOP${i+1} visible ISO abbreviation leak`);
 if(i===3&&(!hasCountry(s.trace,'SAU')||!s.trace.some(e=>e.type==='actor-visible'&&e.actor==='胡塞武装')))throw Error('TOP4 visible attacker/target stage missing');
 if(i===5&&!hasCountry(s.trace,'UKR'))throw Error('TOP6 whole-Ukraine rendered stage missing');
 if(i===8&&(!hasCountry(s.trace,'SAU')||!hasCountry(s.trace,'ARE')||!hasCountry(s.trace,'QAT')||!s.trace.some(e=>e.type==='regional-context')))throw Error('TOP9 regional country context not rendered');
 if(i===9&&!hasCountry(s.trace,'CHN'))throw Error('TOP10 whole-China rendered stage missing');
 if(i===11&&admins(s.trace).join('/')!=='新疆/乌鲁木齐')throw Error('TOP12 rendered admin order wrong: '+admins(s.trace).join('/'));
 if(i===12&&admins(s.trace).join('/')!=='新疆/巴音郭楞/若羌')throw Error('TOP13 rendered admin order wrong: '+admins(s.trace).join('/'));
 console.log('TOP_'+String(i+1).padStart(2,'0')+'_PASS',s.lon.toFixed(2),s.lat.toFixed(2),Math.round(s.h),'TRACE',s.trace.map(e=>e.type+(e.iso?':'+e.iso:e.name?':'+e.name:e.actor?':'+e.actor:'')).join(','));
}
if(errs.length)throw Error('page errors: '+errs.join(' | '));await browser.close();console.log('PASS_13_13_RENDERED_VISUAL_STAGES');