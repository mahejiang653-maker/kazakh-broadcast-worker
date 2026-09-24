const MODEL_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/";

type RouteContext = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

function safeModelPath(parts: string[]) {
  if (!Array.isArray(parts) || !parts.length) return null;
  const joined = parts.join("/");
  if (
    joined.includes("..") ||
    joined.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(joined)
  ) {
    return null;
  }

  const allowed = [
    "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx",
    "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx.json",
    "kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx",
    "kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx.json",
    "kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx",
    "kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx.json",
  ];

  return allowed.includes(joined) ? joined : null;
}

async function proxyModel(request: Request, context: RouteContext, headOnly = false) {
  const { path } = await context.params;
  const asset = safeModelPath(path);
  if (!asset) {
    return new Response("Invalid Piper model asset.", { status: 400 });
  }

  const headers = new Headers({
    "User-Agent": "Qazaq-Radio-Voice/1.0",
    Accept: asset.endsWith(".json")
      ? "application/json,text/plain;q=0.8,*/*;q=0.1"
      : "application/octet-stream,*/*;q=0.1",
  });
  const range = request.headers.get("range");
  if (range) headers.set("Range", range);

  const upstream = await fetch(MODEL_BASE + asset, {
    method: headOnly ? "HEAD" : "GET",
    headers,
    redirect: "follow",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Piper model upstream error: ${upstream.status}`, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    upstream.headers.get("content-type") ||
      (asset.endsWith(".json") ? "application/json" : "application/octet-stream"),
  );
  responseHeaders.set(
    "Cache-Control",
    asset.endsWith(".json")
      ? "public, max-age=86400, stale-while-revalidate=604800"
      : "public, max-age=604800, stale-while-revalidate=604800",
  );
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  for (const name of [
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(headOnly ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxyModel(request, context, false);
}

export async function HEAD(request: Request, context: RouteContext) {
  return proxyModel(request, context, true);
}
