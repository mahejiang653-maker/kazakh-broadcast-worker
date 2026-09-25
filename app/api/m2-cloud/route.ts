const MAX_CHARACTERS = 15000;

export async function POST(request: Request) {
  const endpoint = process.env.M2_MODAL_ENDPOINT?.trim();
  if (!endpoint) {
    return Response.json(
      { error: "M2 Cloud Turbo 尚未完成服务器端点配置。", code: "M2_CLOUD_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let body: { text?: string; preset?: string; speed?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "请输入哈萨克语文本。" }, { status: 400 });
  if (text.length > MAX_CHARACTERS) {
    return Response.json({ error: `文本不能超过 ${MAX_CHARACTERS} 个字符。` }, { status: 413 });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        preset: body.preset ?? "news",
        speed: body.speed ?? 1,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return Response.json(
        { error: "M2 GPU 服务器生成失败。", detail: detail.slice(-800) },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "audio/wav",
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="m2-cloud.wav"',
        "X-M2-Backend": "modal-gpu",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "无法连接 M2 GPU 服务器。" },
      { status: 502 },
    );
  }
}
