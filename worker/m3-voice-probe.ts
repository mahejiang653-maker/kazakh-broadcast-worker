/** One-shot, admin-only, read-only Gemini Voices capability check. */
type Env = { GEMINI_API_KEY?: string; M3_VOICE_PROBE_TOKEN?: string };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function handleVoiceProbe(request: Request, env: Env, upstreamFetch: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const expected = env.M3_VOICE_PROBE_TOKEN?.trim();
  // Fail closed until a distinct, high-entropy administrator token is configured.
  if (!expected || expected.length < 32) return json({ code: "PROBE_DISABLED" }, 503);
  const provided = request.headers.get("X-M3-Probe-Token") ?? "";
  // Compare without early mismatch exits; never log or return credentials.
  const encoder = new TextEncoder();
  const a = encoder.encode(expected), b = encoder.encode(provided);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) return json({ code: "UNAUTHORIZED" }, 401);
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return json({ code: "GEMINI_KEY_MISSING" }, 503);
  try {
    const response = await upstreamFetch("https://generativelanguage.googleapis.com/v1beta/voices", {
      method: "GET",
      headers: { "x-goog-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    // Do not forward the upstream body: it can contain user-specific voice metadata.
    return json({ checked: true, allowed: response.ok, upstreamStatus: response.status,
      code: response.ok ? "VOICE_LIST_AVAILABLE" : "VOICE_LIST_UNAVAILABLE" }, response.ok ? 200 : 502);
  } catch {
    return json({ checked: false, code: "UPSTREAM_NETWORK_ERROR" }, 502);
  }
}
