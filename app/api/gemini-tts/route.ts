const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_VOICES_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/voices";
const MAX_CHARACTERS = 15000;
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

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

// Strict M3 keeps per-turn style empty or minimal to reduce voice drift.

const NUMBERED_OPENERS = [
  "Бірінші",
  "Екінші",
  "Үшінші",
  "Төртінші",
  "Бесінші",
  "Алтыншы",
  "Жетінші",
  "Сегізінші",
  "Тоғызыншы",
  "Оныншы",
  "Он бірінші",
  "Он екінші",
  "Он үшінші",
];

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GeminiInteractionPayload = {
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      data?: string;
      mime_type?: string;
    }>;
  }>;
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

function prepareGeminiText(input: string) {
  let output = input
    .replaceAll("[短停顿]", "... ")
    .replaceAll("[长停顿]", "... ... ")
    .replaceAll("[叹气]", " ")
    .replaceAll("[轻笑]", " ")
    .replaceAll("[清嗓]", " ")
    .replaceAll("|", " ")
    .replaceAll("｜", " ")
    .replaceAll("«", "")
    .replaceAll("»", "")
    .replaceAll("“", "")
    .replaceAll("”", "")
    .replaceAll("„", "")
    .replaceAll("‟", "")
    .replaceAll('"', "");

  for (const opener of NUMBERED_OPENERS) {
    const pattern = new RegExp(
      `(^|\\n)(\\s*${opener.replaceAll(" ", "\\s+")})\\s*[.。]\\s*`,
      "giu",
    );
    output = output.replace(pattern, "$1$2... ");
  }

  return output.trim();
}

function maxChunkCharactersForSpeed(speed: number) {
  if (speed <= 0.82) return 2400;
  if (speed <= 0.94) return 2800;
  return 3200;
}

function splitLongText(text: string, maxCharacters: number) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 1);
    const candidates = [
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf("。"),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
    ];
    const best = Math.max(...candidates);
    const cut = best >= Math.floor(maxCharacters * 0.55) ? best + 1 : maxCharacters;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function strictSpeedStyle(speed: number) {
  if (speed < 0.94) return "speaking slowly";
  if (speed > 1.06) return "speaking slightly faster";
  return "";
}

function extractAudioBase64(payload: GeminiInteractionPayload) {
  let data = "";
  for (const step of payload.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === "audio" && typeof item.data === "string" && item.data.length) {
        data = item.data;
      }
    }
  }
  return data;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function pcmToWav(pcm: Uint8Array) {
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + pcm.byteLength);
  const view = new DataView(buffer);
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, headerSize).set(pcm);
  return buffer;
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

async function synthesizeChunk(
  apiKey: string,
  model: string,
  voice: string,
  text: string,
  style: string,
  chunkIndex: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110000);

  try {
    const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [
                  {
                    type: "speech_metadata",
                    style,
                  },
                ],
              },
            ],
          },
        ],
        response_format: {
          type: "audio",
          mime_type: "audio/l16",
          sample_rate: SAMPLE_RATE,
        },
        generation_config: {
          speech_config: [{ voice }],
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Gemini API Key 无效、未授权或当前项目没有 TTS 权限：${detail}`);
      }
      if (response.status === 429) {
        throw new Error("Gemini TTS 当前达到配额或速率限制，请稍后重试。");
      }
      throw new Error(`Gemini TTS 第 ${chunkIndex + 1} 段生成失败（${response.status}）：${detail}`);
    }

    const payload = (await response.json()) as GeminiInteractionPayload;
    const audio = extractAudioBase64(payload);
    if (!audio) throw new Error(`Gemini TTS 第 ${chunkIndex + 1} 段没有返回音频。`);
    return base64ToBytes(audio);
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
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

  const model =
    typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
      ? body.model
      : "gemini-3.8-flash-tts";
  const requestedVoice = sanitizeVoiceId(body.voice) || M3_ANCHOR_TOKEN;
  const preset = typeof body.preset === "string" ? body.preset : "news";
  const speed =
    typeof body.speed === "number" && Number.isFinite(body.speed)
      ? clamp(body.speed, 0.7, 1.2)
      : 1;

  try {
    // The user may select any male voice returned by Google's Voices API.
    // The selected voice is validated server-side and then held constant for
    // the entire article and every long-form chunk.
    const resolvedVoice = await resolveSelectedM3Voice(apiKey, requestedVoice);
    const voice = resolvedVoice.id;
    const prepared = prepareGeminiText(rawText);
    const chunks = splitLongText(prepared, maxChunkCharactersForSpeed(speed));
    const style = `${PRESET_STYLE[preset] ?? PRESET_STYLE.news} ${speedInstruction(speed)}`;

    const pcmParts: Uint8Array[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      pcmParts.push(
        await synthesizeChunk(apiKey, model, voice, chunks[index], style, index),
      );
    }

    const pcm = concatBytes(pcmParts);
    if (!pcm.byteLength) return jsonError("Gemini TTS 没有返回有效音频。", 502);

    return new Response(pcmToWav(pcm), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="qazaq-m3.wav"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Gemini-TTS-Model": model,
        "X-Gemini-TTS-Voice": voice,
        "X-M3-Single-Speaker": "true",
        "X-M3-Voice-Source": resolvedVoice.source,
        "X-M3-Anchor": "fixed-male",
        "X-Gemini-TTS-Chunks": String(chunks.length),
      },
    });
  } catch (error) {
    console.error("Gemini TTS generation failed", error);
    if (error instanceof DOMException && error.name === "AbortError") {
      return jsonError("Gemini TTS 生成超时，请重试。", 504);
    }
    return jsonError(
      error instanceof Error ? error.message : "Gemini TTS 生成失败，请稍后重试。",
      502,
    );
  }
}
