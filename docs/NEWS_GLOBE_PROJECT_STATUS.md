# 全球新闻地球仪：项目状态档案

> 核对日期：2026-10-16（北京时间）。依据：当前GitHub main、Actions部署日志、真实JSON及独立正式站WebGL浏览器验收。

## 当前代码与生产

- 现有项目：全球新闻地球仪 V52·A1 R6；仓库 mahejiang653-maker/kazakh-broadcast-worker，分支main；与哈萨克语播音共享Worker。
- 最新已验证应用提交：`2548b6df10705051699353a6de930129bc4b6304`。
- Cloudflare正式版本：`f451a60f-5791-418f-a229-87dbd56b7ac0`，2026-10-16 15:38:21北京时间部署成功。
- 正式入口：https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html 。
- 当前入口缓存版本：20261016-attack-v4，daily10为20261016-r6-daily10-direct-r10；共享攻击解析器、国旗资源、场景引擎按顺序加载。
- 默认数据仍为2026-10-11历史预览Top10；本次验收通过选择文件导入10月14日原始JSON。不要声称系统已自动发布当天日报。

## 已解决的攻击渲染故障

1. 原Top2虽进入MISSILE_ATTACK，但旧解析器漏读scenePlan.attackEffect与relatedCountryIso3s，攻击方为空。新增共享attack-model解析平铺/嵌套字段与明确两国角色，未知发射位置保留已知攻击方和受袭方身份。
2. 双国场景按受袭国完整轮廓、目标、攻击方邻近国家显示锚点和可信源取景。显示锚点不作为发射坐标；无源只显示目标命中，不编造轨迹。
3. 导弹/无人机已知源走球面路径；三轮明显命中脉冲后保留双方区域、双旗及目标事件环，避免回退finalLocation清空上下文。
4. 国旗改用全量本地PNG，完整ISO3映射不依赖GeoJSON可选iso_a2。正式复验发现的白旗与Top5刚果（金）缺旗均已修复。
5. focus、overview、resize和异步计时器受导航序号约束；攻击专用画布约束与顶部归位修复实际viewport裁切。白色国界范围只包含涉事国家。
6. 实际补录暴露“实体存在但几何未绘制”的假通过。现在等待具体国家实体的可视化批次就绪后才播攻击；浏览器测试独立检查ready Primitive内真实GPU实例。阻塞真实Worker时不播放脉冲，导航可取消；放行后完整播放。自动播放等待几何、动画及静态停留，避免提前切走。不能用DataSourceDisplay整体PENDING直接推断某个国家是否已绘制。

## 已确认的用户标准

- 固定10条，选文件后直接导入；只做防页面崩溃的基本数据结构检查，不核验新闻真实性、报道时间或报道链接。旧的24小时窗口和链接数量不得阻断导入。
- 不针对俄罗斯、乌克兰、基辅写特例；通用导弹/无人机、已知/未知源、任意有效双国身份。
- 涉事国白边界、地点红点、原V52风格与直角画布；威胁公告点位规则和市县定位规则保持当前main行为。
- 不修改无关配音系统，不大规模重构。

## 最近完整验收证据

- 原始文件：全球战局疆域热力榜_2026-10-14_第七板块_攻击特效_DATA_LOCK.json。回归fixture：tests/fixtures/r6-daily10-20261014.json；SHA256 `800747c8c5bf101b2bb4a4157d2d09ab92fe4b5cc884329ebd39c7572b9a2a00`。未读取实体手机本地副本。
- npm test：214项，212通过、0失败、2项现有配音WAV样本测试跳过；Y1真实Cesium1.145.0独立回归43/43通过。M3与Fish TypeScript检查通过。
- [完整CI及正式部署](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/38868354764)：SUCCESS。
- [Top10离线合同](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/38868354718)：SUCCESS。
- [新增真实浏览器视觉CI](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/38868354860)：SUCCESS；阻断外部flagcdn仍通过。该工作流只在相关代码变更或手动触发。
- 部署后独立正式站：40项PASS，localOverrides=false，pageErrors=[]，consoleErrors=[]；八个生产关键资源与应用提交哈希一致。
- 真实Chromium/WebGL尺寸390×844、1440×810、844×390；实际十条逐条截图/主国家国旗，Top1→Top2、Top2→Top3、Top3→Top2、18次快速切换、旋转、总览清理、完整动画和静态场景全部检查。
- Top2：RUS/UKR填充和边界、双旗、基辅30.5234/50.4501同屏；UKR 93/93轮廓坐标在真实viewport内；source=null、trajectory=false；RUS填充14/14和UKR填充1/1 GPU实例就绪，双方白边界就绪；三轮命中后pendingTimers=0，静置六秒仍保留场景。
- 通用真实渲染：ISR→IRN未知源、COD→UGA未知源、IND→PAK已知源导弹、ISR→IRN无人机、USA→JPN跨日界线。工程测试源坐标不代表真实新闻发射位置。
- 已人工复核三种尺寸的命中/静态截图、六秒静态截图、真实十条及五个通用场景。手机原始WebM裁切为12.4秒MP4，包含三次脉冲和静态保留；没有合成或加速。
- [永久证据分支](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/tree/evidence/r6-38868354860-1)，证据提交`9d332402a13f16d8e316d114d833acb1285d6fe9`，与应用main分离。脚本scripts/wait-r6-production.mjs校验线上资源，scripts/publish-r6-evidence.mjs保存截图、视频、诊断和部署元数据。

## 尚未解决与下一步

- 本轮攻击渲染验收无剩余阻断问题；浏览器手机尺寸验证不等同于所有实体手机型号验证。
- 默认数据发布仍是历史预览；日报发布和新闻事实核验不属于此次渲染修复。
- 旧13条浏览器验收脚本仍保留手动模式，不能用其旧断言判断新版10条失败。当前攻击与十条回归应使用scripts/verify-r6-attacks.mjs及上述视觉工作流。
- 后续优先按真实用户JSON维护回归fixture；避免恢复时间/链接门槛或无关国家白边界。

## 维护规矩
- 常规改动只跑纯Node快速回归；别自动启动浏览器、外部地图耗时测试、图像Gemini搜索或TTS音频。
- 用户报告故障、轻量测试失败、事件渲染核心改动、重大生产升级时才启动更深入检查。
- 本仓库与哈萨克语播音共享生产CI／Cloudflare；仅维护文档的变更不可无谓触发播音重新部署。
- 故障处理流程：`docs/NEWS_SYSTEM_RECOVERY.md`。

## 维护补充：旧高成本定时图片工作流（2026-10-12）
- 审计 `.github/workflows/daily-news-image-pack.yml`：原来每天北京时间12:20通过 `cron: '20 4 * * *'` 执行网络搜索、Playwright、真实图片打包，早于13:00 DATA LOCK截止时间；不适合当前新闻日更流程。
- 已将其改为 `workflow_dispatch` **仅手动触发**，并移除自动push触发；旧图片打包功能文件与命令保持原样，只有用户明确启动时才会运行。
- 地球仪48项离线合同检查与图片站49项Mock继续按相关代码变更运行；无新增每日任务。

## 显示区域直角（2026-10-13）
- 已发布提交 `4c5380b12bd06e49e44de7d7ec9593a129958bfa`：有效入口增加 `.map-frame{border-radius:0!important}`，地球仪显示区域四角改为直角。
- 仅改变显示区域圆角；16:9比例、其它卡片及按钮样式保留。
- 验证：入口6项Node测试通过；组装后的页面含直角覆盖，并保留卡片14px、按钮9px圆角及16:9规则。
- GitHub CI `38377387637` 和Top10离线合同工作流 `38377387618` 均成功；实际线上入口源码与已发布提交一致。
- 本轮为小范围CSS调整，按常规维护规矩未运行浏览器、地图网络验收或额外配音生成。
