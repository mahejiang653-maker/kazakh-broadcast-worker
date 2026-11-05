import { createHash } from "node:crypto";

const ORIGIN = "https://kazakh-broadcast-m3-remix-probe-20261105.mahejiang653.workers.dev";
const PATH = "/api/internal/m3-remix-evaluation";
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_FRAME_CHARS = 48 * 1024 * 1024;

const fail = code => { throw new Error(code); };
const validBase64 = data => {
  if (typeof data !== "string" || !data.length || data.length % 4 || /[^A-Za-z0-9+/=]/.test(data)) return false;
  const pad = data.indexOf("=");
  return pad < 0 || (pad >= data.length - 2 && /^={1,2}$/.test(data.slice(pad)));
};
const varied = bytes => {
  for (let i = 2; i < bytes.length; i += 2) if (bytes[i] !== bytes[0] || bytes[i + 1] !== bytes[1]) return true;
  return false;
};
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function makeWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Preserve every PCM delta. A STOP marker proves transport completion, not transcript accuracy. */
export async function decodeAudioStream(readable, { minimumSeconds = 0.25 } = {}) {
  if (!readable || !Number.isFinite(minimumSeconds) || minimumSeconds < 0) fail("INVALID_STREAM");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks = [], recent = new Set();
  let pending = "", total = 0, completed = false, previous = null;

  const consume = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let payload;
    try { payload = JSON.parse(data); } catch { fail("INVALID_STREAM_JSON"); }
    if (payload.error) fail("UPSTREAM_STREAM_ERROR");
    const candidate = payload.candidates?.find(item => (item.index ?? 0) === 0);
    if (!candidate) return;
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData ?? (part.inline_data ? { data: part.inline_data.data, mimeType: part.inline_data.mime_type } : undefined);
      if (!inline) continue;
      if (completed) fail("AUDIO_AFTER_STOP");
      if (!validBase64(inline.data)) fail("INVALID_BASE64");
      const mime = String(inline.mimeType ?? "");
      if (!/^audio\/(?:l16|pcm)(?:\s*;|$)/i.test(mime)) fail("AUDIO_FORMAT_MISMATCH");
      const rate = mime.match(/(?:^|;)\s*(?:rate|samplerate)\s*=\s*(\d+)/i);
      const channels = mime.match(/(?:^|;)\s*channels\s*=\s*(\d+)/i);
      if ((rate && Number(rate[1]) !== 24000) || (channels && Number(channels[1]) !== 1)) fail("AUDIO_FORMAT_MISMATCH");
      const pcm = Buffer.from(inline.data, "base64");
      if (!pcm.length || pcm.length % 2 || pcm.toString("base64") !== inline.data) fail("AUDIO_FORMAT_MISMATCH");
      if (total + pcm.length > MAX_AUDIO_BYTES) fail("AUDIO_SIZE_LIMIT");
      const isVaried = varied(pcm);
      if (pcm.length >= 48000 && isVaried) {
        const hash = digest(pcm);
        if (recent.has(hash)) fail("REPEATED_AUDIO");
        if (previous && previous.length >= 48000 && varied(previous) && pcm.length > previous.length &&
            digest(previous) === digest(pcm.subarray(0, previous.length))) fail("CUMULATIVE_AUDIO");
        recent.add(hash);
        if (recent.size > 128) recent.delete(recent.values().next().value);
      }
      if (previous && previous.length >= 48000 && pcm.length >= 48000) {
        const tail = previous.subarray(previous.length - 24000), head = pcm.subarray(0, 24000);
        if (varied(tail) && varied(head) && digest(tail) === digest(head)) fail("OVERLAPPING_AUDIO");
      }
      chunks.push(pcm); total += pcm.length; previous = pcm;
    }
    if (candidate.finishReason) {
      if (candidate.finishReason !== "STOP") fail("INCOMPLETE_AUDIO");
      if (completed) fail("DUPLICATE_STOP");
      completed = true;
    }
  };
  try {
    for await (const part of readable) {
      pending += decoder.decode(part, { stream: true });
      let separator;
      while ((separator = /\r?\n\r?\n/.exec(pending))) {
        consume(pending.slice(0, separator.index));
        pending = pending.slice(separator.index + separator[0].length);
      }
      if (pending.length > MAX_FRAME_CHARS) fail("FRAME_SIZE_LIMIT");
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
  } catch (error) {
    if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) throw error;
    fail("STREAM_INTERRUPTED");
  }
  if (!completed) fail("INCOMPLETE_AUDIO");
  if (!total) fail("NO_AUDIO");
  if (total / 48000 < minimumSeconds) fail("SUSPICIOUSLY_SHORT_AUDIO");
  const pcm = Buffer.concat(chunks, total);
  return { pcm, wav: makeWav(pcm), sha256: digest(pcm), seconds: total / 48000, chunks: chunks.length, contentVerified: false };
}

/**
 * Explicitly invoked only: create one voice, then one baseline and one remix.
 * No retries, no alternate endpoint, no publication, no credentials in errors.
 */
export async function runRemixComparison({ text, token, fetcher = fetch, minimumSeconds } = {}) {
  if (typeof text !== "string" || text.trim().length < 5000 || text.trim().length > 5300 ||
      typeof token !== "string" || !token || typeof fetcher !== "function") fail("INVALID_INPUT");
  const manuscript = text.trim();
  const words = manuscript.match(/\S+/g)?.length ?? 0;
  const min = minimumSeconds ?? Math.max(0.25, words / 5);
  let phase = "create", calls = 0, voiceCreated = false, creationAccepted = false;
  const post = async (operation, body, timeout) => {
    calls++;
    let response;
    try {
      response = await fetcher(ORIGIN + PATH + "/" + operation, {
        method: "POST", redirect: "manual",
        headers: { "Content-Type": "application/json", "X-M3-Probe-Token": token },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
    } catch { fail("REQUEST_OUTCOME_UNKNOWN"); }
    if (!response.ok) {
      let details = null;
      try { details = await response.json(); } catch {}
      const status = Number.isInteger(details?.upstreamStatus) ? details.upstreamStatus : response.status;
      const error = new Error("REQUEST_FAILED"); error.status = status;
      error.outcomeUnknown = details?.outcomeUnknown === true;
      throw error;
    }
    return response;
  };
  try {
    const created = await post("create", {}, 70000);
    creationAccepted = true;
    let creation;
    try { creation = await created.json(); } catch { fail("CREATION_RESULT_INVALID"); }
    if (creation?.code !== "VOICE_CREATED" || !/^voice_[A-Za-z0-9_-]{1,100}$/.test(creation.id ?? "")) fail("CREATION_RESULT_INVALID");
    voiceCreated = true;
    phase = "baseline";
    const a = await post("synthesize", { text: manuscript, voice: "Iapetus" }, 550000);
    if (!a.headers.get("content-type")?.includes("text/event-stream")) fail("INVALID_AUDIO_STREAM");
    const baseline = await decodeAudioStream(a.body, { minimumSeconds: min });
    phase = "remix";
    const b = await post("synthesize", { text: manuscript, voice: creation.id }, 550000);
    if (!b.headers.get("content-type")?.includes("text/event-stream")) fail("INVALID_AUDIO_STREAM");
    const remix = await decodeAudioStream(b.body, { minimumSeconds: min });
    return { voiceId: creation.id, creationUsage: creation.usage ?? {}, calls, baseline, remix };
  } catch (error) {
    if (!(error instanceof Error)) error = new Error("COMPARISON_FAILED");
    error.phase = phase; error.calls = calls; error.voiceCreated = voiceCreated;
    if (error.outcomeUnknown === undefined) error.outcomeUnknown = error.message === "REQUEST_OUTCOME_UNKNOWN" || (phase === "create" && creationAccepted && !voiceCreated);
    throw error;
  }
}
