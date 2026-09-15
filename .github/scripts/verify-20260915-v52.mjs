import { chromium } from 'playwright';
const url='https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260915-v52-r1.html?v=20260915-r3-verify';
const expected=[
['俄军约200架无人机夜袭乌克兰，基辅能源设施遭击。','ATTACK','基辅市区能源与仓储设施'],
['乌军在顿涅茨克北部发动“维瓦尔第”新攻势。','BORDER_CONFLICT','斯洛维扬斯克—克拉马托尔斯克北部战区'],
['北约战机在立陶宛击落疑似从白俄罗斯方向进入的无人机。','POINT','普拉特库奈村附近'],
['胡塞再袭沙特哈米斯穆谢特，13名平民受伤。','ATTACK','哈米斯穆谢特军事基地及周边'],
['俄军舰向丹麦军用直升机发射照明弹，引发外交抗议。','POINT','盖瑟附近波罗的海国际水域'],
['乌克兰加速研发AI拦截系统应对俄喷气式无人机。','ADMIN_REGION','乌克兰全境'],
['美军进入撤离伊拉克收尾阶段，亲伊朗民兵拒绝缴械。','ADMIN_REGION','伊拉克'],
['韩国与哈萨克斯坦签署和平核能合作备忘录。','POINT','首尔'],
['胡塞袭击与霍尔木兹航运下滑拖累海湾股市。','ADMIN_REGION','海湾主要股市'],
['中国科技与国家安全相关新出入境规定正式生效。','ADMIN_REGION','中国全境'],
['联合国称加沙新发现遗体进一步引发战争罪担忧。','POINT','加沙城废墟区域'],
['第三届新疆数字经济创新发展大会在乌鲁木齐启动。','POINT','乌鲁木齐市'],
['新疆若羌风电装备项目一期投产，制造能力继续扩张。','POINT','新疆若羌县']];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});if(!response||!response.ok())throw new Error(`page unreachable: ${response?.status()}`);
await page.waitForFunction(()=>window.NG14?.viewer&&window.NG14?.demo?.length===13,{timeout:90000});await page.waitForTimeout(6000);
const data=await page.evaluate(()=>window.NG14.demo.map(n=>[n.title,n.sceneMode,n.location]));if(JSON.stringify(data)!==JSON.stringify(expected))throw new Error('13-story semantic data mismatch');
const top3=await page.evaluate(()=>window.NG14.demo[2]);if(top3.scenePlan?.attackerIso3||top3.scenePlan?.victimIso3)throw new Error('Top3 must not assert confirmed attacker/victim');
for(let i=0;i<13;i++){await page.evaluate(idx=>{const G=window.NG14;G.pause?.();if(typeof G.focus==='function')G.focus(idx,true);else{G.current=idx;G.play?.();}},i);await page.waitForTimeout(6500);const s=await page.evaluate(()=>{const G=window.NG14,n=G.demo[G.current??0];return{current:(G.current??0)+1,title:n?.title,mode:n?.sceneMode,location:n?.location,viewer:!!G.viewer,destroyed:G.viewer?.scene?.isDestroyed?.()||false,cameraHeight:G.viewer?.camera?.positionCartographic?.height||0};});const e=expected[i];if(s.current!==i+1||s.title!==e[0]||s.mode!==e[1]||s.location!==e[2])throw new Error(`Top${i+1} semantic mismatch ${JSON.stringify(s)}`);if(!s.viewer||s.destroyed||!Number.isFinite(s.cameraHeight)||s.cameraHeight<=0)throw new Error(`Top${i+1} Cesium/camera failure`);console.log(`TOP_${String(i+1).padStart(2,'0')}_PASS`);}if(errs.length)throw new Error(`page errors: ${errs.join(' | ')}`);await browser.close();console.log('PASS_13_13');