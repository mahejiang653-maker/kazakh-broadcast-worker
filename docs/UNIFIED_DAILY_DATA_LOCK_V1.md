# 全球日报—V52地球仪—图片检索：统一 DATA LOCK v1

文件格式使用既有 V52 导入对象 `{"meta":{...},"news":[...]}`，**不是**另起字段结构。

- `meta.schemaVersion` 固定 `news-data-lock/v1`，`meta.edition` 固定 `daily-10`，`meta.date` 为北京时间截止日期，`meta.timeZone` 固定 `Asia/Shanghai`。
- `meta.windowStart` 为前一天 `13:00:00+08:00`（含），`meta.windowEnd` 为当天 `13:00:00+08:00`（不含）。`meta.dataLock` 为日报唯一编号。`newsCount=10`、`imagesPerNews=3`。
- 新闻数组**严格Top1至Top10**。保留已在地球仪生产引擎使用的 `id`、`title`、`summary`、`location`、`focusLabel`、`lon`、`lat`、`countryIso3`、`sceneMode`、`scenePlan.primaryIso3`。新增 `eventType`、`placeType`、`relatedCountryIso3s`、`sources:[{name}]`、`reportedAt`、`articleUrls`。
- `reportedAt` 首选带 `+08:00` 的实际发布日期；仅能确定日期时写 `YYYY-MM-DD`，显示核验警告而**不编造时分秒**。具体事实发生时间可另外保留在 `occurredAt`。
- `articleUrls` 每条最多3个**报道网页** HTTPS 链接，必须实际确认；未核实则空数组（会提示缺口）。**不是**图片 URL。图片网站的审核结果另存在其 `results[].imageUrl`。
- 地球仪：打开当前 V52·A1 R6 页面 → 设置 → 导入统一10条DATA LOCK JSON文件 → 检查提示 → 保存并应用 → 地球仪按Top1–Top10显示。旧13条源文件保留为历史预览。
- 图片网站：打开原站 → 导入**同一个**JSON文件 → 自动填充十个标题 → 开始检索；后端再次检查字段、顺序、地点和时间后创建原有10×3任务。旧手动输入和历史任务均保留。
- 日报：只生成一次同一份JSON，七大板块引用相同 `id/title` 和 `meta.dataLock`；并将新闻报道链接填入对应 `news[i].articleUrls`。无需每日修改代码。

验证采用纯JavaScript，不调用Gemini，也不启动真实图片任务。仅做基本的共同事件词与国家/城市标签错误检测；跨语言事实核验、真实地理归属和报道网址是否可打开仍需新闻编辑核验。
