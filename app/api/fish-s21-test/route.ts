import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
const MAX_TEXT = 1200;
export async function POST(request: NextRequest) {
  const key = process.env.FISH_AUDIO_API_KEY;
  const pin = process.env.FISH_AUDIO_ACCESS_PIN;
  if (!key || !pin) return NextResponse.json({ error: "Fish 测试模式尚未配置服务端密钥和访问密码。" }, { status: 503 });
  let payload: { text?: unknown; pin?: unknown; referenceId?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "无效请求" }, { status: 400 }); }
  if (typeof payload.pin !== "string" || payload.pin !== pin) return NextResponse.json({ error: "访问密码错误" }, { status: 401 });
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text || text.length > MAX_TEXT) return NextResponse.json({ error: "每次测试请输入 1–1200 字符。" }, { status: 400 });
  const referenceId = typeof payload.referenceId === "string" ? payload.referenceId.trim() : "";
  if (referenceId && !/^[a-zA-Z0-9_-]{1,128}$/.test(referenceId)) return NextResponse.json({ error: "声线 ID 格式错误" }, { status: 400 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const upstream = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
      body: JSON.stringify({ text, format: "mp3", ...(referenceId ? { reference_id: referenceId } : {}) }),
      signal: controller.signal,
    });
    if (!upstream.ok) return NextResponse.json({ error: `Fish API 请求失败（HTTP ${upstream.status}）。请检查模型额度、声线和服务状态。` }, { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20_000_000) return NextResponse.json({ error: "音频为空或超出大小限制" }, { status: 502 });
    return new NextResponse(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Fish API 超时或网络错误" }, { status: 504 });
  } finally { clearTimeout(timeout); }
}
