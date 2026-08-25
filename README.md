# 哈萨克语广播站 · Cloudflare Workers

将哈萨克语新闻文稿转换为可试听、可下载的 MP3。网站现在提供两种语音模式。

## 免费模式 · Edge TTS

- 男声：`kk-KZ-DauletNeural`
- 女声：`kk-KZ-AigulNeural`
- 新闻播报、沉稳播报、快讯播报三种语速
- 不需要 ElevenLabs API Key

免费语音合成继续使用 Microsoft Edge TTS 兼容接口，不使用 OpenAI TTS API。

## 高质量模式 · ElevenLabs v3

- 模型：`eleven_v3`
- 默认男声：George
- 默认女声：Rachel
- 输出：MP3 44.1 kHz / 128 kbps
- 支持哈萨克语长稿自动分段生成
- 后续可通过环境变量直接替换为中国哈萨克族或自定义克隆声线，无需修改前端

ElevenLabs 官方接口需要 API Key。API Key 必须保存在 Cloudflare Worker 的 Secret 中，不要写入源码或提交到 GitHub。

需要配置的 Secret：

```text
ELEVENLABS_API_KEY
```

可选的自定义声线变量：

```text
ELEVENLABS_VOICE_ID_MALE
ELEVENLABS_VOICE_ID_FEMALE
```

如果没有配置 `ELEVENLABS_API_KEY`，高质量模式会提示尚未配置，但免费模式仍可正常使用。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

本地测试 ElevenLabs 时，可在本地环境文件中设置：

```text
ELEVENLABS_API_KEY=你的密钥
```

不要把真实密钥提交到 GitHub。

## 部署到 Cloudflare Workers

```bash
npm ci
npm run deploy
```

Wrangler 会根据 `wrangler.jsonc` 构建并部署应用。首次部署时需要登录 Cloudflare，成功后会得到一个公开的 `workers.dev` 地址。

部署后请在 Cloudflare Worker 的 Secrets 中添加 `ELEVENLABS_API_KEY`，再使用高质量模式。

## 验证

```bash
npm run build
npx wrangler deploy --dry-run
```
