/** Fish S2.1 test runs at Worker entry so Secrets come from actual runtime bindings. */
type FishEnv = { FISH_AUDIO_API_KEY?: string; FISH_AUDIO_ACCESS_PIN?: string };
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function handleFishTest(request: Request, env: FishEnv): Promise<Response> {
  const key = env.FISH_AUDIO_API_KEY?.trim();
  const pin = env.FISH_AUDIO_ACCESS_PIN?.trim();
  if (!key || !pin) return json({ error: "Fish 服务端配置缺失，请检查当前 Worker 的两个 Secret。", code: "FISH_CONFIG_MISSING", keyConfigured: Boolean(key), pinConfigured: Boolean(pin) }, 503);
  let data: Record<string, unknown>;
  try { data = await request.json() as Record<string, unknown>; } catch { return json({ error: "请求格式错误" }, 400); }
  if (typeof data.pin !== "string" || data.pin !== pin) return json({ error: "测试密码不正确" }, 401);
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text || text.length > 1200) return json({ error: "请输入 1–1200 字符。" }, 400);
  const referenceId = typeof data.referenceId === "string" ? data.referenceId.trim() : "";
  if (referenceId && !/^[a-zA-Z0-9_-]{1,128}$/.test(referenceId)) return json({ error: "声线 ID 格式错误" }, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const upstream = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
      body: JSON.stringify({ text, format: "mp3", ...(referenceId ? { reference_id: referenceId } : {}) }),
      signal: controller.signal,
    });
    if (!upstream.ok) return json({ error: `Fish API 返回 HTTP ${upstream.status}，请检查模型、账户额度或声线 ID。`, code: "FISH_UPSTREAM_ERROR" }, 502);
    const bytes = await upstream.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20_000_000) return json({ error: "音频为空或超过大小限制" }, 502);
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch { return json({ error: "Fish API 网络超时或连接失败" }, 504); }
  finally { clearTimeout(timeout); }
}
export function fishStatus(env: FishEnv): Response {
  return json({ service: "Fish S2.1 Pro test", keyConfigured: Boolean(env.FISH_AUDIO_API_KEY?.trim()), pinConfigured: Boolean(env.FISH_AUDIO_ACCESS_PIN?.trim()) });
}
