# 新闻系统轻量维护与故障恢复
> 适用：全球新闻地球仪 V52、每日Top10 DATA LOCK，以及与图片站的接口。不是每天运行的作业。

## 只在以下时刻排查
用户报告真实错误；离线回归失败；修改地理/事件/导入关键代码；生产大版本升级。其他时候**不自动运行**Playwright、真实搜索、Gemini、TTS、全量地图视觉测试。

## 首选本地快速检查（Node 22，无npm安装、无网络调用）
```bash
node --test tests/r6-daily10.test.mjs tests/r6-entry.test.mjs tests/r6-story-borders.test.mjs tests/r6-overlay-lifecycle.test.mjs tests/r6-china-borders.test.mjs tests/r6-place-labels.test.mjs
```
GitHub轻量工作流：`news-globe-contract-lite.yml`，仅pull request或main相关文件变更触发；也可在Actions手动点 `Run workflow`。无日程任务。成本：GitHub runner的几秒Node计算，不调用任何收费模型。

## 诊断序列
1. 查仓库`main`提交和对应GitHub Actions CI结果，区分 **已合并／已部署／网页可用／E2E验收通过** 四个独立状态。
2. 数据问题：先检查 `meta.dataLock`、`news.length===10`、1–10 ID、北京时间窗口、sceneMode/scenePlan、坐标、国家和 `focusLabel`。输入无效拒绝；不要截断或重选新闻。
3. 界面问题：`tests/r6-daily10.test.mjs` 复现10条导航和历史；不要改旧的Y1快照或通用V14渲染代码去强行凑10条。
4. 视觉问题：仅确认是重大问题／重大升级之后，才允许Actions**手动**运行 `news-globe-20260920-v52-verify.yml`。警告：旧 `.github/scripts/verify-20260920-v52.mjs` 仍含13条和历史Top12假设；必须先改为本期真实10条（不能单纯把13全部替换为10），否则E2E会超时。过去失败运行：38251909421（waitForFunction等待13条）。
5. 复原：定位最近已通过同类测试的提交，在独立分支最小修复；本地测试→PR→只在确认没有用户数据破坏后合并。重大回退使用GitHub Revert新提交，不删除旧历史和Cloudflare缓存数据；原版Y1文件不动。
6. 保存状态：更新 `docs/NEWS_GLOBE_PROJECT_STATUS.md` 和 `docs/DAILY_DATA_LOCK_PROJECT_STATUS.md`，记录影响、commit、测试run和部署证据、剩余人工验收。不要用“工作完成”替代真实日志。

## 图片网站
图片网站详情：`https://github.com/mahejiang653-maker/news-image-auditor/blob/main/docs/IMAGE_AUDITOR_RECOVERY.md`。图片30/30只在10条每条都有3张验收结果时完成；历史13条允许读取。不得为验证而自动启动30图真实搜索。
