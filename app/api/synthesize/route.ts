import { analyzeEdgeDocument, type EdgeDocumentPlan } from "../../lib/edge-director";
import { prepareEdgeHumanText } from "../../lib/edge-humanizer";
import { prepareNativeKazakhEnglishPronunciation } from "../../lib/edge-english-pronunciation";
import { normalizeKazakhSpeechText } from "../../lib/kazakh-speech-normalizer";
import {
  analyzeEdgeEmotionPlan,
  resolveEdgeEmotionSentences,
  type EdgeEmotionPlan,
} from "../../lib/edge-emotion-director";
import { structureEdgeText } from "../../lib/edge-natural-structure";
import { analyzeStoryEmotionTrajectory } from "../../lib/edge-story-emotion-trajectory";
import {
  renderEdgeOmniInspiredMarkup,
  splitEdgeTextByDuration,
} from "../../lib/edge-omnivoice-inspired";

const TOKEN_ENDPOINT = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SIGNATURE_KEY =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const MAX_CHARACTERS = 15000;
const EDGE_MAX_CHUNK_SIZE = 9000;
const ELEVEN_MAX_CHUNK_SIZE = 2200;
const ELEVEN_MODEL_ID = "eleven_v3";
const ELEVEN_OUTPUT_FORMAT = "mp3_44100_128";
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

const ALLOWED_EDGE_VOICES = new Set([
  "kk-KZ-DauletNeural",
  "kk-KZ-AigulNeural",
  "edge-unified-male",
  "edge-unified-female",
]);

const MULTILINGUAL_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {
  "kk-KZ-DauletNeural": "zh-CN-YunyiMultilingualNeural",
  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoMultilingualNeural",
  "edge-unified-male": "zh-CN-YunyiMultilingualNeural",
  "edge-unified-female": "zh-CN-XiaoxiaoMultilingualNeural",
};

const PRESETS = {
  // The first four are variants of one professional presenter register: calm is
  // steadier, bulletin is tighter, expressive has a little more range, but none
  // should drift into theatrical story delivery. Story is intentionally separate.
  news: { rateFactor: 1.01, pitch: 0, volume: 0 },
  calm: { rateFactor: 0.97, pitch: -0.05, volume: -0.08 },
  bulletin: { rateFactor: 1.045, pitch: 0.12, volume: 0.12 },
  expressive: { rateFactor: 1.01, pitch: 0.18, volume: 0.1 },
  story: { rateFactor: 1, pitch: 0.03, volume: -0.02 },
} as const;

// Every Edge style uses the same full-article emotion plan, but each style
// applies a different amount of local direction so they remain audibly distinct.
const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {
  news: 0.62,
  calm: 0.52,
  bulletin: 0.68,
  expressive: 0.82,
  story: 1,
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

type EdgeTextLanguage = "kk" | "zh" | "en";
type EdgeLanguageRun = { language: EdgeTextLanguage; text: string };

function hasHanCharacters(text: string) {
  return /\p{Script=Han}/u.test(text);
}

function edgeLanguageForCharacter(character: string): EdgeTextLanguage | null {
  if (/\p{Script=Han}/u.test(character)) return "zh";
  if (/[A-Za-z]/u.test(character)) return "en";
  if (/\p{Script=Cyrillic}/u.test(character)) return "kk";
  return null;
}

function edgeLanguageCode(language: EdgeTextLanguage) {
  if (language === "zh") return "zh-CN";
  if (language === "en") return "en-US";
  return "kk-KZ";
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

function renderStructuredNativeText(text: string) {
  const paragraphs = structureEdgeText(text);
  if (!paragraphs.length) return escapeXml(text);

  return paragraphs
    .map(
      (paragraph) =>
        `<p>${paragraph.sentences
          .map((sentence) => escapeXml(sentence.text))
          .join(" ")}</p>`,
    )
    .join("");
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

  // Explicit paragraph/sentence structure gives the neural voice the same
  // punctuation hierarchy that OmniVoice preserves during long-form inference.
  // We keep one global prosody envelope so the speaker does not restart its
  // acoustic character at every sentence.
  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${renderStructuredNativeText(text)}</prosody>`;
}

function emotionTempoZone(mood: string) {
  if (mood === "urgent" || mood === "positive" || mood === "transition") return "forward";
  if (mood === "sad" || mood === "concern" || mood === "emphasis" || mood === "ending") return "slow";
  return "steady";
}


const NEWS_ITEM_OPENING_PATTERN =
  /^(?:\s*)(?:(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\s+бірінші|он\s+екінші|он\s+үшінші|он\s+төртінші|он\s+бесінші|келесі|ендігі|тағы\s+бір)\s+жаңалы(?:қ|ғ)[\p{L}-]*|第[一二三四五六七八九十百]+(?:条|项)?新闻|(?:first|second|third|fourth|fifth|next)\s+(?:news|news\s+item))(?![\p{L}\p{N}_])/iu;

function isNewsItemOpening(text: string) {
  return NEWS_ITEM_OPENING_PATTERN.test(text.trim());
}

function newsItemPresenterLift(preset: PresetName) {
  switch (preset) {
    case "calm":
      return { rate: -1.05, pitch: 0.1, volume: 0.06 };
    case "bulletin":
      return { rate: -0.45, pitch: 0.18, volume: 0.08 };
    case "expressive":
      return { rate: -0.7, pitch: 0.24, volume: 0.1 };
    default:
      return { rate: -0.8, pitch: 0.14, volume: 0.07 };
  }
}

function newsItemPresenterClose(preset: PresetName, sentenceModeProtected: boolean) {
  // A professional item ending is mostly phrase-final settling, not silence.
  // Questions/exclamations keep their native sentence contour and receive only
  // a tiny timing release before the next item.
  if (sentenceModeProtected) {
    return { rate: -0.22, pitch: 0, volume: -0.01 };
  }
  switch (preset) {
    case "calm":
      return { rate: -0.78, pitch: -0.16, volume: -0.035 };
    case "bulletin":
      return { rate: -0.38, pitch: -0.09, volume: -0.018 };
    case "expressive":
      return { rate: -0.5, pitch: -0.12, volume: -0.022 };
    default:
      return { rate: -0.58, pitch: -0.12, volume: -0.025 };
  }
}


type StoryBeat =
  | "narrator"
  | "blogger"
  | "description"
  | "dialogue"
  | "suspense"
  | "action"
  | "tender"
  | "sorrow"
  | "wonder"
  | "humor"
  | "ending";

type StoryDirection = {
  beat: StoryBeat;
  ratePercent: number;
  pitchDelta: number;
  volumeDelta: number;
};

const STORY_SUSPENSE_CUES = [
  "кенет", "бір кезде", "сол сәтте", "дәл сол кезде", "қараса", "үнсіз", "сыбыр",
  "қараңғы", "қорқыныш", "аяқ дыбысы", "құпия", "сезді", "тың тыңдап", "демін ішіне",
  "忽然", "突然", "就在这时", "这时", "悄悄", "沉默", "黑暗", "脚步声", "秘密", "神秘",
  "屏住呼吸", "没出声", "静静地",
];
const STORY_ACTION_CUES = [
  "жүгір", "айқай", "ұмтыл", "секір", "қаш", "қуып", "соққы", "тартыс", "күрес",
  "атып шық", "жалма-жан", "тұра ұмтыл", "抓", "冲", "跑", "喊", "跳", "追", "打",
  "扑", "逃", "搏斗", "冲向", "猛地", "飞快",
];
const STORY_TENDER_CUES = [
  "жылы", "мейір", "күлім", "құшақ", "ақырын", "жай ғана", "еркелет", "жұмсақ",
  "аялап", "маңдайынан", "温柔", "微笑", "拥抱", "轻声", "轻轻", "温暖", "柔和", "抚摸",
  "慢慢地", "柔声",
];
const STORY_WONDER_CUES = [
  "таңғ", "ғажап", "керемет", "сенбеді", "күтпеген", "сөйтсе", "расында",
  "惊讶", "惊奇", "奇怪", "没想到", "不可思议", "竟然", "原来", "没想到的是",
];
const STORY_HUMOR_CUES = [
  "күліп", "күлді", "әзіл", "қалжың", "жымиды", "қарқылдап", "哈哈", "笑了", "大笑", "玩笑",
  "滑稽", "调皮", "忍不住笑", "扑哧",
];
const STORY_SORROW_CUES = [
  "жыла", "көз жас", "мұң", "қайғы", "ренжі", "жалғыз", "қимай", "өкініш",
  "哭", "流泪", "眼泪", "伤心", "悲伤", "难过", "孤独", "舍不得", "遗憾",
];
const STORY_FEAR_CUES = [
  "қорық", "үрей", "діріл", "қобалж", "шошып", "зәресі", "сескен",
  "害怕", "恐惧", "发抖", "颤抖", "紧张", "惊恐", "吓", "心跳",
];
const STORY_ANGER_CUES = [
  "ашулан", "ызал", "қаһар", "айғай", "долдан", "怒", "愤怒", "生气", "怒吼", "大怒", "发火",
];
const STORY_BLOGGER_CUES = [
  "сөйтіп", "содан кейін", "міне", "бір күні", "ал енді", "осылайша", "қысқасы",
  "осы жерде", "сөйтсе", "солай", "енді қараңыз", "не керек",
  "于是", "接着", "后来", "这时候", "说到这里", "你看", "没想到", "原来", "结果",
];
function storyContainsCue(value: string, cues: string[]) {
  const normalized = value.toLowerCase();
  return cues.some((cue) => normalized.includes(cue));
}

function isStoryDialogue(value: string) {
  const trimmed = value.trim();
  return (
    /^[—–-]\s*\S/u.test(trimmed) ||
    /[«“][^»”]{1,320}[»”]/u.test(trimmed) ||
    /"[^"\n]{1,320}"/u.test(trimmed)
  );
}

function storyDirectionForSentence(
  text: string,
  mood: string,
  role: string | null,
  speechAct: EdgeEmotionPlan["sentences"][number]["speechAct"] = "narration",
): StoryDirection {
  const dialogue =
    isStoryDialogue(text) ||
    !["narration", "reported"].includes(speechAct);
  const hasQuestion = /[?？]/u.test(text);
  const hasExclamation = /[!！]/u.test(text);
  const hasEllipsis = /…|\.\.\./u.test(text);

  // Story V6: dialogue can be inferred without quotation marks from reporting
  // verbs and speech acts. Manner-of-speaking cues can override generic mood.
  if (role === "ending" || mood === "ending") {
    return { beat: "ending", ratePercent: -3.5, pitchDelta: -0.8, volumeDelta: -0.6 };
  }
  if (speechAct === "lament") {
    return { beat: "sorrow", ratePercent: -6.4, pitchDelta: -1.4, volumeDelta: -1.35 };
  }
  if (speechAct === "whisper") {
    return { beat: "suspense", ratePercent: -5.8, pitchDelta: -1.1, volumeDelta: -1.4 };
  }
  if (speechAct === "shout") {
    return { beat: "action", ratePercent: 5.8, pitchDelta: 1.4, volumeDelta: 1.5 };
  }
  if (speechAct === "command") {
    return { beat: "action", ratePercent: 4.8, pitchDelta: 1.05, volumeDelta: 1.2 };
  }
  if (speechAct === "humor") {
    return { beat: "humor", ratePercent: 3.0, pitchDelta: 1.0, volumeDelta: 0.72 };
  }
  if (
    mood === "sad" ||
    storyContainsCue(text, STORY_SORROW_CUES) ||
    (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))
  ) {
    return { beat: "sorrow", ratePercent: -5.2, pitchDelta: -1.0, volumeDelta: -1.0 };
  }
  if (
    storyContainsCue(text, STORY_SUSPENSE_CUES) ||
    storyContainsCue(text, STORY_FEAR_CUES) ||
    hasEllipsis
  ) {
    return { beat: "suspense", ratePercent: -4.6, pitchDelta: -0.8, volumeDelta: -0.7 };
  }
  if (
    mood === "urgent" ||
    storyContainsCue(text, STORY_ACTION_CUES) ||
    storyContainsCue(text, STORY_ANGER_CUES)
  ) {
    return { beat: "action", ratePercent: 4.4, pitchDelta: 0.9, volumeDelta: 1.0 };
  }
  if (storyContainsCue(text, STORY_TENDER_CUES)) {
    return { beat: "tender", ratePercent: -2.8, pitchDelta: 0.6, volumeDelta: -0.7 };
  }
  if (storyContainsCue(text, STORY_WONDER_CUES)) {
    return { beat: "wonder", ratePercent: -1.5, pitchDelta: 0.8, volumeDelta: 0.2 };
  }
  if (storyContainsCue(text, STORY_HUMOR_CUES)) {
    return { beat: "humor", ratePercent: 1.8, pitchDelta: 0.7, volumeDelta: 0.2 };
  }

  if (dialogue) {
    // Let punctuation do most of the acting. Neutral dialogue receives no
    // synthetic pitch lift; questions/exclamations only get a small assist.
    if (hasQuestion) {
      return { beat: "dialogue", ratePercent: -1.5, pitchDelta: 1.4, volumeDelta: 0.2 };
    }
    if (hasExclamation) {
      return { beat: "dialogue", ratePercent: 3.4, pitchDelta: 1.4, volumeDelta: 1.3 };
    }
    if (mood === "concern" || mood === "sad") {
      return { beat: "dialogue", ratePercent: -3.2, pitchDelta: -1.0, volumeDelta: -1.0 };
    }
    return { beat: "dialogue", ratePercent: 0.6, pitchDelta: 0.22, volumeDelta: 0.12 };
  }

  if (mood === "positive") {
    return { beat: "tender", ratePercent: -0.8, pitchDelta: 0.5, volumeDelta: 0.1 };
  }
  if (mood === "concern") {
    return { beat: "suspense", ratePercent: -2.2, pitchDelta: -0.6, volumeDelta: -0.4 };
  }
  if (mood === "emphasis") {
    return { beat: "wonder", ratePercent: -1.2, pitchDelta: 0.5, volumeDelta: 0.4 };
  }

  // Blog-style storytelling: narration stays recognisably the same speaker,
  // but it carries conversational forward motion instead of a flat audiobook
  // read. Scene-setting is a touch slower; connective/story-turn phrases lean in.
  if (storyContainsCue(text, STORY_BLOGGER_CUES) || role === "transition") {
    return { beat: "blogger", ratePercent: 2.8, pitchDelta: 0.65, volumeDelta: 0.35 };
  }
  if (role === "background" && text.length >= 82) {
    return { beat: "description", ratePercent: -1.8, pitchDelta: -0.35, volumeDelta: -0.15 };
  }
  return { beat: "narrator", ratePercent: 1.6, pitchDelta: 0.35, volumeDelta: 0.16 };
}

function renderStoryTextSegment(value: string, useMultilingual: boolean) {
  if (!value) return "";
  if (!useMultilingual) return escapeXml(value);
  return splitEdgeLanguageRuns(value)
    .map(
      (run) =>
        `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
    )
    .join("");
}

function renderContinuousStoryBody(
  sentences: EdgeEmotionPlan["sentences"],
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
  useMultilingual: boolean,
  documentPlan?: EdgeDocumentPlan,
) {
  // Story V5: one continuous narrator, with sparse local acting only when the
  // story actually changes emotional state. This preserves identity and flow
  // while restoring emotion that V4 flattened too aggressively.
  const paragraphs = new Map<number, typeof sentences>();
  for (const sentence of sentences) {
    const bucket = paragraphs.get(sentence.paragraphIndex) ?? [];
    bucket.push(sentence);
    paragraphs.set(sentence.paragraphIndex, bucket);
  }

  let body = "";

  for (const [, paragraphSentences] of paragraphs) {
    type StoryGroup = {
      beat: StoryBeat;
      items: typeof paragraphSentences;
    };

    const groups: StoryGroup[] = [];
    for (const sentence of paragraphSentences) {
      const direction = storyDirectionForSentence(sentence.text, sentence.mood, sentence.role, sentence.speechAct);
      const previous = groups[groups.length - 1];
      const maxItems =
        ["narrator", "blogger", "description"].includes(direction.beat)
          ? 8
          : direction.beat === "dialogue"
            ? 3
            : 2;
      const previousChars = previous
        ? previous.items.reduce((sum, item) => sum + item.text.length, 0)
        : 0;
      const maxChars =
        ["narrator", "blogger", "description"].includes(direction.beat) ? 760 : 390;
      const previousTurn = previous?.items[0]?.speakerTurn ?? 0;
      const sameRoleTurn =
        (previousTurn === 0 && sentence.speakerTurn === 0) ||
        previousTurn === sentence.speakerTurn;
      const canJoin =
        previous &&
        previous.beat === direction.beat &&
        sameRoleTurn &&
        previous.items.length < maxItems &&
        previousChars + sentence.text.length <= maxChars;

      if (canJoin) previous.items.push(sentence);
      else groups.push({ beat: direction.beat, items: [sentence] });
    }

    let paragraphBody = "";
    for (const group of groups) {
      const totalChars = Math.max(
        1,
        group.items.reduce((sum, sentence) => sum + sentence.text.length, 0),
      );
      const direction = group.items.reduce(
        (acc, sentence) => {
          const local = storyDirectionForSentence(sentence.text, sentence.mood, sentence.role, sentence.speechAct);
          const weight = sentence.text.length / totalChars;
          acc.rate += local.ratePercent * weight;
          acc.pitch += local.pitchDelta * weight;
          acc.volume += local.volumeDelta * weight;
          return acc;
        },
        { rate: 0, pitch: 0, volume: 0 },
      );

      const rawText = group.items.map((sentence) => sentence.text).join(" ");

      // Emotion is visible but bounded. All story text now passes through the
      // same semantic punctuation + Kazakh dependency layer as broadcast text.
      const strength =
        group.beat === "narrator"
          ? 0.55
          : group.beat === "blogger"
            ? 0.78
            : group.beat === "description"
              ? 0.62
              : group.beat === "dialogue"
                ? 0.8
                : group.beat === "ending"
                  ? 0.82
                  : 0.88;
      const rate = clamp(direction.rate * strength, -5.5, 5.3);
      const pitch = clamp(direction.pitch * strength, -1.35, 1.35);
      const volume = clamp(direction.volume * strength, -1.25, 1.25);
      const renderLanguageAwareText = useMultilingual
        ? (value: string) => renderStoryTextSegment(value, true)
        : undefined;
      // V9 word-aware story delivery: analyze every token, then collapse the
      // evidence into at most four smooth emotional spans. We never create a
      // prosody span per word; that would destroy long-form speaker continuity.
      const trajectory = analyzeStoryEmotionTrajectory(rawText);
      const emotionalSpans = trajectory.spans.length
        ? trajectory.spans
        : [{
            text: rawText,
            emotion: "neutral" as const,
            intensity: 0,
            evidenceCount: 0,
            rateFactor: 1,
            pitchDelta: 0,
            volumeDelta: 0,
          }];
      const trajectoryStrength = clamp(
        0.54 + trajectory.volatility * 0.2 + (group.beat === "dialogue" ? 0.12 : 0),
        0.54,
        0.84,
      );
      const content = emotionalSpans
        .map((span) => {
          const evidenceScale = span.evidenceCount > 0 ? trajectoryStrength : 0.28;
          const localSpeed = clamp(
            (1 + rate / 100) * (1 + (span.rateFactor - 1) * evidenceScale),
            0.92,
            1.085,
          );
          const localPitch = clamp(
            pitch + span.pitchDelta * evidenceScale,
            -1.85,
            1.85,
          );
          const localVolume = clamp(
            volume + span.volumeDelta * evidenceScale,
            -1.65,
            1.65,
          );
          return renderEdgeOmniInspiredMarkup(
            span.text,
            {
              speed: localSpeed,
              pitch: localPitch,
              volume: localVolume,
              deliveryMode: "story",
            },
            documentPlan,
            renderLanguageAwareText,
          );
        })
        .join("");

      paragraphBody += `${content} `;
    }

    body += `<p>${paragraphBody.trim()}</p>`;
  }

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}

function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  documentPlan: EdgeDocumentPlan | undefined,
  useMultilingual: boolean,
) {
  const presetSettings = PRESETS[preset];
  const emotionStrength = EMOTION_STRENGTH_BY_PRESET[preset];
  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";
  const antiCreakRate = useMultilingual ? 1 : isDauletProfile ? 1.002 : 1;
  const antiCreakPitch = useMultilingual ? 0 : isDauletProfile ? 1.8 : 0;
  const baseSpeed = clamp(
    settings.speed * presetSettings.rateFactor * antiCreakRate,
    0.58,
    1.35,
  );
  const basePitch = clamp(
    settings.pitch + presetSettings.pitch + antiCreakPitch,
    -18,
    18,
  );
  const baseVolume = clamp(
    settings.volume + presetSettings.volume,
    -7,
    7,
  );

  const sentences = resolveEdgeEmotionSentences(text, emotionPlan);
  if (!sentences.length) {
    const fallback = useMultilingual
      ? splitEdgeLanguageRuns(text)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : renderStructuredNativeText(text);
    return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${fallback}</prosody>`;
  }

  if (preset === "story") {
    return renderContinuousStoryBody(
      sentences,
      baseSpeed,
      basePitch,
      baseVolume,
      useMultilingual,
      documentPlan,
    );
  }

  type DeliveryGroup = {
    paragraphIndex: number;
    zone: string;
    newsItemOpening: boolean;
    sentences: typeof sentences;
  };

  const groups: DeliveryGroup[] = [];
  for (const sentence of sentences) {
    const storyDirection =
      preset === "story"
        ? storyDirectionForSentence(sentence.text, sentence.mood, sentence.role, sentence.speechAct)
        : null;
    const newsItemOpening = preset !== "story" && isNewsItemOpening(sentence.text);
    const baseZone = newsItemOpening
      ? `news-item:${preset}`
      : storyDirection
        ? `story:${storyDirection.beat}`
        : emotionTempoZone(sentence.mood);
    const zone = sentence.speakerTurn > 0 ? `${baseZone}:turn:${sentence.speakerTurn}` : baseZone;
    const previous = groups[groups.length - 1];
    const previousChars = previous
      ? previous.sentences.reduce((sum, item) => sum + item.text.length, 0)
      : 0;
    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 6
          : storyDirection?.beat === "dialogue"
            ? 1
            : 2
        : preset === "calm"
          ? 6
          : preset === "news"
            ? 5
            : 4;
    const storyCharLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 520
          : 260
        : preset === "calm"
          ? 650
          : preset === "news"
            ? 540
            : preset === "bulletin"
              ? 430
              : 420;
    const canJoin =
      previous &&
      previous.paragraphIndex === sentence.paragraphIndex &&
      previous.zone === zone &&
      previous.sentences.length < storyGroupLimit &&
      previousChars + sentence.text.length <= storyCharLimit;

    if (canJoin) previous.sentences.push(sentence);
    else groups.push({
      paragraphIndex: sentence.paragraphIndex,
      zone,
      newsItemOpening,
      sentences: [sentence],
    });
  }

  let body = "";
  let openParagraph: number | null = null;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const nextGroup = groups[groupIndex + 1];
    const newsItemClosing = Boolean(nextGroup?.newsItemOpening);
    const sameParagraphHandoff = Boolean(
      newsItemClosing && nextGroup?.paragraphIndex === group.paragraphIndex,
    );
    if (openParagraph !== group.paragraphIndex) {
      if (openParagraph !== null) body += "</p>";
      body += "<p>";
      openParagraph = group.paragraphIndex;
    }

    const totalChars = Math.max(1, group.sentences.reduce((sum, item) => sum + item.text.length, 0));
    const weighted = group.sentences.reduce(
      (acc, sentence) => {
        const weight = sentence.text.length / totalChars;
        const storyDirection =
          preset === "story"
            ? storyDirectionForSentence(sentence.text, sentence.mood, sentence.role, sentence.speechAct)
            : null;
        if (preset === "story") {
          acc.rate += (storyDirection?.ratePercent ?? 0) * weight;
          acc.pitch += (storyDirection?.pitchDelta ?? 0) * weight;
          acc.volume += (storyDirection?.volumeDelta ?? 0) * weight;
        } else {
          acc.rate += (sentence.rateFactor - 1) * 100 * weight;
          acc.pitch += sentence.pitchDelta * weight;
          acc.volume += sentence.volumeDelta * weight;
        }
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );
    weighted.rate *= emotionStrength;
    weighted.pitch *= emotionStrength;
    weighted.volume *= emotionStrength;

    if (group.newsItemOpening) {
      const presenter = newsItemPresenterLift(preset);
      weighted.rate += presenter.rate;
      weighted.pitch += presenter.pitch;
      weighted.volume += presenter.volume;
    }

    if (newsItemClosing) {
      const terminalText = group.sentences[group.sentences.length - 1]?.text.trim() ?? "";
      const sentenceModeProtected = /[?？!！](?:[»”"'’」』）\])}]*)?$/u.test(terminalText);
      const close = newsItemPresenterClose(preset, sentenceModeProtected);
      weighted.rate += close.rate;
      weighted.pitch += close.pitch;
      weighted.volume += close.volume;
    }

    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");
    const content = useMultilingual
      ? splitEdgeLanguageRuns(rawText)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : escapeXml(rawText);

    const hasLocalDirection =
      Math.abs(weighted.rate) >= 0.35 ||
      Math.abs(weighted.pitch) >= 0.02 ||
      Math.abs(weighted.volume) >= 0.02;

    if (documentPlan) {
      const renderLanguageAwareText = useMultilingual
        ? (value: string) =>
            splitEdgeLanguageRuns(value)
              .map(
                (run) =>
                  `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
              )
              .join("")
        : undefined;
      body += `${renderEdgeOmniInspiredMarkup(
        rawText,
        {
          speed: clamp(1 + weighted.rate / 100, 0.94, 1.06),
          pitch: weighted.pitch,
          volume: weighted.volume,
          deliveryMode: "broadcast",
        },
        documentPlan,
        renderLanguageAwareText,
      )} `;
    } else if (hasLocalDirection) {
      body += `<prosody rate="${signedPercent(weighted.rate)}" pitch="${signedPercent(weighted.pitch)}" volume="${signedPercent(weighted.volume)}">${content}</prosody> `;
    } else {
      body += `${content} `;
    }

    // When two item labels occur inside one source paragraph there is no layout
    // boundary for the neural voice to use. Add one short presenter hand-off.
    // Separate paragraphs already carry their own semantic paragraph boundary,
    // so we deliberately avoid stacking another fixed pause there.
    if (sameParagraphHandoff) body += '<break time="78ms"/>';
  }

  if (openParagraph !== null) body += "</p>";

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}

function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  documentPlan?: EdgeDocumentPlan,
  useMultilingual = false,
  emotionPlan: EdgeEmotionPlan | null = null,
) {
  if (!useMultilingual) {
    const body = emotionPlan
      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, false)
      : edgeNativeProsody(text, settings, voice, preset);
    return [
      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
      `<voice name="${voice}">`,
      body,
      "</voice>",
      "</speak>",
    ].join("");
  }

  const runs = splitEdgeLanguageRuns(text);
  const multilingualVoice =
    MULTILINGUAL_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyiMultilingualNeural";
  const presetSettings = PRESETS[preset];
  const isDauletProfile = voice === "kk-KZ-DauletNeural";
  const antiCreakRate = 1;
  const antiCreakPitch = 0;
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
  const body = emotionPlan
    ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, true)
    : runs
        .map((run) =>
          `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
        )
        .join("");

  return [
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',
    `<voice name="${multilingualVoice}">`,
    ...(emotionPlan
      ? [body]
      : [
          `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">`,
          body,
          "</prosody>",
        ]),
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
  emotionPlan: EdgeEmotionPlan | null,
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
      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual, emotionPlan),
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
  const isUnifiedProfile =
    voice === "edge-unified-male" || voice === "edge-unified-female";
  const articleHasHan = hasHanCharacters(text);
  const pronunciationPreparedText =
    isUnifiedProfile || articleHasHan
      ? text
      : prepareNativeKazakhEnglishPronunciation(text);

  // Build a hidden spoken form first (English acronym pronunciation for native
  // voices, then numbers/years/percentages/dates), followed by typography
  // cleanup. The user's visible article is never changed.
  const spokenText = normalizeKazakhSpeechText(pronunciationPreparedText);
  const preparedText = prepareEdgeHumanText(spokenText);
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
    300,
    420,
  );
  // Native profiles keep the original Daulet/Aigul acoustic voice for pure
  // Kazakh. Unified profiles always use one multilingual voice. If a native
  // profile receives Chinese, switch that whole request to the matching
  // multilingual voice so the Chinese can be pronounced correctly.
  const useMultilingual = isUnifiedProfile || articleHasHan;
  const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);
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
          emotionPlan,
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
            emotionPlan,
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
