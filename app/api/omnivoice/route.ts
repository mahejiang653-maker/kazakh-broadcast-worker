const OMNI_BASE = (process.env.OMNIVOICE_BASE_URL?.trim() || "https://shyngys879-kazakhtts-omnivoice-demo.hf.space").replace(/\/$/u, "");
const OMNI_API = "_design_fn";
const MAX_CHARACTERS = 1200;
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;
const MAX_TAGGED_SEGMENTS = 7;

const GENDERS = new Set(["Auto", "Male / 男", "Female / 女"]);
const AGES = new Set([
  "Auto",
  "Child / 儿童",
  "Teenager / 少年",
  "Young Adult / 青年",
  "Middle-aged / 中年",
  "Elderly / 老年",
]);
const PITCHES = new Set([
  "Auto",
  "Very Low Pitch / 极低音调",
  "Low Pitch / 低音调",
  "Moderate Pitch / 中音调",
  "High Pitch / 高音调",
  "Very High Pitch / 极高音调",
]);
const STYLES = new Set(["Auto", "Whisper / 耳语"]);

const TAG_STYLES: Record<
  string,
  { speedFactor?: number; pitch?: string; style?: string }
> = {
  开心: { speedFactor: 1.05, pitch: "High Pitch / 高音调" },
  高兴: { speedFactor: 1.05, pitch: "High Pitch / 高音调" },
  快乐: { speedFactor: 1.05, pitch: "High Pitch / 高音调" },
  兴奋: { speedFactor: 1.1, pitch: "Very High Pitch / 极高音调" },
  激动: { speedFactor: 1.1, pitch: "High Pitch / 高音调" },
  热情: { speedFactor: 1.07, pitch: "High Pitch / 高音调" },
  悲伤: { speedFactor: 0.88, pitch: "Low Pitch / 低音调" },
  难过: { speedFactor: 0.9, pitch: "Low Pitch / 低音调" },
  伤心: { speedFactor: 0.86, pitch: "Very Low Pitch / 极低音调" },
  哭泣: { speedFactor: 0.84, pitch: "Low Pitch / 低音调" },
  愤怒: { speedFactor: 1.04, pitch: "Low Pitch / 低音调" },
  生气: { speedFactor: 1.03, pitch: "Low Pitch / 低音调" },
  担心: { speedFactor: 0.95, pitch: "High Pitch / 高音调" },
  忧虑: { speedFactor: 0.92, pitch: "Moderate Pitch / 中音调" },
  紧张: { speedFactor: 1.06, pitch: "High Pitch / 高音调" },
  害怕: { speedFactor: 1.06, pitch: "High Pitch / 高音调" },
  恐惧: { speedFactor: 1.08, pitch: "Very High Pitch / 极高音调" },
  惊讶: { speedFactor: 1.04, pitch: "Very High Pitch / 极高音调" },
  好奇: { speedFactor: 0.98, pitch: "High Pitch / 高音调" },
  疲惫: { speedFactor: 0.84, pitch: "Low Pitch / 低音调" },
  自信: { speedFactor: 0.98, pitch: "Low Pitch / 低音调" },
  严肃: { speedFactor: 0.94, pitch: "Low Pitch / 低音调" },
  平静: { speedFactor: 0.92, pitch: "Moderate Pitch / 中音调" },
  冷静: { speedFactor: 0.92, pitch: "Low Pitch / 低音调" },
  轻松: { speedFactor: 0.95, pitch: "Moderate Pitch / 中音调" },
  温柔: { speedFactor: 0.9, pitch: "Moderate Pitch / 中音调" },
  温暖: { speedFactor: 0.93, pitch: "Moderate Pitch / 中音调" },
  轻声: { speedFactor: 0.9, style: "Whisper / 耳语" },
  小声: { speedFactor: 0.86, style: "Whisper / 耳语" },
  耳语: { speedFactor: 0.84, style: "Whisper / 耳语" },
  神秘: { speedFactor: 0.86, pitch: "Low Pitch / 低音调", style: "Whisper / 耳语" },
  大声: { speedFactor: 1.03, pitch: "High Pitch / 高音调" },
  喊叫: { speedFactor: 1.07, pitch: "Very High Pitch / 极高音调" },
  调皮: { speedFactor: 1.04, pitch: "High Pitch / 高音调" },
  讽刺: { speedFactor: 0.96, pitch: "High Pitch / 高音调" },
  笑: { speedFactor: 1.06, pitch: "High Pitch / 高音调" },
  轻笑: { speedFactor: 1.05, pitch: "High Pitch / 高音调" },
  大笑: { speedFactor: 1.1, pitch: "Very High Pitch / 极高音调" },
  叹气: { speedFactor: 0.82, pitch: "Low Pitch / 低音调" },
  清嗓: { speedFactor: 0.9, pitch: "Moderate Pitch / 中音调" },
  慢速: { speedFactor: 0.78 },
  快速: { speedFactor: 1.18 },
};

type OmniSettings = {
  speed: number;
  steps: number;
  guidance: number;
  denoise: boolean;
  gender: string;
  age: string;
  pitch: string;
  style: string;
};

type OmniSegment = { text: string; tag?: string };

class OmniError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function splitTagFromPreviousSentence(source: string, tag: string) {
  let contentEnd = source.length;
  while (contentEnd > 0 && /\s/u.test(source[contentEnd - 1])) contentEnd -= 1;
  if (!source.slice(0, contentEnd).trim()) return null;

  let searchFrom = contentEnd - 1;
  if (/[.!?。！？]/u.test(source[searchFrom] ?? "")) searchFrom -= 1;

  let sentenceStart = 0;
  for (let index = searchFrom; index >= 0; index -= 1) {
    if (/[.!?。！？\n]/u.test(source[index])) {
      sentenceStart = index + 1;
      break;
    }
  }

  const before = source.slice(0, sentenceStart).trim();
  const sentence = source.slice(sentenceStart, contentEnd).trim();
  const trailing = source.slice(contentEnd);
  if (!sentence) return null;
  return { before, sentence, trailing, tag };
}

function splitOmniSegments(text: string) {
  const matcher = /[\[【]([^\]】\r\n]{1,30})[\]】]/gu;
  const segments: OmniSegment[] = [];
  let pending = "";
  let cursor = 0;
  let recognizedTags = 0;

  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    pending += text.slice(cursor, index);
    const rawTag = (match[1] ?? "").trim();

    if (TAG_STYLES[rawTag]) {
      recognizedTags += 1;
      const split = splitTagFromPreviousSentence(pending, rawTag);
      if (split) {
        if (split.before) segments.push({ text: split.before });
        segments.push({ text: split.sentence, tag: rawTag });
        pending = split.trailing;
      }
    } else {
      pending += match[0];
    }

    cursor = index + match[0].length;
  }

  pending += text.slice(cursor);
  if (pending.trim()) segments.push({ text: pending.trim() });

  const merged: OmniSegment[] = [];
  for (const item of segments) {
    const previous = merged.at(-1);
    if (previous && previous.tag === item.tag && !item.tag) {
      previous.text = `${previous.text} ${item.text}`.trim();
    } else {
      merged.push(item);
    }
  }

  return { segments: merged.length ? merged : [{ text }], recognizedTags };
}

function writeAscii(view: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view[offset + index] = value.charCodeAt(index);
  }
}

function parseWav(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF") {
    throw new OmniError("OmniVoice 返回的音频格式异常，请稍后再试。");
  }
  if (String.fromCharCode(...bytes.slice(8, 12)) !== "WAVE") {
    throw new OmniError("OmniVoice 返回的音频不是 WAV 格式。");
  }

  let offset = 12;
  let fmt: Uint8Array | null = null;
  let data: Uint8Array | null = null;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) break;
    if (id === "fmt ") fmt = bytes.slice(start, end);
    if (id === "data") {
      data = bytes.slice(start, end);
      break;
    }
    offset = end + (size % 2);
  }

  if (!fmt || !data) throw new OmniError("无法解析 OmniVoice WAV 音频。");
  return { fmt, data };
}

function concatWav(buffers: ArrayBuffer[]) {
  if (buffers.length === 1) return buffers[0];
  const parsed = buffers.map(parseWav);
  const firstFmt = parsed[0].fmt;
  for (const item of parsed.slice(1)) {
    if (
      item.fmt.length !== firstFmt.length ||
      item.fmt.some((value, index) => value !== firstFmt[index])
    ) {
      throw new OmniError("OmniVoice 分段音频参数不一致，暂时无法合并。");
    }
  }

  const totalData = parsed.reduce((sum, item) => sum + item.data.length, 0);
  const totalLength = 12 + 8 + firstFmt.length + (firstFmt.length % 2) + 8 + totalData;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  writeAscii(output, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeAscii(output, 8, "WAVE");
  writeAscii(output, 12, "fmt ");
  view.setUint32(16, firstFmt.length, true);
  output.set(firstFmt, 20);
  let offset = 20 + firstFmt.length;
  if (firstFmt.length % 2) offset += 1;
  writeAscii(output, offset, "data");
  view.setUint32(offset + 4, totalData, true);
  offset += 8;
  for (const item of parsed) {
    output.set(item.data, offset);
    offset += item.data.length;
  }
  return output.buffer;
}

function parseSseResult(raw: string) {
  const lines = raw.split(/\r?\n/u);
  let event = "";
  let finalData: unknown = null;
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "null") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (event === "error") {
      const message =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: unknown }).error ?? "")
          : "OmniVoice 生成失败";
      throw new OmniError(message || "OmniVoice 生成失败。");
    }
    if (event === "complete") finalData = parsed;
  }
  return finalData;
}

function settingsForTag(base: OmniSettings, tag?: string): OmniSettings {
  if (!tag) return base;
  const override = TAG_STYLES[tag];
  if (!override) return base;
  return {
    ...base,
    speed: clamp(base.speed * (override.speedFactor ?? 1), MIN_SPEED, MAX_SPEED),
    pitch: override.pitch ?? base.pitch,
    style: override.style ?? base.style,
  };
}

async function generateSegment(text: string, settings: OmniSettings) {
  const submit = await fetchWithTimeout(
    `${OMNI_BASE}/gradio_api/call/${OMNI_API}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          text,
          "Kazakh",
          settings.steps,
          settings.guidance,
          settings.denoise,
          settings.speed,
          null,
          true,
          true,
          settings.gender,
          settings.age,
          settings.pitch,
          settings.style,
          "Auto",
          "Auto",
        ],
      }),
    },
    30000,
  );

  if (!submit.ok) {
    throw new OmniError(`OmniVoice 免费服务连接失败（${submit.status}）。`);
  }
  const submitPayload = (await submit.json().catch(() => null)) as
    | { event_id?: string }
    | null;
  const eventId = submitPayload?.event_id;
  if (!eventId) throw new OmniError("OmniVoice 没有返回生成任务编号。");

  const result = await fetchWithTimeout(
    `${OMNI_BASE}/gradio_api/call/${OMNI_API}/${encodeURIComponent(eventId)}`,
    { headers: { Accept: "text/event-stream" } },
    240000,
  );
  if (!result.ok) {
    throw new OmniError(`OmniVoice 共享 GPU 返回 ${result.status}，请稍后再试。`);
  }

  const finalData = parseSseResult(await result.text());
  if (!Array.isArray(finalData) || !finalData[0] || typeof finalData[0] !== "object") {
    throw new OmniError("OmniVoice 没有返回可用音频。");
  }
  const audioUrl = String((finalData[0] as { url?: unknown }).url ?? "");
  if (!audioUrl.startsWith(`${OMNI_BASE}/gradio_api/file=`)) {
    throw new OmniError("OmniVoice 返回了无效的音频地址。");
  }

  const audio = await fetchWithTimeout(audioUrl, {}, 60000);
  if (!audio.ok) throw new OmniError(`OmniVoice 音频下载失败（${audio.status}）。`);
  const buffer = await audio.arrayBuffer();
  parseWav(buffer);
  return buffer;
}

export async function GET() {
  try {
    const response = await fetchWithTimeout(
      `${OMNI_BASE}/`,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "kazakh-broadcast-worker-warmup",
        },
      },
      7000,
    );
    return Response.json(
      {
        state: response.ok ? "ready" : "warming",
        upstreamStatus: response.status,
      },
      {
        status: response.ok ? 200 : 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { state: "warming" },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  }
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
    speed,
    steps,
    guidance,
    denoise,
    gender,
    age,
    pitch,
    style,
  } = payload as Record<string, unknown>;

  if (typeof text !== "string" || !text.trim()) return jsonError("请先输入哈萨克语文本。", 400);
  const cleanText = text.replaceAll("\u0000", "").trim();
  if (cleanText.length > MAX_CHARACTERS) {
    return jsonError(`OmniVoice 公共 GPU 模式单次最多 ${MAX_CHARACTERS} 个字符。长稿建议使用 Edge TTS。`, 413);
  }

  const safeSpeed = typeof speed === "number" && Number.isFinite(speed) ? speed : 1;
  const safeSteps = typeof steps === "number" && Number.isFinite(steps) ? Math.round(steps) : 8;
  const safeGuidance = typeof guidance === "number" && Number.isFinite(guidance) ? guidance : 1.3;
  const safeDenoise = typeof denoise === "boolean" ? denoise : false;
  const safeGender = typeof gender === "string" ? gender : "Male / 男";
  const safeAge = typeof age === "string" ? age : "Middle-aged / 中年";
  const safePitch = typeof pitch === "string" ? pitch : "Moderate Pitch / 中音调";
  const safeStyle = typeof style === "string" ? style : "Auto";

  if (safeSpeed < MIN_SPEED || safeSpeed > MAX_SPEED) return jsonError("倍速必须在 0.70× 到 1.20× 之间。", 400);
  if (safeSteps < 8 || safeSteps > 40) return jsonError("OmniVoice 推理步数必须在 8–40 之间。", 400);
  if (safeGuidance < 1 || safeGuidance > 4) return jsonError("Guidance Scale 必须在 1.0–4.0 之间。", 400);
  if (!GENDERS.has(safeGender) || !AGES.has(safeAge) || !PITCHES.has(safePitch) || !STYLES.has(safeStyle)) {
    return jsonError("OmniVoice 声线设计参数无效。", 400);
  }

  const baseSettings: OmniSettings = {
    speed: safeSpeed,
    steps: safeSteps,
    guidance: safeGuidance,
    denoise: safeDenoise,
    gender: safeGender,
    age: safeAge,
    pitch: safePitch,
    style: safeStyle,
  };

  const { segments, recognizedTags } = splitOmniSegments(cleanText);
  if (recognizedTags > 3 || segments.length > MAX_TAGGED_SEGMENTS) {
    return jsonError(
      "OmniVoice 公共 GPU 很慢。为避免一次任务等待过久，每次最多使用 3 个句尾情绪标签；请减少标签数量后重试。",
      400,
    );
  }

  try {
    const buffers: ArrayBuffer[] = [];
    for (const segment of segments) {
      buffers.push(await generateSegment(segment.text, settingsForTag(baseSettings, segment.tag)));
    }
    const output = concatWav(buffers);
    return new Response(output, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="qazaq-omnivoice.wav"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-TTS-Engine": "omnivoice",
        "X-Omni-Segments": String(segments.length),
      },
    });
  } catch (error) {
    console.error("OmniVoice synthesis failed", error);
    const message = error instanceof Error ? error.message : "OmniVoice 免费服务暂时不可用。";
    if (/aborted|timeout/i.test(message)) {
      return jsonError("OmniVoice 共享 GPU 本次等待超时。它是免费公共服务，可能正在排队或冷启动，请稍后再试。", 504);
    }
    return jsonError(`OmniVoice：${message}`, 502);
  }
}
