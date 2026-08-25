import { analyzeEdgeDocument, type EdgeDocumentPlan } from "../../lib/edge-director";
import { prepareEdgeHumanText } from "../../lib/edge-humanizer";
import {
  renderEdgeOmniInspiredMarkup,
  splitEdgeTextByDuration,
} from "../../lib/edge-omnivoice-inspired";

const TOKEN_ENDPOINT = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SIGNATURE_KEY =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const MAX_CHARACTERS = 6000;
const EDGE_MAX_CHUNK_SIZE = 4800;
const ELEVEN_MAX_CHUNK_SIZE = 2200;
const ELEVEN_MODEL_ID = "eleven_v3";
const ELEVEN_OUTPUT_FORMAT = "mp3_44100_128";
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

const ALLOWED_EDGE_VOICES = new Set([
  "kk-KZ-DauletNeural",
  "kk-KZ-AigulNeural",
]);

const MULTILINGUAL_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {
  "kk-KZ-DauletNeural": "zh-CN-YunyiMultilingualNeural",
  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoMultilingualNeural",
};

const PRESETS = {
  // All four styles are native-first. They differ only by a very small global bias.
  news: { rateFactor: 1, pitch: 0, volume: 0 },
  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },
  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },
  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },
} as const;


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

type EdgeTextLanguage = "kk" | "zh";
type EdgeLanguageRun = { language: EdgeTextLanguage; text: string };

function hasHanCharacters(text: string) {
  return /\p{Script=Han}/u.test(text);
}

function edgeLanguageForCharacter(character: string): EdgeTextLanguage | null {
  if (/\p{Script=Han}/u.test(character)) return "zh";
  if (/\p{Script=Cyrillic}/u.test(character)) return "kk";
  return null;
}

function splitEdgeLanguageRuns(text: string): EdgeLanguageRun[] {
  const runs: EdgeLanguageRun[] = [];
  let language: EdgeTextLanguage = "kk";
  let buffer = "";

  for (const character of text) {
    const detected = edgeLanguageForCharacter(character);
    if (detected && detected !== language) {
      if (buffer) runs.push({ language, text: buffer });
      language = detected;
      buffer = character;
    } else {
      buffer += character;
    }
  }

  if (buffer) runs.push({ language, text: buffer });
  return runs.length ? runs : [{ language: "kk", text }];
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

function edgeSoftBreakLongPhrase(text: string) {
  const words = text.split(/(\s+)/u);
  let lengthSinceBreak = 0;
  let output = "";

  for (const part of words) {
    if (!part) continue;
    output += escapeXml(part);
    lengthSinceBreak += part.length;

    // A very small breath only when a clause has run on for a long time without punctuation.
    if (/\s+/u.test(part) && lengthSinceBreak >= 88) {
      output += '<break time="45ms"/>';
      lengthSinceBreak = 0;
    }
  }

  return output;
}

type EdgeMicroProsody = {
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
};

function edgePhraseProsody(
  text: string,
  speed: number,
  pitch: number,
  volume: number,
  micro: EdgeMicroProsody,
) {
  const phraseSpeed = clamp(speed * micro.rateFactor, 0.58, 1.35);
  const phrasePitch = clamp(pitch + micro.pitchDelta, -20, 20);
  const phraseVolume = clamp(volume + micro.volumeDelta, -8, 8);

  return `<prosody rate="${speedToRate(phraseSpeed)}" pitch="${signedPercent(phrasePitch)}" volume="${signedPercent(phraseVolume)}">${edgeSoftBreakLongPhrase(text)}</prosody>`;
}

function edgePauseForPunctuation(punctuation: string, phraseLength: number) {
  const lengthBonus = Math.min(45, Math.max(0, Math.round((phraseLength - 24) * 0.55)));

  if (/^\n{2,}$/u.test(punctuation)) return 360;
  if (/^\n$/u.test(punctuation)) return 255;
  if (/^[，,]+$/u.test(punctuation)) return 72 + Math.min(32, lengthBonus);
  if (/^[；;]+$/u.test(punctuation)) return 125 + Math.min(30, lengthBonus);
  if (/^[：:]+$/u.test(punctuation)) return 105 + Math.min(25, lengthBonus);
  if (/^[—–]+$/u.test(punctuation)) return 120 + Math.min(28, lengthBonus);
  if (/^…+$/u.test(punctuation)) return 235 + Math.min(35, lengthBonus);
  if (/^[！!]+$/u.test(punctuation)) return 205 + Math.min(35, lengthBonus);
  if (/^[？?]+$/u.test(punctuation)) return 225 + Math.min(35, lengthBonus);
  if (/^[。.]+$/u.test(punctuation)) return 220 + Math.min(40, lengthBonus);
  return 0;
}

function edgeMicroForPhrase(
  punctuation: string,
  phraseLength: number,
  paragraphStart: boolean,
  afterColon: boolean,
): EdgeMicroProsody {
  let rateFactor = 1;
  let pitchDelta = 0;
  let volumeDelta = 0;

  // Long clauses need a little more room; very short clauses can stay conversational.
  if (phraseLength >= 95) rateFactor *= 0.975;
  else if (phraseLength >= 62) rateFactor *= 0.988;
  else if (phraseLength > 0 && phraseLength <= 18) rateFactor *= 1.008;

  // Paragraph openings are slightly steadier, like taking a breath before a new thought.
  if (paragraphStart) {
    rateFactor *= 0.988;
    volumeDelta += 0.2;
  }

  // The phrase immediately after a colon often carries the key information.
  if (afterColon) {
    rateFactor *= 0.988;
    volumeDelta += 0.55;
    pitchDelta += 0.2;
  }

  // Sentence-final cadence: tiny changes only, so it never sounds like a pitch effect.
  if (/^[。.]+$/u.test(punctuation)) {
    rateFactor *= 0.985;
    pitchDelta -= 0.9;
  } else if (/^[？?]+$/u.test(punctuation)) {
    rateFactor *= 0.985;
    pitchDelta += 1.15;
  } else if (/^[！!]+$/u.test(punctuation)) {
    rateFactor *= 0.995;
    pitchDelta += 0.65;
    volumeDelta += 0.45;
  } else if (/^…+$/u.test(punctuation)) {
    rateFactor *= 0.975;
    pitchDelta -= 0.45;
  } else if (/^[；;]+$/u.test(punctuation)) {
    rateFactor *= 0.992;
    pitchDelta -= 0.25;
  }

  return { rateFactor, pitchDelta, volumeDelta };
}

function edgeNaturalMarkup(
  text: string,
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
) {
  const normalized = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t ]+/gu, " ");

  // Keep ordinary hyphens inside Kazakh compound words; only real dashes create a pause.
  const pieces = normalized.split(/(\n{2,}|\n|[，,；;：:—–]+|[。.]+|[！!]+|[？?]+|…+)/u);
  let output = "";
  let paragraphStart = true;
  let afterColon = false;

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) continue;

    const isPunctuation = /^(?:\n+|[，,；;：:—–]+|[。.]+|[！!]+|[？?]+|…+)$/u.test(piece);
    if (isPunctuation) {
      const pause = edgePauseForPunctuation(piece, 0);
      if (!/^\n+$/u.test(piece)) output += escapeXml(piece);
      if (pause) output += `<break time="${pause}ms"/>`;
      paragraphStart = /^\n{2,}$/u.test(piece) || paragraphStart;
      afterColon = /^[：:]+$/u.test(piece);
      continue;
    }

    const next = pieces[index + 1] ?? "";
    const punctuation = /^(?:\n+|[，,；;：:—–]+|[。.]+|[！!]+|[？?]+|…+)$/u.test(next)
      ? next
      : "";
    const cleanLength = piece.trim().length;
    if (!cleanLength) {
      output += escapeXml(piece);
      continue;
    }

    const micro = edgeMicroForPhrase(punctuation, cleanLength, paragraphStart, afterColon);
    output += edgePhraseProsody(piece, baseSpeed, basePitch, baseVolume, micro);

    // Replace the generic punctuation pause with a length-aware pause on the following token.
    if (punctuation) {
      const pause = edgePauseForPunctuation(punctuation, cleanLength);
      if (!/^\n+$/u.test(punctuation)) output += escapeXml(punctuation);
      if (pause) output += `<break time="${pause}ms"/>`;
      index += 1;
      paragraphStart = /^\n{2,}$/u.test(punctuation);
      afterColon = /^[：:]+$/u.test(punctuation);
    } else {
      paragraphStart = false;
      afterColon = false;
    }
  }

  return output;
}

function edgeNativeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  voice: string,
  preset: PresetName,
) {
  const presetSettings = PRESETS[preset];
  const isDaulet = voice === "kk-KZ-DauletNeural";
  const antiCreakRate = isDaulet ? 1.002 : 1;
  const antiCreakPitch = isDaulet ? 1.8 : 0;

  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * antiCreakRate,
    0.58,
    1.35,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + antiCreakPitch,
    -18,
    18,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume,
    -7,
    7,
  );

  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;
}

function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  _documentPlan?: EdgeDocumentPlan,
  useMultilingual = false,
) {
  if (!useMultilingual) {
    return [
      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
      `<voice name="${voice}">`,
      edgeNativeProsody(text, settings, voice, preset),
      "</voice>",
      "</speak>",
    ].join("");
  }

  const runs = splitEdgeLanguageRuns(text);
  const multilingualVoice =
    MULTILINGUAL_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyiMultilingualNeural";
  const presetSettings = PRESETS[preset];
  const isDauletProfile = voice === "kk-KZ-DauletNeural";
  const antiCreakRate = isDauletProfile ? 1.002 : 1;
  const antiCreakPitch = isDauletProfile ? 1.8 : 0;
  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * antiCreakRate,
    0.58,
    1.35,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + antiCreakPitch,
    -18,
    18,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume,
    -7,
    7,
  );
  const body = runs
    .map((run) =>
      `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,
    )
    .join("");

  return [
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
    `<voice name="${multilingualVoice}">`,
    `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">`,
    body,
    "</prosody>",
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
  documentPlan: EdgeDocumentPlan,
  useMultilingual: boolean,
) {
  const response = await fetchWithTimeout(
    `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        Authorization: endpoint.t,
        "Content-Type": "application/ssml+xml",
        "User-Agent": "okhttp/4.5.0",
        "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
      },
      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual),
    },
    120000,
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
        ...(hasHanCharacters(text) ? {} : { language_code: "kk" }),
        apply_text_normalization: "auto",
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
  const preparedText = prepareEdgeHumanText(text);
  if (!preparedText) return [];

  // Preserve one coherent article context for as long as the service allows.
  // Unlike the older 1600-character path, a typical news article now needs
  // only one request (or two for very long copy), which greatly reduces the
  // audible prosody reset at MP3 boundaries.
  const documentPlan = analyzeEdgeDocument(preparedText);
  const effectiveSpeed = settings.speed * PRESETS[preset].rateFactor;
  const chunks = splitEdgeTextByDuration(
    preparedText,
    effectiveSpeed,
    EDGE_MAX_CHUNK_SIZE,
    210,
    480,
  );
  const useMultilingual = hasHanCharacters(preparedText);
  const audioChunks: ArrayBuffer[] = [];

  for (const chunk of chunks) {
    try {
      audioChunks.push(
        await synthesizeEdgeChunk(
          chunk,
          voice,
          preset,
          settings,
          endpoint,
          documentPlan,
          useMultilingual,
        ),
      );
      continue;
    } catch (error) {
      // Be aggressive about context, conservative about reliability: if this
      // internal Edge endpoint ever rejects a long request, retry it at a much
      // smaller sentence-aware size instead of failing the user's whole稿件.
      if (chunk.length < 2300) throw error;
      const fallbackChunks = splitEdgeTextByDuration(
        chunk,
        effectiveSpeed,
        2100,
        78,
        145,
      );
      if (fallbackChunks.length <= 1) throw error;
      for (const fallback of fallbackChunks) {
        audioChunks.push(
          await synthesizeEdgeChunk(
            fallback,
            voice,
            preset,
            settings,
            endpoint,
            documentPlan,
            useMultilingual,
          ),
        );
      }
    }
  }

  return audioChunks;
}

async function synthesizeWithEleven(
  text: string,
  voiceId: string,
  apiKey: string,
  settings: ElevenVoiceSettings,
) {
  const chunks = splitText(text, ELEVEN_MAX_CHUNK_SIZE);
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
