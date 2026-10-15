import { encode } from "@msgpack/msgpack";

type TestEnv = { FISH_AUDIO_API_KEY?: string; FISH_DRAMA3_RUN_TOKEN?: string };
const VERSION = "fish-drama3-independent-v2-readiness";
const MODELS = new Set(["drama-3", "s2.1-pro-free"]);
const MAX_BODY = 3_000_000;
const MAX_AUDIO = 20_000_000;
const json = (body: object, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

// The authorized QA workflow installs a new random token for at most 15 minutes,
// then removes it. Existing Fish credentials and the user's access PIN stay intact.
function activeToken(token: string | undefined) {
  token = token?.trim();
  if (!token || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const expires = Number(token.split(".")[0]);
  const remaining = expires - Date.now();
  return remaining > 0 && remaining <= 15 * 60_000;
}

async function sameToken(left: string, right: string) {
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

export function independentFishStatus(env: TestEnv) {
  const token = env.FISH_DRAMA3_RUN_TOKEN?.trim();
  const validFormat = Boolean(token && /^\d{13}\.[a-f0-9]{64}$/.test(token));
  return json({ version: VERSION, models: [...MODELS], keyConfigured: Boolean(env.FISH_AUDIO_API_KEY?.trim()),
    operatorRunActive: activeToken(token), operatorTokenConfigured: Boolean(token), operatorTokenFormatValid: validFormat,
    operatorTokenSecondsRemaining: validFormat ? Math.floor((Number(token!.split(".")[0]) - Date.now()) / 1000) : null,
    serverTime: new Date().toISOString(), changesProductionDefaults: false });
}

export async function handleIndependentFishTest(request: Request, env: TestEnv, fetcher: typeof fetch = fetch) {
  const token = env.FISH_DRAMA3_RUN_TOKEN?.trim();
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!activeToken(token) || !supplied || supplied.length > 100 || !await sameToken(supplied, token!)) {
    return json({ error: "独立测试未授权或已过期。", code: "FISH_TEST_UNAUTHORIZED" }, 403);
  }
  const key = env.FISH_AUDIO_API_KEY?.trim();
  if (!key) return json({ error: "Fish 服务端密钥尚未配置。", code: "FISH_CONFIG_MISSING" }, 503);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "需要 JSON 请求。" }, 415);
  let data: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY) return json({ error: "测试请求过大。" }, 413);
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "请求格式错误。" }, 400);
    data = parsed as Record<string, unknown>;
  } catch { return json({ error: "请求格式错误。" }, 400); }
  if (typeof data.model !== "string" || !MODELS.has(data.model)) return json({ error: "请选择 Drama 3 或 S2.1 Pro 测试模型。", code: "FISH_TEST_MODEL_INVALID" }, 400);
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 1200) return json({ error: "请输入 1–1200 字符。" }, 400);
  const reference = data.reference as { audioBase64?: unknown; text?: unknown } | undefined;
  if (!reference || typeof reference.audioBase64 !== "string" || !reference.audioBase64 || reference.audioBase64.length > 2_700_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(reference.audioBase64) ||
      typeof reference.text !== "string" || !reference.text.trim() || reference.text.length > 1200) {
    return json({ error: "需要完整参考音频及其准确文本。", code: "FISH_TEST_REFERENCE_INVALID" }, 400);
  }
  const decoded = atob(reference.audioBase64);
  const audio = Uint8Array.from(decoded, char => char.charCodeAt(0));
  if (audio.length < 100 || audio.length > 2_000_000) return json({ error: "参考音频大小不合格。" }, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const packed = encode({ text: data.text, references: [{ audio, text: reference.text }],
      format: "wav", sample_rate: 24000, temperature: 0.7, top_p: 0.7, normalize: false,
      prosody: { speed: 1, volume: 0 }, chunk_length: 300, latency: "normal", condition_on_previous_chunks: true });
    const upstream = await fetcher("https://api.fish.audio/v1/tts", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/msgpack", model: data.model },
      body: new Uint8Array(packed).buffer, signal: controller.signal,
    });
    if (!upstream.ok) return json({ error: `Fish API 返回 HTTP ${upstream.status}。`, code: "FISH_UPSTREAM_ERROR", upstreamStatus: upstream.status,
      requestedModel: data.model, version: VERSION }, 502);
    const served = upstream.headers.get("X-Model") || upstream.headers.get("X-Fish-Model");
    if (served && served !== data.model) return json({ error: "Fish 返回的模型与请求不一致。", code: "FISH_MODEL_MISMATCH", requestedModel: data.model, servedModel: served }, 502);
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength < 44 || bytes.byteLength > MAX_AUDIO) return json({ error: "音频为空或超过限制。", code: "FISH_AUDIO_INVALID" }, 502);
    const signature = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 12));
    if (!signature.startsWith("RIFF") || !signature.endsWith("WAVE")) return json({ error: "Fish 未返回 WAV 音频。", code: "FISH_AUDIO_INVALID" }, 502);
    return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store",
      "X-Fish-Test-Version": VERSION, "X-Fish-Requested-Model": data.model, ...(served ? { "X-Fish-Upstream-Model": served } : {}) } });
  } catch { return json({ error: "Fish 测试请求超时或连接失败。", code: "FISH_TEST_NETWORK_ERROR" }, 504); }
  finally { clearTimeout(timeout); }
}
