import { m3Crc32 } from "./m3-signal";
import { Buffer } from "node:buffer";
import { generateM3Program, M3Error } from "./m3-pipeline";
import { M3_VERSION, normalizeM3DiagnosticMode, type M3TextMode } from "./m3-script";
const GEMINI_VOICES_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/voices";
const MAX_CHARACTERS = 15000;

const M3_ANCHOR_TOKEN = "m3-persistent-anchor";
const M3_VOICE_DISPLAY_NAME = "QAZAQ M3 Anchor v2";
const M3_VOICE_DESIGN_PROMPT =
  "A native Kazakh male television and radio news anchor in his 30s to early 40s. Mature but not old, medium-low natural pitch, clear standard Kazakh pronunciation, steady newsroom delivery, warm natural chest resonance, restrained emotion, crisp consonants, clean Kazakh vowels, moderate pace, gentle sentence endings, no exaggerated bass, no breathy acting, no theatrical character performance.";

let cachedM3VoiceId: string | null = null;

const NAMED_MALE_STUDIO_VOICES = new Set([
  "Achird",
  "Algenib",
  "Algieba",
  "Alnilam",
  "Charon",
  "Enceladus",
  "Fenrir",
  "Iapetus",
  "Orus",
  "Puck",
  "Rasalgethi",
  "Sadachbia",
  "Sadaltager",
  "Schedar",
  "Umbriel",
  "Zubenelgenubi",
]);

const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
]);

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GeminiVoice = {
  id?: string;
  display_name?: string;
  displayName?: string;
  type?: string;
  gender?: string;
  language_code?: string;
};

type GeminiVoiceListPayload = {
  voices?: GeminiVoice[];
};

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeVoiceId(value: unknown) {
  if (typeof value !== "string") return "";
  const voice = value.trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(voice)) return "";
  return voice;
}

async function readErrorDetail(response: Response) {
  const payload = (await response.json().catch(() => null)) as GeminiErrorPayload | null;
  return payload?.error?.message?.trim().slice(0, 420) || "Google 未返回详细原因";
}

async function resolveM3Voice(apiKey: string) {
  if (cachedM3VoiceId) return cachedM3VoiceId;

  const listUrl = new URL(GEMINI_VOICES_ENDPOINT);
  listUrl.searchParams.append("type", "prompted");
  listUrl.searchParams.set("search", M3_VOICE_DISPLAY_NAME);
  listUrl.searchParams.set("page_size", "100");

  const listResponse = await fetch(listUrl.toString(), {
    method: "GET",
    headers: {
      "x-goog-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (listResponse.ok) {
    const payload = (await listResponse.json()) as GeminiVoiceListPayload;
    const existing = (payload.voices ?? []).find((item) => {
      const name = item.display_name?.trim() || item.displayName?.trim() || "";
      return name === M3_VOICE_DISPLAY_NAME && item.id?.startsWith("voice_");
    });
    if (existing?.id) {
      cachedM3VoiceId = existing.id;
      return existing.id;
    }
  }

  const createResponse = await fetch(GEMINI_VOICES_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      store: true,
      voice: {
        model: "gemini-3.8-flash-tts",
        type: "prompted",
        display_name: M3_VOICE_DISPLAY_NAME,
        gender: "male",
        language_code: "kk-KZ",
        context: "News",
        persona: "Professional news anchor",
        pitch: "medium",
        description: "Stable native Kazakh male news anchor for the M3 broadcast mode.",
        prompted: {
          input: M3_VOICE_DESIGN_PROMPT,
        },
      },
    }),
  });

  if (!createResponse.ok) {
    const detail = await readErrorDetail(createResponse);
    throw new Error(
      `M3 固定主播初始化失败（${createResponse.status}）：${detail}。为避免再次出现多人声线，本次不会回退到普通预设声线。`,
    );
  }

  const created = (await createResponse.json()) as GeminiVoice;
  if (!created.id?.startsWith("voice_")) {
    throw new Error("M3 固定主播初始化失败：Google 没有返回持久 voice_ 声纹 ID。");
  }

  cachedM3VoiceId = created.id;
  return created.id;
}


async function resolveSelectedM3Voice(apiKey: string, requestedVoice: string) {
  if (!requestedVoice || requestedVoice === M3_ANCHOR_TOKEN) {
    return {
      id: await resolveM3Voice(apiKey),
      source: "persistent-voice-design",
    };
  }

  if (!NAMED_MALE_STUDIO_VOICES.has(requestedVoice)) {
    throw new Error("所选 Gemini 角色不是官方命名男声，请重新选择。");
  }

  return {
    id: requestedVoice,
    source: "named-male-studio-voice",
  };
}

export async function handleM3Request(request: Request, suppliedApiKey: string, region = "unrestricted-edge", liveStream = false) {
  const apiKey = suppliedApiKey.trim();
  if (!apiKey) {
    return jsonError(
      "Cloudflare 当前没有读取到 GEMINI_API_KEY。请先把 Gemini API Key 保存为 Worker Secret。",
      503,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("请求格式错误。", 400);
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  if (!rawText) return jsonError("请先输入哈萨克语稿件。", 400);
  if (rawText.length > MAX_CHARACTERS) {
    return jsonError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`, 400);
  }

  const requestedModel =
    typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
      ? body.model
      : "gemini-3.8-flash-lite-tts";
  const model = requestedModel;
  if (typeof body.voice === "string" && body.voice.trim() && !sanitizeVoiceId(body.voice)) return jsonError("所选 Gemini 角色格式无效。", 400);
  const requestedVoice = sanitizeVoiceId(body.voice) || M3_ANCHOR_TOKEN;
  const speed =
    typeof body.speed === "number" && Number.isFinite(body.speed)
      ? clamp(body.speed, 0.7, 1.2)
      : 1;
  const textMode: M3TextMode = body.textMode === "verbatim" ? "verbatim" : "clean";
  const diagnosticMode = normalizeM3DiagnosticMode(body.diagnosticMode);

  try {
    // Resolve one supported male voice once. M3 sends the entire manuscript
    // in one audio-generation request; there are no long-form chunks.
    const resolvedVoice = await resolveSelectedM3Voice(apiKey, requestedVoice);
    const voice = resolvedVoice.id;

    if (liveStream) {
      const encoder = new TextEncoder();
      const streamAbort = new AbortController();
      const signal = AbortSignal.any([request.signal, streamAbort.signal]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          let sentBytes = 0, sequence = 0;
          const startedAt = Date.now();
          const send = (event: string, payload: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
            } catch { closed = true; streamAbort.abort(); }
          };
          send("start", { voice, model, version: M3_VERSION, diagnosticMode, singleRequest: true });
          const heartbeat = setInterval(
            () => send("heartbeat", { elapsedMs: Date.now() - startedAt, receivedSeconds: sentBytes / 48000 }),
            12000,
          );
          void generateM3Program({
            apiKey, model, voice, text: rawText, textMode, diagnosticMode, speed, streaming: true, signal,
            skipWavAssembly: true,
            onAudioChunk(chunk) {
              // Bound event size to avoid large base64 strings on Android.
              for (let at = 0; at < chunk.length; at += 192000) {
                const piece = chunk.subarray(at, Math.min(chunk.length, at + 192000));
                const offset = sentBytes;
                sentBytes += piece.length;
                send("audio", { sequence: sequence++, offset, crc32: m3Crc32(piece), data: Buffer.from(piece).toString("base64"), receivedSeconds: sentBytes / 48000 });
              }
            },
          }).then(({ audit, cuts, gains, originalPcmBytes }) => {
            send("done", {
              cuts, gains, originalPcmBytes, timings: audit.timings, voice, model, integrity: audit.integrity,
              audioDiagnostics: audit.signal,
              pitchScreen: audit.pitchScreen, voiceTimeline: audit.voiceTimeline,
            });
          }).catch((error: unknown) => {
            const details = error instanceof M3Error ? error.details : undefined;
            // Carry only bounded, non-secret diagnostics to the browser's
            // locally-downloadable JSON; never include credentials or text.
            send("error", {
              code: error instanceof M3Error ? error.code : "M3_STREAM_ERROR",
              error: error instanceof Error ? error.message : "Gemini 音频流生成失败。",
              version: M3_VERSION, model, voice, textMode, diagnosticMode,
              stage: details?.stage,
              temperature: details?.temperature,
              textSha256: details?.textSha256,
              retryAfterSeconds: details?.retryAfterSeconds,
              quotas: Array.isArray(details?.quotas) ? details.quotas : undefined,
              proposedSilenceRegions: Array.isArray(details?.proposedSilenceRegions) ? details.proposedSilenceRegions.slice(0, 40) : undefined,
              proposedLowVolumeRegions: Array.isArray(details?.proposedLowVolumeRegions) ? details.proposedLowVolumeRegions.slice(0, 40) : undefined,
              diagnostics: details?.audioDiagnostics,
              integrity: details?.integrity,
              voiceTimeline: details?.voiceTimeline,
            });
          }).finally(() => {
            clearInterval(heartbeat);
            if (!closed) { closed = true; controller.close(); }
          });
        },
        cancel() { streamAbort.abort(); },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Content-Type-Options": "nosniff",
          "X-M3-Preview": "live-pcm-one-request",
        },
      });
    }

    const { wav, audit } = await generateM3Program({ apiKey, model, voice, text: rawText, textMode, diagnosticMode, speed, signal: request.signal, streaming: true });
    if (!wav) throw new M3Error("M3_INTERNAL_WAV_MISSING", "M3 完整 WAV 组装失败。", 502);

    return new Response(wav.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="qazaq-m3.wav"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Gemini-TTS-Model": model,
        "X-Gemini-TTS-Voice": voice,
        "X-M3-Single-Speaker": "true",
        "X-M3-Strict-Single-Speaker": "true",
        "X-M3-Language": "auto-detect-kazakh",
        "X-M3-Transcript": "verbatim-with-pause-tags",
        "X-M3-TTS-API": audit.transport === "interactions" ? "interactions-speech_config" : `${audit.transport}-voiceConfig`,
        "X-M3-Voice-Source": resolvedVoice.source,
        "X-M3-Anchor": "strict-constant-v5",
        "X-M3-Version": M3_VERSION,
        "X-M3-Diagnostic-Mode": diagnosticMode,
        "X-M3-Strategy": audit.strategy,
        "X-M3-TTS-Requests": String(audit.ttsRequests),
        "X-M3-Retries": String(audit.retries),
        "X-M3-Content-Verified": "false",
        "X-M3-Raw-SHA256": audit.integrity?.rawSha256 ?? "",
        "X-M3-Processed-SHA256": audit.integrity?.processedSha256 ?? "",
        "X-M3-First-Audio-Ms": String(audit.timings.firstAudioMs ?? ""),
        "X-M3-Upstream-Ms": String(audit.timings.upstreamMs),
        "X-M3-Postprocess-Ms": String(audit.timings.postprocessMs),
        "X-M3-Total-Ms": String(audit.timings.totalMs),
        "X-M3-Input-Tokens": audit.inputTokens === null ? "not-preflighted" : String(audit.inputTokens),
        "X-M3-Acoustic-Screening": audit.parts.every(p => p.features.voicedFrames >= 18) ? "heuristic-passed" : "limited-short-audio",
        "X-M3-Audit": JSON.stringify(audit.parts.map(p => ({ index: p.index, seconds: Math.round(p.seconds * 100) / 100, attempts: p.attempts, score: Math.round(p.score * 100) / 100, f0: Math.round(p.features.f0Median), warnings: p.windowWarnings, gainDb: Math.round(p.gainDb * 100) / 100 }))),
        "X-M3-Backend-Region": region,
        "X-Gemini-TTS-Chunks": String(audit.parts.length),
      },
    });
  } catch (error) {
    if (error instanceof M3Error) {
      console.error("M3_FAILED", JSON.stringify({ code: error.code, status: error.status, region }));
      return Response.json({ error: error.message, code: error.code, backendRegion: region, ...(error.details ? { details: error.details } : {}) }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("M3_FAILED", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof DOMException && error.name === "AbortError") {
      return jsonError("Gemini TTS 生成超时，请重试。", 504);
    }
    return jsonError(
      error instanceof Error ? error.message : "Gemini TTS 生成失败，请稍后重试。",
      502,
    );
  }
}
