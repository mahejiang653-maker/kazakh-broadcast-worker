# V52 事件地点特写：导入与地图说明

入口仍是原有 `news-globe-run-20260920-v52-r1.html`。原有 10 条 JSON 不必增加字段；只有确有核验材料的新记录才会启用新增镜头。

每条新闻可增加以下字段（其余原有字段照常保留）：

```json
{
  "locationPrecision": "site",
  "detailEnabled": true,
  "eventLocation": {
    "lon": -89.2811,
    "lat": 42.075,
    "verified": true,
    "sourceUrl": "https://downloads.regulations.gov/NRC-2020-0101-0144/content.pdf"
  },
  "targetBounds": [-89.294, 42.065, -89.270, 42.085],
  "cameraPreset": {
    "approachDuration": 2.8,
    "siteDuration": 3.2,
    "detailDuration": 4,
    "siteHeight": 4000
  },
  "detailImage": {
    "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c8/Byron_Clean_Energy_Center_2025-1.jpg/1280px-Byron_Clean_Energy_Center_2025-1.jpg?utm_campaign=index&utm_content=thumbnail&utm_source=commons.wikimedia.org",
    "kind": "historical",
    "source": "MediaGuy768 / Wikimedia Commons（尺寸调整）",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Byron_Clean_Energy_Center_2025-1.jpg",
    "date": "2025-02-19",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "verified": true,
    "locationMatch": true
  }
}
```

以上拜伦核电站数据只作历史地点与字段示例，不代表当天发生了任何新闻。经纬度为 WGS84，范围为 `[西经度, 南纬度, 东经度, 北纬度]`；镜头会拒绝异常、跨度过大或不包含地点的范围。`siteHeight` 单位为米，时长单位为秒，并受安全上下限约束。国家镜头时长仍可在现有“分镜时长设置”里调整；`approachDuration` 与 `siteDuration` 相加控制连续推进的总时长，`detailDuration` 控制末尾停留。

`locationPrecision` 支持 `exact`（具体建筑）、`site`（设施范围）、`city`、`region`。只有 `exact` 或 `site` 可飞到设施级；`city`、`region` 保持较高的相应范围。缺少来源、核验标记或有效坐标时，不采用新位置；如果原来的经纬度有效，就继续使用原位置。国家范围且 `noPoint: true` 的新闻不会生成地点红点。设置 `detailEnabled: false` 可关闭本条的新增镜头。

为兼容旧 JSON，保留 `detailImage` 字段及其元数据，但当前播放器不会加载或显示照片；最终停留画面始终为卫星底图。上面的照片字段仅展示旧数据格式，不代表该图片会被使用。

启用新增地点镜头的袭击新闻会保留既有国家、疆界与地点镜头，但关闭模拟弹道和爆炸效果，避免将动画误认为真实现场。未启用新增地点镜头的旧数据仍使用原有播放行为。

卫星底图为 Esri World Imagery，影像日期、分辨率和来源因地点而异，并非实时；屏幕上的 Cesium attribution 仍须保留。地图边界数据包含 Natural Earth 和项目已有的中国边界数据。最终画面使用现有卫星底图，实际细节清晰度依提供方与网络状况而定。

仅供测试的四个地点、来源和历史照片在 `tests/fixtures/v52-event-detail-sites.json`；它们不写入正式每日新闻数据。测试中的乌克兰和新疆条目明确标为历史事件，不代表当天新闻。

如果新闻还提供原有 `state`、`city` 等上级地点字段，现有行政区镜头仍会尝试通过项目地理服务取得真实边界并展示；该服务不可用或无法确认边界时，会跳过该行政区而继续事件红点及特写，不会伪造行政区轮廓。
