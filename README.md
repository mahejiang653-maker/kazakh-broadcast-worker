# 哈萨克语广播站 · Cloudflare Workers

将哈萨克语新闻文稿转换为可试听、可下载的 MP3。默认提供：

- 男声：`kk-KZ-DauletNeural`
- 女声：`kk-KZ-AigulNeural`
- 新闻播报、沉稳播报、快讯播报三种语速

语音合成使用 Microsoft Edge TTS 兼容接口，不使用 OpenAI TTS API。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

## 部署到 Cloudflare Workers

```bash
npm ci
npm run deploy
```

Wrangler 会根据 `wrangler.jsonc` 构建并部署应用。首次部署时需要登录
Cloudflare，成功后会得到一个公开的 `workers.dev` 地址。

## 验证

```bash
npm run build
npx wrangler deploy --dry-run
```
