/** One-shot, admin-only, read-only Gemini Voices capability check. */
type Env = { GEMINI_API_KEY?: string; M3_VOICE_PROBE_TOKEN?: string };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const GOOGLE_ERROR_TYPES = new Set([
  "INVALID_ARGUMENT", "FAILED_PRECONDITION", "UNAUTHENTICATED", "PERMISSION_DENIED",
  "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED",
]);
async function safeGoogleErrorType(response: Response): Promise<string> {
  // A bounded read lets us report a standard Google status without exposing
  // an arbitrary response body, error message, voice metadata, or credentials.
  try {
    const reader = response.body?.getReader();
    if (!reader) return "UNKNOWN";
    const decoder = new TextDecoder();
    let bytes = 0, text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return "UNKNOWN";
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const status = JSON.parse(text)?.error?.status;
    return typeof status === "string" && GOOGLE_ERROR_TYPES.has(status) ? status : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
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
      redirect: "manual",
    });
    // Do not forward the upstream body: it can contain user-specific voice metadata.
    return json({ checked: true, allowed: response.ok, upstreamStatus: response.status,
      ...(response.ok ? {} : { upstreamErrorType: await safeGoogleErrorType(response) }),
      code: response.ok ? "VOICE_LIST_AVAILABLE" : "VOICE_LIST_UNAVAILABLE" }, response.ok ? 200 : 502);
  } catch {
    return json({ checked: false, code: "UPSTREAM_NETWORK_ERROR" }, 502);
  }
}

// Standalone entry point: this Worker has no site, synthesis, or Durable Object routes.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/api/internal/m3-voice-probe") {
      return json({ code: "NOT_FOUND" }, 404);
    }
    return handleVoiceProbe(request, env);
  },
};
