# 全球新闻地球仪：项目状态档案

> 核对日期：2026-10-19（北京时间）。依据：GitHub应用提交、Actions部署日志、完整npm test及独立正式站WebGL浏览器验收。

## 当前代码与生产

- 现有项目：全球新闻地球仪 V52·A1 R6；仓库 mahejiang653-maker/kazakh-broadcast-worker，分支main；与哈萨克语播音共享Worker。
- 最新已验证应用提交：`3eda3c1653ab2dd284bafc60a5342dfe8fbded75`（PR #65）；完整构建、合同、部署及独立正式站三视口分镜验收通过。
- Cloudflare正式版本：`3634ceab-aabe-4ba4-b685-c220ded76a47`，2026-10-19 00:09北京时间部署成功。
- 正式入口：https://kazakh-broadcast-worker.mahejiang653.workers.dev/news-globe-run-20260920-v52-r1.html 。
- 当前入口/分镜控制缓存版本：`20261018-director-v1`；攻击几何诊断版本仍为`20261018-attack-v7`。共享攻击解析器、国旗资源、场景引擎按原有顺序加载，新增分镜控制最后加载；daily10直接导入规则不变。
- 默认数据仍为2026-10-11历史预览Top10；本轮通过选择文件导入攻击回归数据验收。不要声称系统已自动发布当天日报。

## 第一批分镜控制（2026-10-19）

- 已合并[PR #65](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/pull/65)：单条重播、阶段暂停/继续、分镜时长设置；使用说明见`NEWS_GLOBE_DIRECTOR.md`。保留此前东半球总览修复。
- 重播停止自动播放并重新播放当前新闻；总览中重播返回上次选中的新闻。暂停保留剩余停留时间，镜头先到达目的地，已开始的攻击/航母效果先完成本轮；攻击目标到达后可在效果前暂停。
- “设置 / 导入 → 分镜时长设置”支持镜头移动、国家、行政区、地点各0.25～4倍，结束额外停留0～60秒；当前浏览器单独保存，下次重播或下一条生效，可恢复默认。切条、总览、重播与销毁清理旧等待，自动切条等待实际分镜结束且排除暂停时间。
- 完整npm test：247项，245通过、0失败、2项既有WAV样本跳过；新增19项分镜回归。Fish/M3 TypeScript检查通过。[主分支CI与正式部署](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39143607012)：SUCCESS；[Top10离线合同](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39143607000)：SUCCESS。
- [合并前完整视觉回归](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39142233405)：SUCCESS；冷GPU几何、真实十条、通用攻击、Top3/4、取消飞行、快速切换、尺寸变化及新增三视口分镜23项全部通过。该轮与最终合并提交的public资源完全一致，后续仅强化测试初始化等待及短阶段按钮同步，没有再改功能代码。
- 线上9个关键资源SHA-256与应用提交全部匹配，包含新增分镜模块；核对时间2026-10-19 00:09北京时间。
- 独立正式站Chromium 140 + SwiftShader WebGL：23项PASS，localOverrides=false，pageErrors=[]、consoleErrors=[]；北京时间2026-10-19 00:09～00:18验收。1440×810、390×844、844×390覆盖三个攻击暂停位置、单条重播、实际停留倍率、刷新持久保存与恢复默认、自动播放、普通地点、行政区真实几何、快速切换和总览清理；已人工复核桌面国家总览及手机竖屏/横屏设置截图，保存和关闭按钮可实际点击。手机视口模拟不等于实体机型号认证。
- 同版本本地资源实测同样23项PASS、错误0。后续短阶段测试在浏览器内观察到对应阶段时触发真实DOM按钮处理器，以免软件GPU低帧率下分开的远程点击错过阶段；场景及清理断言保留。
- [主分支完整视觉流程](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39143607058)继续自动二次复验，当前记录不将尚未完成的CI当作成功；上述独立正式站23项及资源校验已经完成。
- 默认新闻仍为10月11日历史预览。工程导入数据仅用于独立浏览器回归；未发布当天日报，未改变新闻事实、未知发射源规则、球面轨迹、国家边界范围或配音默认配置。

## 本轮续修与正式站验收（2026-10-18）

- 在既有`d64512e9`修复及其后的main上继续维护，没有重建或大规模重构。应用修复提交为`d9744f9`、`6eac5f0`、`b7ee38d`、`15d0a25`。
- Top3：先展示乌克兰、俄罗斯的真实国家几何、边界和双旗，再推进梁赞（39.7364, 54.6296）。Top4：胡塞武装为非国家行为体，仅显示也门，再推进亚丁（45.0355, 12.7855）；不得从YEM/SAU相关国家元数据虚构沙特攻击方。没有确证发射位置时保持source=null、trajectory=false。
- 国家GPU几何在country-overview之前就绪；几何超时不能播命中效果。取消飞行不得推进后续动画；导航序号保护、实体/定时器/resize监听清理继续生效。
- 修复手机贴边国家标签裁切。视觉CI另发现低帧率下固定3.5秒期限可能早于最后脉冲清理，现改为最后一次命中实体实际移除后才进入settled，并加入延迟计时器动态回归测试。
- 完整npm test：228项，226通过、0失败、2项既有WAV样本测试跳过；Fish/M3 TypeScript检查通过。[完整CI与正式部署](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39100949948)：SUCCESS。
- 独立正式站Chromium 153 + SwiftShader WebGL：32项PASS，localOverrides=false，pageErrors=[]、consoleErrors=[]；八个关键生产资源SHA-256全部匹配上述应用提交。实际验收时间为北京时间13:34–13:41。
- 1440×810、390×844、844×390三种视口均完成Top3/Top4国家总览、实际地点推进、三次命中和静止清理。还通过上一条/下一条、24次快速切换、两阶段直接取消飞行、推进中resize、844×390/390×844/1100×700窗口变化、切普通新闻和回总览清理。六组完整攻击场景均impactCount=3、pendingTimers=0；无旧导航实体。
- 已人工复核桌面、竖屏、横屏的总览和目标截图；竖屏乌克兰标签完整显示。手机视口模拟不等于实体手机型号认证。保留现有边境线、国旗、红点、地名、16:9直角画布及其他V52功能。
- 本轮输入`tests/fixtures/r6-attack-stages-20261016.json`仅保存恢复出的Top3/Top4复现字段，浏览器脚本将其插入既有十条回归fixture，不是完整原始10月16日日报，也没有将该混合数据发布为默认新闻。
- [独立视觉CI](https://github.com/mahejiang653-maker/kazakh-broadcast-worker/actions/runs/39100949986)：SUCCESS（2026-10-19续查已完成结果）；上述独立正式站32项验收同样保留。
- 控制台保留既有Cesium CDN parser-blocking及terrain polygon outline提示；真实白色边界使用的polyline已独立检查GPU就绪和画面可见，错误数为0。

## 已解决的攻击渲染故障

1. 原Top2虽进入MISSILE_ATTACK，但旧解析器漏读scenePlan.attackEffect与relatedCountryIso3s，攻击方为空。新增共享attack-model解析平铺/嵌套字段与明确两国角色，未知发射位置保留已知攻击方和受袭方身份。
2. 双国攻击先显示事实明确的涉事国家，再推进真实目标；已知发射源保留可信源至目标的取景。国家显示锚点不作为发射坐标；无源只显示目标命中，不编造轨迹。
3. 导弹/无人机已知源走球面路径；三轮命中脉冲后保留国家实体和目标事件环，避免回退finalLocation清空上下文。推进目标后远端国旗按实际可见范围显示，不强行拉入目标特写。
4. 国旗改用全量本地PNG，完整ISO3映射不依赖GeoJSON可选iso_a2。正式复验发现的白旗与Top5刚果（金）缺旗均已修复。
5. focus、overview、resize和异步计时器受导航序号约束；攻击专用画布约束与顶部归位修复实际viewport裁切。白色国界范围只包含涉事国家。
6. 实际补录暴露“实体存在但几何未绘制”的假通过。现在等待具体国家实体的可视化批次就绪后才播攻击；浏览器测试独立检查ready Primitive内真实GPU实例。阻塞真实Worker时不播放脉冲，导航可取消；放行后完整播放。自动播放等待几何、动画及静态停留，避免提前切走。不能用DataSourceDisplay整体PENDING直接推断某个国家是否已绘制。

## 已确认的用户标准

- 固定10条，选文件后直接导入；只做防页面崩溃的基本数据结构检查，不核验新闻真实性、报道时间或报道链接。旧的24小时窗口和链接数量不得阻断导入。
- 不针对俄罗斯、乌克兰、基辅写特例；通用导弹/无人机、已知/未知源、任意有效双国身份。
- 涉事国白边界、地点红点、原V52风格与直角画布；威胁公告点位规则和市县定位规则保持当前main行为。
- 不修改无关配音系统，不大规模重构。

## 历史完整验收证据（2026-10-16）

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
