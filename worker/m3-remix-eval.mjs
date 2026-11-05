import { handleVoiceProbe } from "./m3-voice-probe.ts";

const CREATE_PATH = "/api/internal/m3-remix-evaluation/create";
const SYNTH_PATH = "/api/internal/m3-remix-evaluation/synthesize";
const STATUS_PATH = "/api/internal/m3-remix-evaluation/status";
const VOICES = "https://generativelanguage.googleapis.com/v1beta/voices";
const TTS = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:streamGenerateContent?alt=sse";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

function evaluationEnabled(env) {
  if (env.M3_EVAL_ENABLED !== "enabled") return false;
  const expires = Number(env.M3_EVAL_NOT_AFTER);
  const now = Date.now();
  return Number.isSafeInteger(expires) && expires > now && expires <= now + 30 * 60_000;
}

const cleanText = text => text.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/gu, "")
  .replace(/[\r\n\t\u00A0\u202F\u3000]+/gu, " ").replace(/ {2,}/g, " ").trim();

async function readSmallJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  let bytes = 0, content = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new Error("body too large"); }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    return JSON.parse(content);
  } finally {
    reader.releaseLock();
  }
}

export async function handleEvaluation(request, env, upstreamFetch = fetch) {
  const path = new URL(request.url).pathname;
  if (path !== CREATE_PATH && path !== SYNTH_PATH && path !== STATUS_PATH) return json({ code: "NOT_FOUND" }, 404);
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  // Reuse the independent admin-token check without ever sending a Google request.
  const authRequest = new Request("https://internal.invalid/api/internal/m3-voice-probe?check=auth", {
    method: "POST", headers: { "X-M3-Probe-Token": request.headers.get("X-M3-Probe-Token") ?? "" },
  });
  const auth = await handleVoiceProbe(authRequest, env);
  if (!auth.ok) return auth;
  if (path === STATUS_PATH) return json({ code: "EVALUATION_STATUS", enabled: evaluationEnabled(env) });
  if (!evaluationEnabled(env)) return json({ code: "EVALUATION_DISABLED" }, 503);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return json({ code: "GEMINI_KEY_MISSING" }, 503);

  let url, payload;
  if (path === CREATE_PATH) {
    url = VOICES;
    payload = {
      store: true,
      voice: {
        model: "gemini-3.8-flash-tts", type: "prompted",
        display_name: "M3 Iapetus Kazakh Remix Evaluation",
        language_code: "kk-KZ", context: "News", gender: "male",
        prompted: {
          base_voice: "Iapetus",
          input: "Preserve the original voice identity and timbre. Make a subtle adjustment toward calm, clear Kazakh news narration with steady cadence and restrained expression. Avoid theatrical changes and exaggerated emotion.",
        },
      },
    };
  } else {
    let body;
    try { body = await readSmallJson(request); }
    catch { return json({ code: "INVALID_REQUEST" }, 400); }
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const voice = typeof body?.voice === "string" ? body.voice : "";
    if (text.length < 5000 || text.length > 5300 ||
        (voice !== "Iapetus" && !/^voice_[A-Za-z0-9_-]{1,100}$/.test(voice)) ||
        (body.model !== undefined && body.model !== "gemini-3.8-flash-lite-tts")) {
      return json({ code: "INVALID_REQUEST" }, 400);
    }
    url = TTS;
    payload = {
      contents: [{ role: "user", parts: [{ text: cleanText(text) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"], maxOutputTokens: 16384,
        responseFormat: { audio: { mimeType: "AUDIO_L16", sampleRate: 24000 } },
        speechConfig: { voiceConfig: { voice } },
      },
    };
  }

  let upstream;
  try {
    upstream = await upstreamFetch(url, {
      method: "POST", redirect: "manual",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json", "Accept": path === CREATE_PATH ? "application/json" : "text/event-stream" },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(path === CREATE_PATH ? 60000 : 540000)]),
    });
  } catch {
    return json({ code: "UPSTREAM_NETWORK_ERROR", outcomeUnknown: true }, 502);
  }
  if (!upstream.ok) return json({ code: "GOOGLE_REQUEST_FAILED", upstreamStatus: upstream.status }, 502);
  if (path === CREATE_PATH) {
    let result;
    try { result = await upstream.json(); } catch { return json({ code: "CREATION_RESULT_INVALID", outcomeUnknown: true }, 502); }
    if (typeof result?.id !== "string" || !/^voice_[A-Za-z0-9_-]{1,100}$/.test(result.id)) return json({ code: "CREATION_RESULT_INVALID", outcomeUnknown: true }, 502);
    const usage = {};
    for (const field of ["total_input_tokens", "total_output_tokens"]) {
      if (Number.isSafeInteger(result.usage?.[field]) && result.usage[field] >= 0) usage[field] = result.usage[field];
    }
    return json({ code: "VOICE_CREATED", id: result.id, usage });
  }
  if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) {
    return json({ code: "INVALID_AUDIO_STREAM", outcomeUnknown: true }, 502);
  }
  return new Response(upstream.body, { status: 200, headers: {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff",
  } });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/api/internal/m3-voice-probe") return handleVoiceProbe(request, env);
    return handleEvaluation(request, env);
  },
};
