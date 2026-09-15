import { chromium } from 'playwright';

const url = 'https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260915-v52-r1.html?v=20260915-r2-verify';
const expected = [
  ['俄军约200架无人机袭乌，基辅加油站和仓储设施遭击。','ATTACK','基辅市区加油站与仓储设施'],
  ['乌军在顿涅茨克北部发动“维瓦尔第”新攻势。','BORDER_CONFLICT','斯洛维扬斯克—克拉马托尔斯克北部战区'],
  ['胡塞武装以导弹和无人机再次袭击沙特南部军事基地。','ATTACK','哈米斯穆谢特军事基地'],
  ['北约战机在立陶宛击落一架携带爆炸物的入境无人机。','POINT','普拉特库奈村附近'],
  ['俄舰在盖瑟外海向丹麦军用直升机发射两枚照明弹。','POINT','盖瑟附近波罗的海国际水域'],
  ['乌克兰加速研发AI制导等反喷气式无人机防御体系。','ADMIN_REGION','乌克兰全境'],
  ['美国特使赴明斯克与卢卡申科重启囚犯和制裁谈判。','POINT','明斯克'],
  ['泰柬启动联合国海洋法框架下海上边界调解程序。','POINT','新加坡'],
  ['欧盟将对俄个人和实体制裁临时延长7天。','POINT','布鲁塞尔'],
  ['霍尔木兹海峡单日大宗商品船舶通行量降至4艘。','POINT','霍尔木兹海峡'],
  ['中国新版出入境及技术安全相关管理规定正式生效。','ADMIN_REGION','中国全境'],
  ['2026上合组织数字经济论坛在新疆乌鲁木齐举行。','POINT','乌鲁木齐市'],
  ['第五届北斗规模应用国际峰会在湖南株洲开幕。','POINT','株洲市']
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (!response || !response.ok()) throw new Error(`page unreachable: ${response?.status()}`);
await page.waitForFunction(() => window.NG14?.viewer && window.NG14?.demo?.length === 13, { timeout: 90000 });
await page.waitForTimeout(6000);

const data = await page.evaluate(() => window.NG14.demo.map(n => [n.title, n.sceneMode, n.location]));
if (JSON.stringify(data) !== JSON.stringify(expected)) throw new Error('13-story semantic data mismatch');

for (let i = 0; i < 13; i++) {
  await page.evaluate((idx) => {
    const G = window.NG14;
    G.pause?.();
    if (typeof G.focus === 'function') G.focus(idx, true);
    else { G.current = idx; G.play?.(); }
  }, i);
  await page.waitForTimeout(6500);
  const state = await page.evaluate(() => {
    const G = window.NG14;
    const n = G.demo[G.current ?? 0];
    return {
      current: (G.current ?? 0) + 1,
      title: n?.title,
      mode: n?.sceneMode,
      location: n?.location,
      viewer: !!G.viewer,
      destroyed: G.viewer?.scene?.isDestroyed?.() || false,
      cameraHeight: G.viewer?.camera?.positionCartographic?.height || 0,
      uiTitle: document.querySelector('#title')?.textContent?.trim() || ''
    };
  });
  const e = expected[i];
  if (state.current !== i + 1 || state.title !== e[0] || state.mode !== e[1] || state.location !== e[2]) throw new Error(`Top${i+1} semantic mismatch ${JSON.stringify(state)}`);
  if (!state.viewer || state.destroyed || !Number.isFinite(state.cameraHeight) || state.cameraHeight <= 0) throw new Error(`Top${i+1} Cesium/camera failure ${JSON.stringify(state)}`);
  console.log(`TOP_${String(i+1).padStart(2,'0')}_PASS`);
}
if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
await browser.close();
console.log('PASS_13_13');
