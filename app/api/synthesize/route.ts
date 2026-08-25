const TOKEN_ENDPOINT = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SIGNATURE_KEY =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const MAX_CHARACTERS = 6000;
const EDGE_MAX_CHUNK_SIZE = 1800;
const ELEVEN_MAX_CHUNK_SIZE = 4800;
const ELEVEN_MODEL_ID = "eleven_v3";
const ELEVEN_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVEN_MIN_SPEED = 0.7;
const ELEVEN_MAX_SPEED = 1.2;

const ALLOWED_EDGE_VOICES = new Set([
  "kk-KZ-DauletNeural",
  "kk-KZ-AigulNeural",
]);

const PRESETS = {
  news: { rate: "-2%", pitch: "-1%" },
  calm: { rate: "-10%", pitch: "-2%" },
  bulletin: { rate: "+6%", pitch: "+0%" },
} as const;

const CHINESE_AUDIO_TAGS: Record<string, string> = {
  开心: "happy",
  高兴: "happily",
  兴奋: "excited",
  激动: "excited",
  悲伤: "sad",
  难过: "sad",
  伤心: "sorrowful",
  愤怒: "angry",
  生气: "angry",
  担心: "worried",
  紧张: "nervous",
  害怕: "fearful",
  恐惧: "fearful",
  好奇: "curious",
  疲惫: "tired",
  温柔: "softly",
  轻声: "softly",
  小声: "whispers",
  耳语: "whispers",
  大声: "shouts",
  喊叫: "shouts",
  严肃: "serious",
  平静: "calm",
  轻松: "relaxed",
  神秘: "mysteriously",
  哭泣: "crying",
  笑: "laughs",
  大笑: "laughs",
  轻笑: "chuckles",
  叹气: "sighs",
  清嗓: "clears throat",
  慢速: "slowly",
  快速: "quickly",
};

type PresetName = keyof typeof PRESETS;
type EngineName = "edge" | "eleven";

type TranslatorEndpoint = {
  r: string;
  t: string;
};

let tokenCache: {
  endpoint: TranslatorEndpoint;
  expiresAt: number;
} | null = null;

class ElevenLabsError extends Error {
  status: number;

  constructor(status: number) {
    super(`elevenlabs:${status}`);
    this.status = status;
  }
}

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function compactId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function formattedDate() {
  return new Date().toUTCString().replace("GMT", "").trim().concat(" GMT").toLowerCase();
}

function normalizeElevenAudioTags(text: string) {
  return text.replace(/\[([^\]\r\n]{1,30})\]/gu, (full, rawTag: string) => {
    const normalized = rawTag.trim();
    const mapped = CHINESE_AUDIO_TAGS[normalized];
    return mapped ? `[${mapped}]` : full;
  });
}

async function sign(urlString: string) {
  const unsignedUrl = urlString.split("://")[1];
  const encodedUrl = encodeURIComponent(unsignedUrl);
  const requestId = compactId();
  const date = formattedDate();
  const valueToSign = `MSTranslatorAndroidApp${encodedUrl}${date}${requestId}`.toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(SIGNATURE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(valueToSign),
  );
  return `MSTranslatorAndroidApp::${bytesToBase64(new Uint8Array(signature))}::${date}::${requestId}`;
}

function decodeExpiry(token: string) {
  try {
    const part = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return payload.exp ?? Math.floor(Date.now() / 1000) + 540;
  } catch {
    return Math.floor(Date.now() / 1000) + 540;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getEndpoint() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && now < tokenCache.expiresAt - 120) return tokenCache.endpoint;

  const response = await fetchWithTimeout(
    TOKEN_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Accept-Language": "kk-KZ",
        "X-ClientVersion": "4.0.530a 5fe1dc6c",
        "X-UserId": "0f04d16a175c411e",
        "X-HomeGeographicRegion": "kk-KZ",
        "X-ClientTraceId": compactId(),
        "X-MT-Signature": await sign(TOKEN_ENDPOINT),
        "User-Agent": "okhttp/4.5.0",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
    15000,
  );

  if (!response.ok) throw new Error(`token:${response.status}`);
  const endpoint = (await response.json()) as TranslatorEndpoint;
  if (!endpoint.r || !endpoint.t) throw new Error("token:invalid");
  tokenCache = { endpoint, expiresAt: decodeExpiry(endpoint.t) };
  return endpoint;
}

function splitText(text: string, maxChunkSize: number) {
  const normalized = text.replaceAll("\r\n", "\n").replace(/[\t ]+/g, " ").trim();
  if (normalized.length <= maxChunkSize) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > maxChunkSize) {
    const window = rest.slice(0, maxChunkSize + 1);
    const punctuation = Math.max(
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?"),
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("\n"),
    );
    const whitespace = window.lastIndexOf(" ");
    const breakAt = punctuation > maxChunkSize * 0.55
      ? punctuation + 1
      : whitespace > maxChunkSize * 0.55
        ? whitespace
        : maxChunkSize;
    chunks.push(rest.slice(0, breakAt).trim());
    rest = rest.slice(breakAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function buildSsml(text: string, voice: string, preset: PresetName) {
  const { rate, pitch } = PRESETS[preset];
  return [
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
    `<voice name="${voice}">`,
    `<prosody rate="${rate}" pitch="${pitch}" volume="+0%">${escapeXml(text)}</prosody>`,
    "</voice>",
    "</speak>",
  ].join("");
}

async function synthesizeEdgeChunk(
  text: string,
  voice: string,
  preset: PresetName,
  endpoint: TranslatorEndpoint,
) {
  const response = await fetchWithTimeout(
    `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        Authorization: endpoint.t,
        "Content-Type": "application/ssml+xml",
        "User-Agent": "okhttp/4.5.0",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: buildSsml(text, voice, preset),
    },
    30000,
  );

  if (!response.ok) throw new Error(`speech:${response.status}`);
  return response.arrayBuffer();
}

async function synthesizeElevenChunk(
  text: string,
  voiceId: string,
  apiKey: string,
  speed: number,
  previousText?: string,
  nextText?: string,
) {
  const response = await fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVEN_OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL_ID,
        language_code: "kk",
        voice_settings: { speed },
        ...(previousText ? { previous_text: previousText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
      }),
    },
    90000,
  );

  if (!response.ok) throw new ElevenLabsError(response.status);
  return response.arrayBuffer();
}

async function synthesizeWithEdge(text: string, voice: string, preset: PresetName) {
  const endpoint = await getEndpoint();
  const chunks = splitText(text, EDGE_MAX_CHUNK_SIZE);
  return Promise.all(
    chunks.map((chunk) => synthesizeEdgeChunk(chunk, voice, preset, endpoint)),
  );
}

async function synthesizeWithEleven(
  text: string,
  voiceId: string,
  apiKey: string,
  speed: number,
) {
  const directedText = normalizeElevenAudioTags(text);
  const chunks = splitText(directedText, ELEVEN_MAX_CHUNK_SIZE);
  const audioChunks: ArrayBuffer[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const current = chunks[index];
    const previous = index > 0 ? chunks[index - 1] : undefined;
    const next = index < chunks.length - 1 ? chunks[index + 1] : undefined;
    audioChunks.push(
      await synthesizeElevenChunk(current, voiceId, apiKey, speed, previous, next),
    );
  }

  return audioChunks;
}

function audioResponse(chunks: ArrayBuffer[], engine: EngineName) {
  return new Response(new Blob(chunks, { type: "audio/mpeg" }), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": 'inline; filename="qazaq-radio.mp3"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-TTS-Engine": engine === "eleven" ? "eleven_v3" : "edge",
    },
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求内容无效。", 400);
  }

  if (!payload || typeof payload !== "object") return jsonError("请求内容无效。", 400);
  const { text, engine, voice, preset, speed } = payload as Record<string, unknown>;

  if (typeof text !== "string" || !text.trim()) {
    return jsonError("请先输入哈萨克语文本。", 400);
  }
  if (text.length > MAX_CHARACTERS) {
    return jsonError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`, 413);
  }

  const selectedEngine: EngineName = engine === "eleven" ? "eleven" : "edge";
  if (engine !== undefined && engine !== "edge" && engine !== "eleven") {
    return jsonError("请选择有效的语音模式。", 400);
  }
  if (typeof preset !== "string" || !(preset in PRESETS)) {
    return jsonError("请选择有效的播音节奏。", 400);
  }
  if (typeof voice !== "string" || !voice.trim()) {
    return jsonError("请选择有效的哈萨克语播音员。", 400);
  }

  if (selectedEngine === "edge" && !ALLOWED_EDGE_VOICES.has(voice)) {
    return jsonError("请选择有效的免费哈萨克语播音员。", 400);
  }
  if (
    selectedEngine === "eleven" &&
    !/^[A-Za-z0-9_-]{8,128}$/.test(voice)
  ) {
    return jsonError("请选择有效的 ElevenLabs 高质量播音员。", 400);
  }

  const safeText = text.replaceAll("\u0000", "").trim();

  if (selectedEngine === "eleven") {
    const apiKey = process.env.Max?.trim();
    const selectedSpeed =
      typeof speed === "number" && Number.isFinite(speed) ? speed : 1;

    if (selectedSpeed < ELEVEN_MIN_SPEED || selectedSpeed > ELEVEN_MAX_SPEED) {
      return jsonError("ElevenLabs 倍速必须在 0.7× 到 1.2× 之间。", 400);
    }

    if (!apiKey) {
      return jsonError(
        "Cloudflare 当前运行版本没有读取到 Max。请确认 Max 已保存并部署到 Worker。",
        503,
      );
    }

    try {
      const audioChunks = await synthesizeWithEleven(
        safeText,
        voice,
        apiKey,
        selectedSpeed,
      );
      return audioResponse(audioChunks, "eleven");
    } catch (error) {
      console.error("ElevenLabs Kazakh speech synthesis failed", error);
      if (error instanceof ElevenLabsError) {
        if (error.status === 401) {
          return jsonError("Cloudflare 已读取到 Max，但 ElevenLabs 返回 401：这个 Key 无效、已删除、已过期，或复制的不是完整 API Key。", 502);
        }
        if (error.status === 403) {
          return jsonError("Cloudflare 已读取到 Max，但 ElevenLabs 返回 403：Key 权限不足或设置了 IP 限制。", 502);
        }
        if (error.status === 429) {
          return jsonError("ElevenLabs 当前额度不足或请求过于频繁，请稍后再试。", 429);
        }
        if (error.status === 422) {
          return jsonError("ElevenLabs 无法使用当前文本、声线、倍速或情绪标签生成语音，请调整后重试。", 422);
        }
      }
      return jsonError("高质量语音服务暂时繁忙，请稍后重新生成。", 502);
    }
  }

  try {
    const audioChunks = await synthesizeWithEdge(
      safeText,
      voice,
      preset as PresetName,
    );
    return audioResponse(audioChunks, "edge");
  } catch (error) {
    console.error("Edge Kazakh speech synthesis failed", error);
    return jsonError("免费语音服务暂时繁忙，请稍后重新生成。", 502);
  }
}
