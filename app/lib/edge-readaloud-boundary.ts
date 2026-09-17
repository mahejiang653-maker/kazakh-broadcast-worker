const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
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
