const TOKEN_ENDPOINT = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SIGNATURE_KEY =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const MAX_CHARACTERS = 6000;
const MAX_CHUNK_SIZE = 1800;

const ALLOWED_VOICES = new Set([
  "kk-KZ-DauletNeural",
  "kk-KZ-AigulNeural",
]);

const PRESETS = {
  news: { rate: "-2%", pitch: "-1%" },
  calm: { rate: "-10%", pitch: "-2%" },
  bulletin: { rate: "+6%", pitch: "+0%" },
} as const;

type PresetName = keyof typeof PRESETS;

type TranslatorEndpoint = {
  r: string;
  t: string;
};

let tokenCache: {
  endpoint: TranslatorEndpoint;
  expiresAt: number;
} | null = null;

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

function splitText(text: string) {
  const normalized = text.replaceAll("\r\n", "\n").replace(/[\t ]+/g, " ").trim();
  if (normalized.length <= MAX_CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > MAX_CHUNK_SIZE) {
    const window = rest.slice(0, MAX_CHUNK_SIZE + 1);
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
    const breakAt = punctuation > MAX_CHUNK_SIZE * 0.55
      ? punctuation + 1
      : whitespace > MAX_CHUNK_SIZE * 0.55
        ? whitespace
        : MAX_CHUNK_SIZE;
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

async function synthesizeChunk(
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

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求内容无效。", 400);
  }

  if (!payload || typeof payload !== "object") return jsonError("请求内容无效。", 400);
  const { text, voice, preset } = payload as Record<string, unknown>;

  if (typeof text !== "string" || !text.trim()) {
    return jsonError("请先输入哈萨克语文本。", 400);
  }
  if (text.length > MAX_CHARACTERS) {
    return jsonError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`, 413);
  }
  if (typeof voice !== "string" || !ALLOWED_VOICES.has(voice)) {
    return jsonError("请选择有效的哈萨克语播音员。", 400);
  }
  if (typeof preset !== "string" || !(preset in PRESETS)) {
    return jsonError("请选择有效的播音节奏。", 400);
  }

  const safeText = text.replaceAll("\u0000", "").trim();

  try {
    const endpoint = await getEndpoint();
    const chunks = splitText(safeText);
    const audioChunks = await Promise.all(
      chunks.map((chunk) => synthesizeChunk(chunk, voice, preset as PresetName, endpoint)),
    );
    return new Response(new Blob(audioChunks, { type: "audio/mpeg" }), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="qazaq-radio.mp3"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Kazakh speech synthesis failed", error);
    return jsonError("免费语音服务暂时繁忙，请稍后重新生成。", 502);
  }
}
