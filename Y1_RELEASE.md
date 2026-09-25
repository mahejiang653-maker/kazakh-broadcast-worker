# 全球新闻地球仪 Y1

发布入口：`/globe?v=Y1`。独立页面：`/news-globe-y1.html?v=Y1`。

Y1 封装本线程最终稳定化 checkpoint `67989993c80fe2484af66d6e271c5c7481194451`，仍以 V52 为基线。
Camera、事件特效、标签避让、新闻与边界数据逻辑没有再次修改。
35 个运行 JS/CSS 文件逐字节复制到 `/releases/y1/`；加载顺序保持 checkpoint 的实际输出顺序。
入口 HTML 提前展开原加载器，只调整资源地址、Y1 名称与版本元数据。
发布基于最新 main；A1、历史每日页面、现有共享脚本、API 与播音功能保留。

## 验证（2026-09-24）

- 43 项地球仪测试通过、零失败/跳过：8 个经纬度、多尺寸、日界线、高纬度、单/双国、导弹、无人机、局部边境冲突、80 次快速切换、cleanup、safe-area、标签避让。
- 生产构建、原播音页面 SSR、Y1 完整性与脚本顺序、`/globe` 指向 Y1，共 3 项通过。
- 发布清单 `public/releases/y1/manifest.json` 保存 checkpoint、入口及所有资源 SHA-256，用于部署后逐文件核对。
- 前轮浏览器存在 WebGL 初始化失败；上述自动化结果不等同于真实三维/GPU/Android 实机验收。该已知验收缺口没有通过修改渲染器规避。

复现：`npm test`；设置 `CESIUM_TEST_BUNDLE` 为 Cesium 1.145.0 的 `Build/CesiumUnminified/index.cjs`，然后执行 `npm run test:y1`。
完整回归输出：`tests/results/y1-regression.tap`。
重复打包：`node scripts/package-globe-y1.mjs /absolute/path/to/6798999-checkout`。
