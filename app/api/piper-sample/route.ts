const SAMPLE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/samples/";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const speaker = Number(url.searchParams.get("speaker"));

  if (!Number.isInteger(speaker) || speaker < 0 || speaker > 5) {
    return new Response("Invalid Piper speaker.", { status: 400 });
  }

  const requestHeaders = new Headers({
    "User-Agent": "Qazaq-Radio-Voice/1.0",
    Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
  });
  const range = request.headers.get("range");
  if (range) requestHeaders.set("Range", range);

  const upstream = await fetch(`${SAMPLE_BASE}speaker_${speaker}.mp3`, {
    headers: requestHeaders,
    redirect: "follow",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Piper sample upstream error: ${upstream.status}`, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
