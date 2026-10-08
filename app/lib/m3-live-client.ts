import { scanM3Signal, planM3Repair, applyM3Plan, isM3Base64, unresolvedM3Low, validateM3Plan, m3Crc32, type M3Cut, type M3Gain } from "./m3-signal";
export type M3LiveTimings = { upstreamMs: number; firstAudioMs?: number | null; postprocessMs: number; totalMs: number; decodeMs?: number; assemblyMs?: number };
type Integrity = { rawBytes: number; rawCrc32: number; processedBytes: number; processedCrc32: number; rawSha256: string; processedSha256: string; contentVerified: false };
type M3Done = { cuts: M3Cut[]; gains: M3Gain[]; originalPcmBytes: number; timings: M3LiveTimings; integrity: Integrity };
type M3LiveResult = { audioBlob: Blob; rawAudioBlob: Blob; diagnostics: unknown; timings: M3LiveTimings; receivedSeconds: number };
export class M3LiveError extends Error {
  constructor(message: string, public rawAudioBlob: Blob | null, public diagnostics: unknown) { super(message); }
}
function decodePcm(base64: string): Uint8Array {
  if (!isM3Base64(base64)) throw new Error("M3 音频 Base64 无效。");
  const binary = atob(base64), data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  if (data.byteLength % 2) throw new Error("Gemini PCM 音频长度不是 16 位对齐。");
  return data;
}

/** Blob parts avoid another whole-recording PCM/WAV copy on a memory-limited phone. */
export function assembleM3Wav(chunks: Uint8Array[], expectedBytes: number, cuts: M3Cut[] = [], gains: M3Gain[] = [], expectedCrc?: number): Blob {
  const bytes = chunks.reduce((sum, c) => sum + c.length, 0);
  if (!bytes || bytes !== expectedBytes || bytes % 2) throw new Error("Gemini 音频流不完整，已停止组装下载文件。");
  validateM3Plan(bytes, cuts, gains);
  const size = bytes - cuts.reduce((s, c) => s + c.end - c.start, 0);
  if (size > 0xffffffff - 44) throw new Error("音频超过 WAV 容器限制。");
  const header = new Uint8Array(44), v = new DataView(header.buffer);
  const word = (p: number, s: string) => { for (let i = 0; i < s.length; i++) header[p + i] = s.charCodeAt(i); };
  word(0, "RIFF"); v.setUint32(4, 36 + size, true); word(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); word(36, "data"); v.setUint32(40, size, true);
  const parts: BlobPart[] = [header];
  let offset = 0, cutIndex = 0, crc = 0;
  for (const chunk of chunks) {
    let at = offset;
    while (at < offset + chunk.length) {
      while (cuts[cutIndex] && cuts[cutIndex].end <= at) cutIndex++;
      const cut = cuts[cutIndex];
      if (cut && at >= cut.start) { at = Math.min(offset + chunk.length, cut.end); continue; }
      const end = Math.min(offset + chunk.length, cut?.start ?? Infinity);
      let piece = chunk.subarray(at - offset, end - offset);
      const changes = gains.filter(g => g.start < end && g.end > at);
      if (changes.length) {
        piece = piece.slice();
        const dv = new DataView(piece.buffer, piece.byteOffset, piece.byteLength);
        for (const g of changes) for (let p = Math.max(at, g.start); p < Math.min(end, g.end); p += 2) {
          const edge = Math.min(1, (p - g.start) / 2 / g.rampSamples, (g.end - p - 2) / 2 / g.rampSamples);
          const mix = 0.5 - 0.5 * Math.cos(Math.PI * edge);
          const value = Math.round(dv.getInt16(p - at, true) * (1 + (10 ** (g.gainDb / 20) - 1) * mix));
          if (value < -32768 || value > 32767) throw new Error("M3_UNSAFE_GAIN");
          dv.setInt16(p - at, value, true);
        }
      }
      crc = m3Crc32(piece, crc); parts.push(piece as Uint8Array<ArrayBuffer>); at = end;
    }
    offset += chunk.length;
  }
  if (expectedCrc !== undefined && crc !== expectedCrc) throw new Error("本站处理后的 PCM 校验不一致，未提供最终 WAV。");
  return new Blob(parts, { type: "audio/wav" });
}

export class M3LivePreview {
  private chunks: Uint8Array[] = [];
  private context: AudioContext | null = null;
  private nextAt = 0;
  private nextChunk = 0;
  private scheduled = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bytes = 0;
  private blocked = false;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  warning = "";
  safeSeconds = 0;
  add(chunk: Uint8Array) {
    this.bytes += chunk.length;
    if (this.blocked) return;
    this.pending.push(chunk); this.pendingBytes += chunk.length;
    if (this.pendingBytes < 96000) return;
    const batch = new Uint8Array(this.pendingBytes);
    let offset = 0;
    for (const piece of this.pending) { batch.set(piece, offset); offset += piece.length; }
    this.pending = []; this.pendingBytes = 0;
    const scan = scanM3Signal(batch);
    const plan = planM3Repair(scan);
    if (scan.summary.longestHighFrequencySeconds >= 0.5 || unresolvedM3Low(scan, plan.gains).length || (scan.summary.activeSeconds < 0.1 && batch.length >= 96000)) {
      this.blocked = true;
      this.warning = "试听已暂停：当前片段含异常信号或尚未确认语音，原始数据仍在接收，等待整篇检查。";
      this.stop(); return;
    }
    // Quiet speech is preserved. Preview uses the same bounded scalar restoration as final output.
    const safe = applyM3Plan(batch, [], plan.gains);
    this.chunks.push(safe); this.safeSeconds += safe.length / 48000;
    this.pump();
  }
  get bufferedSeconds() { return this.bytes / 48000; }
  async start() {
    if (this.blocked) throw new Error(this.warning);
    if (this.context) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
    this.context = ctx; this.nextAt = ctx.currentTime + 0.15; this.nextChunk = 0;
    try { await ctx.resume(); }
    catch (e) { this.stop(); throw e; }
    this.pump(); this.timer = setInterval(() => this.pump(), 250);
  }
  private pump() {
    const ctx = this.context;
    if (!ctx || this.blocked) return;
    // Schedule a short horizon; do not allocate hundreds of AudioBuffers for the whole stream.
    while (this.nextChunk < this.chunks.length && this.nextAt < ctx.currentTime + 8) {
      const chunk = this.chunks[this.nextChunk++], frames = chunk.length / 2;
      const buffer = ctx.createBuffer(1, frames, 24000), samples = buffer.getChannelData(0);
      const data = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (let i = 0; i < frames; i++) samples[i] = data.getInt16(i * 2, true) / 32768;
      const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
      this.scheduled.add(source); source.onended = () => { source.disconnect(); this.scheduled.delete(source); };
      const when = Math.max(this.nextAt, ctx.currentTime + 0.05); source.start(when); this.nextAt = when + buffer.duration;
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    for (const source of this.scheduled) { try { source.stop(); } catch {} source.disconnect(); }
    this.scheduled.clear();
    const ctx = this.context; this.context = null; this.nextAt = 0;
    if (ctx) void ctx.close().catch(() => {});
  }
}

export async function receiveM3LiveAudio(response: Response, preview: M3LivePreview,
  onProgress: (receivedSeconds: number, elapsedMs: number) => void): Promise<M3LiveResult> {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("M3 没有收到预期的实时音频流，请刷新页面。");
  const chunks: Uint8Array[] = [], reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", bytes = 0, crc = 0, sequence = 0, elapsedMs = 0, decodeMs = 0;
  let terminal = false, started = false;
  let result: M3Done | null = null;
  let diagnostics: unknown = null;
  const localStarted = performance.now();
  const frame = (block: string) => {
    const lines = block.split(/\r?\n/), event = lines.find(l => l.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
    if (!event || !data) return;
    const p = JSON.parse(data);
    if (terminal) throw new Error("M3 结束事件之后仍有数据，音频流无效。");
    if (event === "start") { if (started) throw new Error("M3 重复开始事件。"); started = true; }
    else if (event === "audio") {
      if (!started || p.sequence !== sequence || p.offset !== bytes) throw new Error("M3 音频流重复、丢帧或顺序错误。");
      const t = performance.now(), chunk = decodePcm(p.data);
      if (p.crc32 !== m3Crc32(chunk)) throw new Error("M3 PCM 数据校验失败。");
      crc = m3Crc32(chunk, crc); bytes += chunk.length; sequence++; chunks.push(chunk);
      decodeMs += performance.now() - t;
      preview.add(chunk); onProgress(bytes / 48000, performance.now() - localStarted);
    } else if (event === "heartbeat") { elapsedMs = p.elapsedMs ?? elapsedMs; onProgress(bytes / 48000, elapsedMs); }
    else if (event === "done") { terminal = true; result = p; diagnostics = p; }
    else if (event === "error") { terminal = true; diagnostics = p; throw new Error(p.error || "Gemini 生成失败。"); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      pending += decoder.decode(value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(pending))) {
        frame(pending.slice(0, separator.index)); pending = pending.slice(separator.index + separator[0].length);
      }
      if (pending.length > 2000000) throw new Error("M3 实时音频数据帧超出安全范围。");
    }
    pending += decoder.decode(); if (pending.trim()) frame(pending);
    if (!result) throw new Error("Gemini 音频流中断，尚未完成整篇生成。");
    const r = result as M3Done;
    if (!r.integrity || r.integrity.rawBytes !== bytes || r.integrity.rawCrc32 !== crc || r.originalPcmBytes !== bytes) throw new Error("Google 原始 PCM 与浏览器接收结果不一致。");
    const at = performance.now();
    const audioBlob = assembleM3Wav(chunks, bytes, r.cuts, r.gains, r.integrity.processedCrc32);
    if (audioBlob.size - 44 !== r.integrity.processedBytes) throw new Error("M3 处理后字节数不一致。");
    preview.stop();
    return { audioBlob, rawAudioBlob: assembleM3Wav(chunks, bytes), diagnostics,
      timings: { ...r.timings, decodeMs, assemblyMs: performance.now() - at }, receivedSeconds: bytes / 48000 };
  } catch (e) {
    preview.stop(); await reader.cancel().catch(() => {});
    throw new M3LiveError(e instanceof Error ? e.message : "M3 音频流失败。", bytes ? assembleM3Wav(chunks, bytes) : null,
      { server: diagnostics, receivedBytes: bytes, receivedCrc32: crc, receivedChunks: sequence, transcriptVerified: false });
  } finally { reader.releaseLock(); }
}
