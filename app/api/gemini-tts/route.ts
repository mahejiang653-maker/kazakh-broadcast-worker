const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_CHARACTERS = 15000;
const MAX_CHUNK_CHARACTERS = 4800;
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const M3_FIXED_VOICE = "Gacrux";
const M3_SINGLE_SPEAKER_PROFILE =
  "M3 is one single male Kazakh news anchor for the entire program. Use exactly one speaker from the opening through item one, item two, all the way through item thirteen and the closing. Never introduce, imitate, alternate with, or imply a second speaker. Keep the same male identity, age impression, timbre, vocal weight, pitch center, speaking distance, room character, loudness and broadcast manner across every chunk. Treat every chunk as a continuation of the same uninterrupted studio session.";

const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
]);

const PRESET_STYLE: Record<string, string> = {
  news:
    "Professional native Kazakh news announcer. Mature, steady, natural and authoritative without sounding theatrical. Clear consonants and Kazakh vowels, stable vocal weight, gentle sentence endings, natural breath groups, and consistent volume.",
  calm:
    "Native Kazakh long-form news narration. Calm, mature, warm and even. Slightly slower phrasing, restrained emotion, stable pitch, clean articulation, soft natural sentence endings, and consistent timbre across long passages.",
  bulletin:
    "Native Kazakh concise news bulletin. Clear, focused and slightly brisk while remaining natural. Strong intelligibility for numbers and names, compact pauses, stable pitch, and professional broadcast delivery.",
  expressive:
    "Native Kazakh broadcast narration with natural human prosody and moderate expression. Keep a mature professional news tone, add subtle emphasis only where semantically useful, and avoid exaggerated acting.",
  story:
    "Native Kazakh documentary-style narration. Warm, natural and continuous, with gentle expressive phrasing, realistic breath groups, stable timbre, and relaxed sentence endings.",
};

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

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function prepareGeminiText(input: string) {
  let output = input
    .replaceAll("[短停顿]", "<short pause>")
    .replaceAll("[长停顿]", "<long pause>")
    .replaceAll("[叹气]", "<sigh>")
    .replaceAll("[轻笑]", "<laugh>")
    .replaceAll("[清嗓]", "<cough>");

  for (const opener of NUMBERED_OPENERS) {
    const pattern = new RegExp(
      `(^|\\n)(\\s*${opener.replaceAll(" ", "\\s+")}\\s*[.。])\\s*(?!<short pause>)`,
      "giu",
    );
    output = output.replace(pattern, "$1$2 <short pause> ");
  }

  return output.trim();
}

function splitLongText(text: string, maxCharacters = MAX_CHUNK_CHARACTERS) {
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

function speedInstruction(speed: number) {
  if (speed <= 0.82) return "Speak clearly at a noticeably slower pace while preserving natural rhythm.";
  if (speed <= 0.94) return "Speak slightly slower than normal broadcast pace.";
  if (speed < 1.06) return "Use a natural professional broadcast pace.";
  if (speed < 1.14) return "Speak slightly faster than normal while keeping every word clear.";
  return "Use a brisk broadcast pace while preserving intelligibility and natural phrasing.";
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

async function synthesizeChunk(
  apiKey: string,
  model: string,
  voice: string,
  text: string,
  style: string,
  chunkIndex: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

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
      const payload = (await response.json().catch(() => null)) as GeminiErrorPayload | null;
      const detail = payload?.error?.message?.trim().slice(0, 360) || "Google 未返回详细原因";
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
  // M3 is intentionally server-locked to one fixed male anchor.
  // Ignore any client-supplied voice so the whole program cannot switch speakers.
  const voice = M3_FIXED_VOICE;
  const preset = typeof body.preset === "string" ? body.preset : "news";
  const speed =
    typeof body.speed === "number" && Number.isFinite(body.speed)
      ? clamp(body.speed, 0.7, 1.2)
      : 1;

  const prepared = prepareGeminiText(rawText);
  const chunks = splitLongText(prepared);
  const style = `${M3_SINGLE_SPEAKER_PROFILE} ${PRESET_STYLE[preset] ?? PRESET_STYLE.news} ${speedInstruction(speed)} Read the supplied Kazakh text faithfully; do not summarize, translate, add commentary, omit content, or turn quoted material into a second voice.`;

  try {
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
        "Content-Disposition": 'inline; filename="qazaq-gemini.wav"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Gemini-TTS-Model": model,
        "X-Gemini-TTS-Voice": voice,
        "X-M3-Single-Speaker": "true",
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
