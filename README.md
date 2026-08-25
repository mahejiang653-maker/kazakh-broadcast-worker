# 哈萨克语广播站 · Cloudflare Workers

将哈萨克语新闻文稿转换为可试听、可下载的 MP3。网站提供两种语音模式。

## 免费模式 · Edge TTS

- 男声：`kk-KZ-DauletNeural`
- 女声：`kk-KZ-AigulNeural`
- 新闻播报、沉稳播报、快讯播报三种语速
- 不需要 ElevenLabs API Key

免费语音合成继续使用 Microsoft Edge TTS 兼容接口，不使用 OpenAI TTS API。

## 高质量模式 · ElevenLabs v3

- 模型：`eleven_v3`
- 语言：Kazakh / `kk`
- 输出：MP3 44.1 kHz / 128 kbps
- 支持长稿自动分段生成
- 登录式私人访问密码保护，避免公开网站被他人消耗 ElevenLabs 额度
- 声线从当前 ElevenLabs 账号实时读取，不写死 George / Rachel
- 以后添加中国哈萨克族克隆声线后，网页可直接读取并选择，无需再次修改前端代码

## Cloudflare 必须配置的 Secrets

ElevenLabs API Key 和私人访问密码必须保存在 Cloudflare Worker 的 Secret 中，不要写入源码或提交到 GitHub。

需要两个 Secret：

```text
ELEVENLABS_API_KEY
ELEVENLABS_ACCESS_PIN
```

`ELEVENLABS_ACCESS_PIN` 请设置为只有自己知道的较长密码。这个密码用于网站高质量模式的私人访问，不是 ElevenLabs API Key。

如果没有配置这两个 Secret，高质量模式会提示尚未配置，但免费 Edge TTS 模式仍可正常使用。

## 手机端使用高质量模式

1. 打开网站并切换到“高质量模式”。
2. 输入你在 Cloudflare 中设置的 `ELEVENLABS_ACCESS_PIN`。
3. 点击“读取声线”。
4. 网站会通过服务端读取你的 ElevenLabs 可用声线。
5. 选择一个声线，粘贴哈萨克语稿件。
6. 点击生成，完成后可直接试听或下载 MP3。

私人访问密码仅保存在当前浏览器标签页的 `sessionStorage`，关闭标签页后浏览器会清除这次会话保存的数据；API Key 永远只保存在 Cloudflare 服务端。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

本地测试 ElevenLabs 时，可在本地 `.dev.vars` 或 `.env` 中设置：

```text
ELEVENLABS_API_KEY=你的密钥
ELEVENLABS_ACCESS_PIN=你的私人访问密码
```

不要把真实密钥或密码提交到 GitHub。

## 部署到 Cloudflare Workers

```bash
npm ci
npm run deploy
```

Wrangler 会根据 `wrangler.jsonc` 构建并部署应用。成功后会得到一个公开的 `workers.dev` 地址。

部署后，在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中添加：

- `ELEVENLABS_API_KEY`：类型选择 Secret
- `ELEVENLABS_ACCESS_PIN`：类型选择 Secret

然后 Deploy 使 Secret 生效。

## 验证

```bash
npm test
npx wrangler deploy --dry-run
```

仓库包含 GitHub Actions CI；每次推送到 `main` 会自动执行依赖安装、生产构建和页面测试。
