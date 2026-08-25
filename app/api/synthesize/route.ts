const TOKEN_ENDPOINT = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SIGNATURE_KEY =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const MAX_CHARACTERS = 6000;
const EDGE_MAX_CHUNK_SIZE = 1600;
const ELEVEN_MAX_CHUNK_SIZE = 2200;
const ELEVEN_MODEL_ID = "eleven_v3";
const ELEVEN_OUTPUT_FORMAT = "mp3_44100_128";
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

const ALLOWED_EDGE_VOICES = new Set([
  "kk-KZ-DauletNeural",
  "kk-KZ-AigulNeural",
]);

const PRESETS = {
  news: { rateFactor: 1, pitch: -1, volume: 1 },
  calm: { rateFactor: 0.92, pitch: -2, volume: -1 },
  bulletin: { rateFactor: 1.08, pitch: 0, volume: 2 },
  expressive: { rateFactor: 1.02, pitch: 3, volume: 2 },
} as const;

const CHINESE_AUDIO_TAGS: Record<string, string> = {
  开心: "happy",
  高兴: "happily",
  快乐: "happy",
  兴奋: "excited",
  激动: "excited",
  热情: "enthusiastically",
  悲伤: "sad",
  难过: "sad",
  伤心: "sorrowful",
  哭泣: "crying",
  愤怒: "angry",
  生气: "angry",
  担心: "worried",
  忧虑: "worried",
  紧张: "nervous",
  害怕: "fearful",
  恐惧: "fearful",
  惊讶: "surprised",
  好奇: "curious",
  疲惫: "tired",
  自信: "confidently",
  严肃: "serious",
  平静: "calm",
  冷静: "calm",
  轻松: "relaxed",
  温柔: "softly",
  温暖: "warmly",
  轻声: "softly",
  小声: "whispers",
  耳语: "whispers",
  大声: "shouts",
  喊叫: "shouts",
  神秘: "mysteriously",
  调皮: "mischievously",
  讽刺: "sarcastically",
  笑: "laughs",
  大笑: "laughs",
  轻笑: "chuckles",
  叹气: "sighs",
  清嗓: "clears throat",
  慢速: "slowly",
  快速: "quickly",
};

const EDGE_TAG_STYLES: Record<
  string,
  { rateFactor: number; pitch: number; volume: number }
> = {
  开心: { rateFactor: 1.06, pitch: 8, volume: 1 },
  高兴: { rateFactor: 1.06, pitch: 8, volume: 1 },
  快乐: { rateFactor: 1.06, pitch: 8, volume: 1 },
  兴奋: { rateFactor: 1.12, pitch: 12, volume: 2 },
  激动: { rateFactor: 1.12, pitch: 10, volume: 3 },
  热情: { rateFactor: 1.08, pitch: 7, volume: 2 },
  悲伤: { rateFactor: 0.86, pitch: -8, volume: -2 },
  难过: { rateFactor: 0.88, pitch: -7, volume: -2 },
  伤心: { rateFactor: 0.84, pitch: -9, volume: -3 },
  哭泣: { rateFactor: 0.8, pitch: -10, volume: -4 },
  愤怒: { rateFactor: 1.04, pitch: 2, volume: 5 },
  生气: { rateFactor: 1.03, pitch: 2, volume: 4 },
  担心: { rateFactor: 0.93, pitch: 3, volume: -1 },
  忧虑: { rateFactor: 0.9, pitch: 1, volume: -1 },
  紧张: { rateFactor: 1.08, pitch: 5, volume: 0 },
  害怕: { rateFactor: 1.08, pitch: 7, volume: 0 },
  恐惧: { rateFactor: 1.1, pitch: 8, volume: -1 },
  惊讶: { rateFactor: 1.05, pitch: 11, volume: 2 },
  好奇: { rateFactor: 0.96, pitch: 5, volume: 0 },
  疲惫: { rateFactor: 0.82, pitch: -6, volume: -3 },
  自信: { rateFactor: 0.98, pitch: -1, volume: 3 },
  严肃: { rateFactor: 0.93, pitch: -4, volume: 2 },
  平静: { rateFactor: 0.9, pitch: -2, volume: -1 },
  冷静: { rateFactor: 0.92, pitch: -3, volume: 0 },
  轻松: { rateFactor: 0.94, pitch: 2, volume: -1 },
  温柔: { rateFactor: 0.88, pitch: 3, volume: -3 },
  温暖: { rateFactor: 0.92, pitch: 2, volume: -1 },
  轻声: { rateFactor: 0.86, pitch: 1, volume: -5 },
  小声: { rateFactor: 0.82, pitch: -2, volume: -7 },
  耳语: { rateFactor: 0.8, pitch: -3, volume: -8 },
  大声: { rateFactor: 1.02, pitch: 2, volume: 7 },
  喊叫: { rateFactor: 1.08, pitch: 5, volume: 8 },
  神秘: { rateFactor: 0.84, pitch: -4, volume: -4 },
  调皮: { rateFactor: 1.05, pitch: 8, volume: 0 },
  讽刺: { rateFactor: 0.95, pitch: 4, volume: 0 },
  笑: { rateFactor: 1.06, pitch: 8, volume: 0 },
  轻笑: { rateFactor: 1.05, pitch: 9, volume: -1 },
  大笑: { rateFactor: 1.12, pitch: 13, volume: 3 },
  叹气: { rateFactor: 0.78, pitch: -7, volume: -4 },
  清嗓: { rateFactor: 0.82, pitch: -2, volume: 1 },
  慢速: { rateFactor: 0.78, pitch: 0, volume: 0 },
  快速: { rateFactor: 1.18, pitch: 0, volume: 0 },
};

type PresetName = keyof typeof PRESETS;
type EngineName = "edge" | "eleven";

type TranslatorEndpoint = {
  r: string;
  t: string;
};

type ElevenVoiceSettings = {
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
};

type EdgeVoiceSettings = {
  speed: number;
  pitch: number;
  volume: number;
};

let tokenCache: {
  endpoint: TranslatorEndpoint;
  expiresAt: number;
} | null = null;

class ElevenLabsError extends Error {
  status: number;
  code: string;
  detail: string;
  chunkIndex: number;

  constructor(status: number, code: string, detail: string, chunkIndex: number) {
    super(`elevenlabs:${status}:${code || "unknown"}`);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.chunkIndex = chunkIndex;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function signedPercent(value: number) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function speedToRate(speed: number) {
  return signedPercent((speed - 1) * 100);
}

function applyTagToPreviousSentence(source: string, mappedTag: string) {
  let contentEnd = source.length;
  while (contentEnd > 0 && /\s/u.test(source[contentEnd - 1])) contentEnd -= 1;

  if (!source.slice(0, contentEnd).trim()) {
    return `${source}[${mappedTag}] `;
  }

  let searchFrom = contentEnd - 1;
  if (/[.!?。！？]/u.test(source[searchFrom] ?? "")) searchFrom -= 1;

  let sentenceStart = 0;
  for (let index = searchFrom; index >= 0; index -= 1) {
    if (/[.!?。！？\n]/u.test(source[index])) {
      sentenceStart = index + 1;
      break;
    }
  }

  const beforeSentence = source.slice(0, sentenceStart);
  const sentenceWithSpacing = source.slice(sentenceStart, contentEnd);
  const trailingWhitespace = source.slice(contentEnd);
  const leadingWhitespace = sentenceWithSpacing.match(/^\s*/u)?.[0] ?? "";
  const sentence = sentenceWithSpacing.slice(leadingWhitespace.length);

  return `${beforeSentence}${leadingWhitespace}[${mappedTag}] ${sentence}${trailingWhitespace}`;
}

function applyEdgeTagToPreviousSentence(source: string, tag: string) {
  let contentEnd = source.length;
  while (contentEnd > 0 && /\s/u.test(source[contentEnd - 1])) contentEnd -= 1;

  if (!source.slice(0, contentEnd).trim()) return source;

  let searchFrom = contentEnd - 1;
  if (/[.!?。！？]/u.test(source[searchFrom] ?? "")) searchFrom -= 1;

  let sentenceStart = 0;
  for (let index = searchFrom; index >= 0; index -= 1) {
    if (/[.!?。！？\n]/u.test(source[index])) {
      sentenceStart = index + 1;
      break;
    }
  }

  const beforeSentence = source.slice(0, sentenceStart);
  const sentenceWithSpacing = source.slice(sentenceStart, contentEnd);
  const trailingWhitespace = source.slice(contentEnd);
  const leadingWhitespace = sentenceWithSpacing.match(/^\s*/u)?.[0] ?? "";
  const sentence = sentenceWithSpacing.slice(leadingWhitespace.length);

  if (!sentence.trim()) return source;
  return `${beforeSentence}${leadingWhitespace}[[EDGE:${tag}]]${sentence}[[/EDGE]]${trailingWhitespace}`;
}

function normalizeElevenAudioTags(text: string) {
  const matcher = /[\[【]([^\]】\r\n]{1,30})[\]】]/gu;
  let output = "";
  let cursor = 0;

  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    output += text.slice(cursor, index);

    const rawTag = (match[1] ?? "").trim();
    const mapped = CHINESE_AUDIO_TAGS[rawTag];

    if (mapped) {
      output = applyTagToPreviousSentence(output, mapped);
    } else {
      output += match[0];
    }

    cursor = index + match[0].length;
  }

  output += text.slice(cursor);
  return output;
}

function normalizeEdgeAudioTags(text: string) {
  const matcher = /[\[【]([^\]】\r\n]{1,30})[\]】]/gu;
  let output = "";
  let cursor = 0;

  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    output += text.slice(cursor, index);
    const rawTag = (match[1] ?? "").trim();

    if (EDGE_TAG_STYLES[rawTag]) {
      output = applyEdgeTagToPreviousSentence(output, rawTag);
    } else {
      output += match[0];
    }

    cursor = index + match[0].length;
  }

  output += text.slice(cursor);
  return output;
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

function splitEdgeText(text: string, maxChunkSize: number) {
  const normalized = text.replaceAll("\r\n", "\n").replace(/[\t ]+/g, " ").trim();
  if (normalized.length <= maxChunkSize) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;

  while (rest.length > maxChunkSize) {
    const window = rest.slice(0, maxChunkSize + 90);
    const searchWindow = window.slice(0, maxChunkSize + 1);
    const punctuation = Math.max(
      searchWindow.lastIndexOf("."),
      searchWindow.lastIndexOf("!"),
      searchWindow.lastIndexOf("?"),
      searchWindow.lastIndexOf("。"),
      searchWindow.lastIndexOf("！"),
      searchWindow.lastIndexOf("？"),
      searchWindow.lastIndexOf("\n"),
    );
    const whitespace = searchWindow.lastIndexOf(" ");
    let breakAt = punctuation > maxChunkSize * 0.55
      ? punctuation + 1
      : whitespace > maxChunkSize * 0.55
        ? whitespace
        : maxChunkSize;

    if (punctuation > maxChunkSize * 0.55) {
      const after = window.slice(breakAt);
      const tagMatch = after.match(/^\s*[\[【][^\]】\r\n]{1,30}[\]】]/u);
      if (tagMatch) breakAt += tagMatch[0].length;
    }

    chunks.push(rest.slice(0, breakAt).trim());
    rest = rest.slice(breakAt).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function edgeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  preset: PresetName,
  tag?: string,
) {
  const presetSettings = PRESETS[preset];
  const tagSettings = tag ? EDGE_TAG_STYLES[tag] : undefined;
  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * (tagSettings?.rateFactor ?? 1),
    0.5,
    1.5,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + (tagSettings?.pitch ?? 0),
    -35,
    35,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume + (tagSettings?.volume ?? 0),
    -12,
    12,
  );

  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;
}

function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
) {
  const directed = normalizeEdgeAudioTags(text);
  const matcher = /\[\[EDGE:([^\]]+)\]\]([\s\S]*?)\[\[\/EDGE\]\]/gu;
  let body = "";
  let cursor = 0;

  for (const match of directed.matchAll(matcher)) {
    const index = match.index ?? 0;
    const before = directed.slice(cursor, index);
    if (before) body += edgeProsody(before, settings, preset);

    const tag = (match[1] ?? "").trim();
    const sentence = match[2] ?? "";
    body += edgeProsody(sentence, settings, preset, tag);
    cursor = index + match[0].length;
  }

  const tail = directed.slice(cursor);
  if (tail) body += edgeProsody(tail, settings, preset);

  return [
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
    `<voice name="${voice}">`,
    body,
    "</voice>",
    "</speak>",
  ].join("");
}

async function synthesizeEdgeChunk(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
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
      body: buildEdgeSsml(text, voice, preset, settings),
    },
    30000,
  );

  if (!response.ok) throw new Error(`speech:${response.status}`);
  return response.arrayBuffer();
}

function parseElevenLabsErrorText(raw: string) {
  let code = "";
  let detail = raw.trim();

  try {
    const payload = JSON.parse(raw) as {
      detail?: unknown;
      status?: unknown;
      message?: unknown;
      code?: unknown;
    };

    let nested: unknown = payload.detail ?? payload;
    if (typeof nested === "string") {
      try {
        nested = JSON.parse(nested);
      } catch {
        detail = nested;
      }
    }

    if (nested && typeof nested === "object") {
      const object = nested as Record<string, unknown>;
      const statusValue = object.status ?? object.code ?? payload.status ?? payload.code;
      const messageValue = object.message ?? object.detail ?? payload.message;
      if (typeof statusValue === "string") code = statusValue;
      if (typeof messageValue === "string") detail = messageValue;
    } else {
      const statusValue = payload.status ?? payload.code;
      const messageValue = payload.message;
      if (typeof statusValue === "string") code = statusValue;
      if (typeof messageValue === "string") detail = messageValue;
    }
  } catch {
    // Keep the raw text if ElevenLabs ever returns a non-JSON error body.
  }

  return {
    code: code.slice(0, 80),
    detail: detail.replace(/\s+/gu, " ").slice(0, 320),
  };
}

async function synthesizeElevenChunk(
  text: string,
  voiceId: string,
  apiKey: string,
  settings: ElevenVoiceSettings,
  chunkIndex: number,
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
        voice_settings: {
          speed: settings.speed,
          stability: settings.stability,
          similarity_boost: settings.similarityBoost,
          style: settings.style,
          use_speaker_boost: settings.speakerBoost,
        },
      }),
    },
    90000,
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const parsed = parseElevenLabsErrorText(raw);
    throw new ElevenLabsError(response.status, parsed.code, parsed.detail, chunkIndex);
  }

  return response.arrayBuffer();
}

async function synthesizeWithEdge(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
) {
  const endpoint = await getEndpoint();
  const chunks = splitEdgeText(text, EDGE_MAX_CHUNK_SIZE);
  return Promise.all(
    chunks.map((chunk) => synthesizeEdgeChunk(chunk, voice, preset, settings, endpoint)),
  );
}

async function synthesizeWithEleven(
  text: string,
  voiceId: string,
  apiKey: string,
  settings: ElevenVoiceSettings,
) {
  const directedText = normalizeElevenAudioTags(text);
  const chunks = splitText(directedText, ELEVEN_MAX_CHUNK_SIZE);
  const audioChunks: ArrayBuffer[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    audioChunks.push(
      await synthesizeElevenChunk(
        chunks[index],
        voiceId,
        apiKey,
        settings,
        index + 1,
      ),
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

function readUnitInterval(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function containsAny(value: string, needles: string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function elevenErrorMessage(error: ElevenLabsError) {
  const context = `${error.code} ${error.detail}`.trim();
  const chunk = `第 ${error.chunkIndex} 段`;

  if (
    containsAny(context, [
      "quota_exceeded",
      "quota",
      "credits",
      "credit limit",
      "character limit",
      "exceeds your quota",
    ])
  ) {
    return `ElevenLabs 额度不足或本次长文本超过可用额度（${chunk}）。短文本能生成说明 Key 是有效的；请减少文本长度、等待额度刷新或增加 ElevenLabs 额度。`;
  }

  if (containsAny(context, ["missing_permissions", "permission", "text_to_speech"])) {
    return `ElevenLabs API Key 缺少文本转语音权限（${chunk}）。请给 Max 对应的 Key 开启“文本转语音 → 访问”。`;
  }

  if (containsAny(context, ["invalid_api_key", "invalid api key"])) {
    return `Cloudflare 已读取到 Max，但 ElevenLabs 认为 API Key 无效（${chunk}）。请确认 Max 中保存的是完整的新 Key。`;
  }

  if (
    containsAny(context, [
      "max_character_limit_exceeded",
      "text_too_long",
      "too long",
      "maximum allowed length",
    ])
  ) {
    return `ElevenLabs 认为单段文本仍然过长（${chunk}）。网站已经自动分段，请再试一次；如果仍出现此提示，我会继续把分段长度调小。`;
  }

  if (error.status === 429) {
    return `ElevenLabs 请求过于频繁或并发受限（${chunk}），请稍后几秒再生成。`;
  }

  const detail = error.detail ? `：${error.detail}` : "";
  return `ElevenLabs 返回 ${error.status}${error.code ? ` / ${error.code}` : ""}（${chunk}）${detail}`;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求内容无效。", 400);
  }

  if (!payload || typeof payload !== "object") return jsonError("请求内容无效。", 400);
  const {
    text,
    engine,
    voice,
    preset,
    speed,
    stability,
    similarityBoost,
    style,
    speakerBoost,
    edgePitch,
    edgeVolume,
  } = payload as Record<string, unknown>;

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
  const selectedSpeed =
    typeof speed === "number" && Number.isFinite(speed) ? speed : 1;

  if (selectedSpeed < MIN_SPEED || selectedSpeed > MAX_SPEED) {
    return jsonError("倍速必须在 0.7× 到 1.2× 之间。", 400);
  }

  if (selectedEngine === "eleven") {
    const apiKey = process.env.Max?.trim();
    const selectedStability = readUnitInterval(stability, 0.5);
    const selectedSimilarity = readUnitInterval(similarityBoost, 0.75);
    const selectedStyle = readUnitInterval(style, 0);
    const selectedSpeakerBoost =
      typeof speakerBoost === "boolean" ? speakerBoost : true;

    if (
      selectedStability < 0 ||
      selectedStability > 1 ||
      selectedSimilarity < 0 ||
      selectedSimilarity > 1 ||
      selectedStyle < 0 ||
      selectedStyle > 1
    ) {
      return jsonError("ElevenLabs 音色参数必须在 0 到 1 之间。", 400);
    }

    if (!apiKey) {
      return jsonError(
        "Cloudflare 当前运行版本没有读取到 Max。请确认 Max 已保存并部署到 Worker。",
        503,
      );
    }

    const settings: ElevenVoiceSettings = {
      speed: selectedSpeed,
      stability: selectedStability,
      similarityBoost: selectedSimilarity,
      style: selectedStyle,
      speakerBoost: selectedSpeakerBoost,
    };

    try {
      const audioChunks = await synthesizeWithEleven(
        safeText,
        voice,
        apiKey,
        settings,
      );
      return audioResponse(audioChunks, "eleven");
    } catch (error) {
      console.error("ElevenLabs Kazakh speech synthesis failed", error);
      if (error instanceof ElevenLabsError) {
        const status = error.status === 429 ? 429 : error.status === 422 ? 422 : 502;
        return jsonError(elevenErrorMessage(error), status);
      }
      return jsonError("高质量语音服务暂时繁忙，请稍后重新生成。", 502);
    }
  }

  const selectedPitch =
    typeof edgePitch === "number" && Number.isFinite(edgePitch) ? edgePitch : 0;
  const selectedVolume =
    typeof edgeVolume === "number" && Number.isFinite(edgeVolume) ? edgeVolume : 0;

  if (selectedPitch < -20 || selectedPitch > 20) {
    return jsonError("Edge TTS 音调必须在 -20% 到 +20% 之间。", 400);
  }
  if (selectedVolume < -8 || selectedVolume > 8) {
    return jsonError("Edge TTS 音量必须在 -8% 到 +8% 之间。", 400);
  }

  const edgeSettings: EdgeVoiceSettings = {
    speed: selectedSpeed,
    pitch: selectedPitch,
    volume: selectedVolume,
  };

  try {
    const audioChunks = await synthesizeWithEdge(
      safeText,
      voice,
      preset as PresetName,
      edgeSettings,
    );
    return audioResponse(audioChunks, "edge");
  } catch (error) {
    console.error("Edge Kazakh speech synthesis failed", error);
    return jsonError("免费语音服务暂时繁忙，请稍后重新生成。", 502);
  }
}
