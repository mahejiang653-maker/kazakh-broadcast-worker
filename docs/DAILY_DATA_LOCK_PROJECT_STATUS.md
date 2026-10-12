# 每日10条 DATA LOCK：项目状态档案
> 核对日期：2026-10-12，北京时间。**这是每日生成的数据契约与维护状态，不是每日自动生成脚本。**

## 代码归属
- 主数据契约/地球仪导入：`mahejiang653-maker/kazakh-broadcast-worker`（`main`）；文档 `docs/UNIFIED_DAILY_DATA_LOCK_V1.md`；导入校验 `public/news-globe-v52-daily10.js`。
- 图片站消费端：`mahejiang653-maker/news-image-auditor`（`main`）；解析与验证 `src/daily-lock.js`、标题和job验证 `src/job-shape.js`。
- 最近两端已通过的代码提交：地球仪 `44cff1e6d3abdfe80635e1a6d29f0f55277e5e46`，图片站 `49b698d7fca978e1a905811676ca44634e419a3e`。

## 统一格式
- 版本：`meta.schemaVersion: "news-data-lock/v1"`、`meta.edition: "daily-10"`、`meta.timeZone: "Asia/Shanghai"`。
- 关键时间：`windowStart` 前一日13:00（含）／`windowEnd` 当日13:00（不含），必须带+08:00。
- **新闻**：`news` 恰好10条，`id`=1…10，按顺序不重复；`title`、`summary`、`reportedAt`、`sources`、`eventType`、`relatedCountryIso3s`、`location`、`focusLabel`、`placeType`、`lon`、`lat`、`countryIso3`、`sceneMode`、`scenePlan`。
- **报道网页**：`articleUrls` 为每条0–3个 **新闻报道HTML网址**（不得把图片URL写到这里）；图片结果只在图片站任务的 `results[].imageUrl`。
- **源头唯一**：同一个 `meta.dataLock` 和新闻Top顺序贯穿日报7个板块、地球仪、图片站，后续系统不得重新筛选和重排。
- **当前日期级数据样本**：2026-10-12，锁 `20261012-1300-BJT-TOP10-R1`。当天在普通聊天中生成的统一JSON曾通过结构检查，但**30条articleUrls仍为空、Top9–10只有日期精度**，属于明确待人工补证的内容缺口；不可称30篇报道均已附带。此文件不自动保存在GitHub每日覆盖。

## 自动检查与不足
- 地球仪：`tests/r6-daily10.test.mjs`、`tests/r6-entry.test.mjs`；图片站：`tests/daily-lock.test.js`、`tests/job-shape.test.js`。
- 已验证输入溢出/缺失、10条和30张目标、ID顺序、窗口、地点标签、基本scenePlan、报道URL与图片URL分离。
- 中文标题和摘要共享词校验**不等于**完整事实核验；坐标范围和少数国家标签比对**不等于**逆地理编码；链接格式合法**不等于**网页真实可访问。这三项仍需新闻编辑人工校核，缺失时输出警告，不编造。
- 不得每日报时自动修改源码；新的一天只需生成新的符合契约的JSON。不要安排定时ChatGPT Work、自动AI新闻搜索或自动图片全量测试。

## 异常恢复
见 `docs/NEWS_SYSTEM_RECOVERY.md`。保留旧锁文件且不得覆盖已锁定10条事实；修改必须生成新lock版本并重新用相同顺序导入各端。
