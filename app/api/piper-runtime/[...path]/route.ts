const VERSION = "1.1.2";
const BASE = `https://unpkg.com/piper-tts-web@${VERSION}/dist/`;

type RouteContext = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

function safePath(parts: string[]) {
  if (!Array.isArray(parts) || !parts.length) return null;
  const joined = parts.join("/");
  if (
    joined.includes("..") ||
    joined.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(joined)
  ) {
    return null;
  }
  if (
    joined !== "piper-tts-web.js" &&
    !joined.startsWith("onnx/") &&
    !joined.startsWith("piper/")
  ) {
    return null;
  }
  return joined;
}

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const asset = safePath(path);
  if (!asset) {
    return new Response("Invalid Piper runtime asset.", { status: 400 });
  }

  const requestHeaders = new Headers({
    "User-Agent": "Qazaq-Radio-Voice/1.0",
    Accept: "*/*",
  });
  const range = request.headers.get("range");
  if (range) requestHeaders.set("Range", range);

  const upstream = await fetch(BASE + asset, {
    headers: requestHeaders,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Piper runtime upstream error: ${upstream.status}`, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ||
      (asset.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : asset.endsWith(".wasm")
          ? "application/wasm"
          : "application/octet-stream"),
  );
  headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  headers.set("X-Content-Type-Options", "nosniff");

  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
