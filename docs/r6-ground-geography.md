# R6 贴地国界与地理线面

当前入口仍为 `/news-globe-run-20260920-v52-r1.html`。本次不替换新闻标题、排序和日期，也不修改冻结的 Y1 页面。

## 展示变化

- 原国界实体的 18–22 公里高度归零。当前无三维地形时直接使用零高度地表线，避免把约 8,000 个分段全部进行地形投射；切换到实际三维地形时自动启用 Cesium 贴地线。既有中国轮廓、514 个多边形、邻国边界归属和国家镜头逻辑继续保留。
- 近景按需读取 Natural Earth 1:10m 轮廓，替换粗略的国外显示线。18 个纬度资源包合计约 2 MB，浏览器最多缓存 6 个纬度带；下载失败时使用贴地的原始轮廓。新的资源不添加另一套中国轮廓。
- 第 11 条显示“北京”，国家标签仍显示中华人民共和国。北京是展示锚点，研究机构具体位置仍保留待核实说明。
- 独库公路以完整参考路线显示，镜头适配全线路，不再显示中段红点。路线来自捷安特骑游地图公开线路 3631，使用源页面转换到高德坐标前的 WGS84 数据。这是含沿途停靠路段的骑游参考线路，不是测绘中心线，地图标签明确注明“参考路线”。
- 墨西哥湾和霍尔木兹海峡使用虚线范围及淡色填充，并注明“范围示意”；不表示飓风、封锁或航道的精确边界。
- 空标签隐藏，手机控制按钮保持单行。

## 后续导入

城市继续使用 `lon`、`lat` 和 `focusLabel`。道路、河流、湖泊、景区、山脉可设置 `featureKind` 为 `road`、`water`、`scenic`、`mountain`，并提供 WGS84 GeoJSON `focusGeometry`。支持 LineString、MultiLineString、Polygon、MultiPolygon，含多边形孔洞。

也支持 `focusLine`、`focusMultiLine`、`focusPolygon`、`focusMultiPolygon`，以及 `[西, 南, 东, 北]` 形式的 `focusBounds` / `focusBBox`。范围框默认使用虚线，并注明示意。坐标必须有效，多边形须闭合，最多 50,000 个顶点。没有可用线面时显示“范围待补”，不会自动编造轮廓或退化成红点。

切换新闻会取消当前线面查询、移除线面和标签、移除近景镜头监听器；异步返回受到导航序号检查。总览不保留道路、水域或近景轮廓实体。

## 数据重建与验证

`scripts/package-r6-detail-borders.py` 从 Natural Earth 原始 GeoJSON 生成 10 度瓦片和 18 个压缩纬度包，记录原始数据 SHA-256 与来源。需要 Python 3 和 shapely。`scripts/package-r6-duku-route.py` 从公开参考线路的 JSON 重建路线资源。

`tests/r6-geography.test.mjs` 覆盖城市标签、地点类型、导入校验、贴地国界、异步取消和内置数据范围。`.github/scripts/verify-r6-geography.mjs` 在真实 Cesium 场景检查整条路线入镜、手机和横屏布局、40 次快速切换及总览清理。生产工作流保留原 R6 全量验收，并增加本次线面验收。

数据来源：

- https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/ （public domain）
- https://map.giant.com.cn/index.php/route/ridetrail_index?id=3631
