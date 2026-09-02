# daily-news-image-pack

自动为每日13条新闻抓取真实图片并打包 ZIP。

规则：
- 13条新闻，每条固定3张，共39张。
- 只接受真实摄影、真实卫星影像或真实设施照片。
- 优先近期、直接相关新闻；其次同地点/设施；最后高度相关的真实历史摄影。
- 默认使用 Wikimedia Commons API 作为首个可再分发来源。
- 最低尺寸默认 1600×900；不足时自动跳过。
- 不生成AI图、不生成程序示意图、不用SVG凑数。
- ZIP内附 manifest.json，记录来源、许可、尺寸、原始页面。

## 输入
编辑 `daily-news-image-pack/news.json`，每条新闻提供：
- `id`: 1-13
- `title`: 新闻标题
- `queries`: 3组英文检索词，建议分别对应地点/主体/设施或场景

## 输出
GitHub Actions 运行后上传 Artifact：
`daily-news-images-YYYY-MM-DD.zip`

文件命名：
`01_1.jpg` ... `13_3.jpg`

若某条新闻没有找到3张符合标准的真实图片，manifest 会明确记录缺口，不会用假图补齐。
