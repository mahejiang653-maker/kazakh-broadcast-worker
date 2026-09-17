from pathlib import Path

edge_path = Path('app/lib/edge-omnivoice-inspired.ts')
route_path = Path('app/api/synthesize/route.ts')
probe_path = Path('app/lib/edge-readaloud-boundary.ts')

edge = edge_path.read_text()
route = route_path.read_text()

probe = r'''const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const READALOUD_BASE = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const EDGE_VERSION = "143.0.3650.75";
const EDGE_MAJOR = EDGE_VERSION.split(".", 1)[0];
const SEC_MS_GEC_VERSION = `1-${EDGE_VERSION}`;

export type EdgeReadAloudBoundary = {
  type: "SentenceBoundary" | "WordBoundary";
  text: string;
  offset: number;
  duration: number;
};

function randomHex(bytes = 16) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function requestId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function edgeTimestamp(date = new Date()) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

async function secMsGec(skewSeconds = 0) {
  const unixSeconds = Math.floor(Date.now() / 1000 + skewSeconds);
  const windowsSeconds = unixSeconds + 11644473600;
  const rounded = windowsSeconds - (windowsSeconds % 300);
  const ticks = BigInt(rounded) * 10000000n;
  const payload = new TextEncoder().encode(`${ticks}${TRUSTED_CLIENT_TOKEN}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function framedPath(message: string) {
  const split = message.indexOf("\r\n\r\n");
  const head = split >= 0 ? message.slice(0, split) : message;
  const body = split >= 0 ? message.slice(split + 4) : "";
  const path = head
    .split("\r\n")
    .map((line) => line.split(":", 2))
    .find(([key]) => key?.toLowerCase() === "path")?.[1]?.trim();
  return { path: path ?? "", body };
}

function parseMetadata(body: string) {
  const boundaries: EdgeReadAloudBoundary[] = [];
  try {
    const payload = JSON.parse(body) as {
      Metadata?: Array<{
        Type?: string;
        Data?: {
          Offset?: number;
          Duration?: number;
          text?: { Text?: string };
        };
      }>;
    };
    for (const item of payload.Metadata ?? []) {
      if (item.Type !== "SentenceBoundary" && item.Type !== "WordBoundary") continue;
      const text = item.Data?.text?.Text;
      if (!text) continue;
      boundaries.push({
        type: item.Type,
        text,
        offset: Number(item.Data?.Offset ?? 0),
        duration: Number(item.Data?.Duration ?? 0),
      });
    }
  } catch {
    // Boundary probing is best-effort. The primary REST synthesis must never fail
    // because the optional Read Aloud metadata channel changed its framing.
  }
  return boundaries;
}

async function openReadAloudSocket(skewSeconds = 0) {
  const token = await secMsGec(skewSeconds);
  const url = `https://${READALOUD_BASE}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${requestId()}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`;
  const response = await fetch(url.replace(/^https:/u, "https:"), {
    headers: {
      Upgrade: "websocket",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Cookie: `muid=${randomHex()};`,
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_MAJOR}.0.0.0 Safari/537.36 Edg/${EDGE_MAJOR}.0.0.0`,
    },
  }) as Response & { webSocket?: WebSocket & { accept(): void } };

  if (response.webSocket) return response.webSocket;
  const serverDate = response.headers.get("date");
  if (!serverDate || skewSeconds !== 0) return null;
  const parsed = Date.parse(serverDate);
  if (!Number.isFinite(parsed)) return null;
  const correctedSkew = (parsed - Date.now()) / 1000;
  return openReadAloudSocket(correctedSkew);
}

export async function probeEdgeBoundaries(
  text: string,
  voice: string,
  boundary: "SentenceBoundary" | "WordBoundary" = "SentenceBoundary",
  timeoutMs = 6500,
) {
  const clean = text.trim().slice(0, 3000);
  if (!clean) return [] as EdgeReadAloudBoundary[];

  try {
    const socket = await openReadAloudSocket();
    if (!socket) return [];
    const boundaries: EdgeReadAloudBoundary[] = [];
    const wordBoundary = boundary === "WordBoundary";

    return await new Promise<EdgeReadAloudBoundary[]>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { socket.close(1000, "done"); } catch {}
        resolve(boundaries);
      };
      const timer = setTimeout(finish, timeoutMs);

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const framed = framedPath(event.data);
        if (framed.path === "audio.metadata") {
          boundaries.push(...parseMetadata(framed.body));
        } else if (framed.path === "turn.end") {
          finish();
        }
      });
      socket.addEventListener("close", finish);
      socket.addEventListener("error", finish);
      socket.accept();

      const stamp = edgeTimestamp();
      socket.send(
        `X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: String(!wordBoundary),
                  wordBoundaryEnabled: String(wordBoundary),
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        }) + "\r\n",
      );

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='kk-KZ'><voice name='${xmlEscape(voice)}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${xmlEscape(clean)}</prosody></voice></speak>`;
      socket.send(
        `X-RequestId:${requestId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    });
  } catch {
    return [];
  }
}
'''
probe_path.write_text(probe)

# ---- Strengthen V37 inertia + breathing budget ----
old = '''function continuityCarryWeight(boundary: EdgeChunkBoundaryKind | PunctuationKind | undefined) {
  if (boundary === "paragraph") return 0.06;
  if (boundary === "line" || boundary === "newline") return 0.1;
  if (["sentence", "period", "question", "exclamation", "mixed", "ellipsis"].includes(boundary ?? "")) {
    return 0.16;
  }
  if (boundary === "hard" || boundary === "whitespace" || boundary === "none") return 0.31;
  if (["comma", "semicolon", "colon", "dash"].includes(boundary ?? "")) return 0.27;
  return 0.22;
}'''
new = '''function continuityCarryWeight(boundary: EdgeChunkBoundaryKind | PunctuationKind | undefined) {
  if (boundary === "paragraph") return 0.05;
  if (boundary === "line" || boundary === "newline") return 0.08;
  if (["sentence", "period", "question", "exclamation", "mixed", "ellipsis"].includes(boundary ?? "")) {
    return 0.21;
  }
  // V38: technical seams need the strongest carry because Edge starts a fresh
  // acoustic request there. Real discourse boundaries remain much more independent.
  if (boundary === "hard" || boundary === "whitespace" || boundary === "none") return 0.38;
  if (["comma", "semicolon", "colon", "dash"].includes(boundary ?? "")) return 0.29;
  return 0.25;
}'''
assert old in edge, 'continuityCarryWeight anchor missing'
edge = edge.replace(old, new, 1)

old = '''    rateFactor: clamp(desiredRate, local.rateFactor - 0.0065, local.rateFactor + 0.0065),
    pitchDelta: clamp(desiredPitch, local.pitchDelta - 0.024, local.pitchDelta + 0.024),
    volumeDelta: clamp(desiredVolume, local.volumeDelta - 0.028, local.volumeDelta + 0.028),'''
new = '''    rateFactor: clamp(desiredRate, local.rateFactor - 0.008, local.rateFactor + 0.008),
    pitchDelta: clamp(desiredPitch, local.pitchDelta - 0.03, local.pitchDelta + 0.03),
    volumeDelta: clamp(desiredVolume, local.volumeDelta - 0.034, local.volumeDelta + 0.034),'''
assert old in edge, 'inertia limiter anchor missing'
edge = edge.replace(old, new, 1)

old = '''    let weight = continuityCarryWeight(settings.continuityBoundaryAfter) * 0.42;'''
new = '''    let weight = continuityCarryWeight(settings.continuityBoundaryAfter) * 0.55;'''
assert old in edge, 'after carry anchor missing'
edge = edge.replace(old, new, 1)

old = '''  const targetBreathSeconds = clamp(
    (deliveryMode === "story" ? 4.35 : 3.85) - lexicalPressure * 0.38,
    deliveryMode === "story" ? 3.75 : 3.35,
    deliveryMode === "story" ? 4.45 : 3.95,
  );'''
new = '''  const targetBreathSeconds = clamp(
    (deliveryMode === "story" ? 4.05 : 3.55) - lexicalPressure * 0.42,
    deliveryMode === "story" ? 3.5 : 3.08,
    deliveryMode === "story" ? 4.2 : 3.72,
  );'''
assert old in edge, 'breath target anchor missing'
edge = edge.replace(old, new, 1)

old = '''  const maxBreaths = Math.round(clamp(Math.max(timedBreaths, wordBreaths), 0, 7));'''
new = '''  const maxBreaths = Math.round(clamp(Math.max(timedBreaths, wordBreaths), 0, 8));'''
assert old in edge, 'max breaths anchor missing'
edge = edge.replace(old, new, 1)

old = '''    const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
    if (spokenLoad < 3.6 && wordCount < 12 && clean.length < 80) return renderNaturalText(text);'''
new = '''    const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
    if (spokenLoad < 3.2 && wordCount < 10 && clean.length < 72) return renderNaturalText(text);'''
assert old in edge, 'story spoken gate anchor missing'
edge = edge.replace(old, new, 1)

old = '''  const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
  if (spokenLoad < 3.3 && wordCount < 11 && clean.length < 72) return renderNaturalText(text);'''
new = '''  const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
  if (spokenLoad < 2.95 && wordCount < 9 && clean.length < 64) return renderNaturalText(text);'''
assert old in edge, 'broadcast spoken gate anchor missing'
edge = edge.replace(old, new, 1)

edge_path.write_text(edge)

# ---- Route: boundary probe + Edge-recognized seam retargeting ----
old = '''import {
  planEdgeTextChunks,
  renderEdgeOmniInspiredMarkup,
  type EdgeChunkBoundaryKind,
} from "../../lib/edge-omnivoice-inspired";'''
new = '''import {
  estimateEdgeSpeechSeconds,
  planEdgeTextChunks,
  renderEdgeOmniInspiredMarkup,
  type EdgeChunkBoundaryKind,
  type EdgeChunkPlan,
} from "../../lib/edge-omnivoice-inspired";
import { probeEdgeBoundaries } from "../../lib/edge-readaloud-boundary";'''
assert old in route, 'route import anchor missing'
route = route.replace(old, new, 1)

anchor = '''async function synthesizeWithEdge(
  text: string,'''
assert anchor in route, 'synthesizeWithEdge anchor missing'
helpers = r'''function edgeSentenceContextBefore(source: string, index: number, maxChars = 420) {
  const raw = source.slice(Math.max(0, index - maxChars), index);
  const matches = Array.from(raw.matchAll(/[.!?。！？…]+["'”’»›》」』】）)\]]*\s*/gu));
  const previousTerminal = matches.length >= 2
    ? (matches[matches.length - 2].index ?? 0) + matches[matches.length - 2][0].length
    : 0;
  return raw.slice(previousTerminal).trim();
}

function edgeSentenceContextAfter(source: string, index: number, maxChars = 360) {
  const raw = source.slice(index, Math.min(source.length, index + maxChars));
  const match = raw.match(/[.!?。！？…]+["'”’»›》」』】）)\]]*/u);
  return (match ? raw.slice(0, (match.index ?? 0) + match[0].length) : raw).trim();
}

function refreshEdgePlanContext(source: string, plans: EdgeChunkPlan[], speed: number) {
  return plans.map((plan) => ({
    ...plan,
    text: source.slice(plan.start, plan.end),
    estimatedSeconds: estimateEdgeSpeechSeconds(source.slice(plan.start, plan.end), speed),
    contextBefore: plan.start > 0 ? edgeSentenceContextBefore(source, plan.start) : "",
    contextAfter: plan.end < source.length ? edgeSentenceContextAfter(source, plan.end) : "",
  }));
}

function locateProbeBoundaries(windowText: string, items: Array<{ text: string }>) {
  const positions: number[] = [];
  let cursor = 0;
  for (const item of items) {
    const value = item.text.trim();
    if (!value) continue;
    let found = windowText.indexOf(value, cursor);
    if (found < 0) found = windowText.indexOf(value);
    if (found < 0) continue;
    const end = found + value.length;
    positions.push(end);
    cursor = end;
  }
  return positions;
}

async function validateEdgeChunkSeams(
  source: string,
  plans: EdgeChunkPlan[],
  voice: string,
  speed: number,
) {
  if (plans.length <= 1) return refreshEdgePlanContext(source, plans, speed);
  const adjusted = plans.map((plan) => ({ ...plan }));

  for (let index = 0; index < adjusted.length - 1; index += 1) {
    const left = adjusted[index];
    const right = adjusted[index + 1];
    const seam = left.end;
    const windowStart = Math.max(left.start, seam - 620);
    const windowEnd = Math.min(right.end, seam + 620);
    const windowText = source.slice(windowStart, windowEnd);
    const metadata = await probeEdgeBoundaries(windowText, voice, "SentenceBoundary", 5500);
    const positions = locateProbeBoundaries(windowText, metadata)
      .map((position) => windowStart + position)
      .filter((position) => position > left.start + 180 && position < right.end - 180);
    if (!positions.length) continue;

    let candidate = positions[0];
    let distance = Math.abs(candidate - seam);
    for (const position of positions.slice(1)) {
      const nextDistance = Math.abs(position - seam);
      if (nextDistance < distance) {
        candidate = position;
        distance = nextDistance;
      }
    }
    if (distance > 220) continue;

    const leftText = source.slice(left.start, candidate);
    const rightText = source.slice(candidate, right.end);
    const leftSeconds = estimateEdgeSpeechSeconds(leftText, speed);
    const rightSeconds = estimateEdgeSpeechSeconds(rightText, speed);
    if (
      leftText.length > EDGE_MAX_CHUNK_SIZE ||
      rightText.length > EDGE_MAX_CHUNK_SIZE ||
      leftSeconds > 420 ||
      rightSeconds > 420
    ) continue;

    left.end = candidate;
    left.boundary = "sentence";
    left.text = leftText;
    left.estimatedSeconds = leftSeconds;
    right.start = candidate;
    right.text = rightText;
    right.estimatedSeconds = rightSeconds;
  }

  return refreshEdgePlanContext(source, adjusted, speed);
}

'''
route = route.replace(anchor, helpers + anchor, 1)

old = '''  const chunkPlans = planEdgeTextChunks(
    preparedText,
    effectiveSpeed,
    EDGE_MAX_CHUNK_SIZE,
    300,
    420,
  );
  const useMultilingual = isUnifiedProfile || articleHasHan;
  const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);'''
new = '''  const initialChunkPlans = planEdgeTextChunks(
    preparedText,
    effectiveSpeed,
    EDGE_MAX_CHUNK_SIZE,
    300,
    420,
  );
  const useMultilingual = isUnifiedProfile || articleHasHan;
  const resolvedEdgeVoice = useMultilingual
    ? (MULTILINGUAL_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyiMultilingualNeural")
    : voice;
  // V38: ask Edge's Read Aloud metadata channel how it recognizes the seam.
  // This is best-effort and never replaces the stable REST audio path; on any
  // handshake/protocol failure we simply keep the V36/V37 planned boundaries.
  const chunkPlans = await validateEdgeChunkSeams(
    preparedText,
    initialChunkPlans,
    resolvedEdgeVoice,
    effectiveSpeed,
  ).catch(() => refreshEdgePlanContext(preparedText, initialChunkPlans, effectiveSpeed));
  const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);'''
assert old in route, 'chunk plan anchor missing'
route = route.replace(old, new, 1)

route_path.write_text(route)
