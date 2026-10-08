export type M3LiveTimings = { upstreamMs: number; postprocessMs: number; totalMs: number };
type Cut = { start: number; end: number };
type M3LiveResult = { audioBlob: Blob; timings: M3LiveTimings; receivedSeconds: number };

function decodePcm(base64: string): Uint8Array {
  const binary = atob(base64);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  if (data.byteLength % 2) throw new Error("Gemini PCM 音频长度不是 16 位对齐。");
  return data;
}

function assembleWav(chunks: Uint8Array[], expectedBytes: number, cuts: Cut[]): Blob {
  const originalBytes = chunks.reduce((sum, item) => sum + item.byteLength, 0);
  if (originalBytes !== expectedBytes || !originalBytes || originalBytes % 2) {
    throw new Error("Gemini 音频流不完整，已停止组装下载文件。");
  }
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const cut of sorted) {
    if (!Number.isSafeInteger(cut.start) || !Number.isSafeInteger(cut.end) ||
        cut.start < previousEnd || cut.end <= cut.start || cut.end > originalBytes ||
        cut.start % 2 || cut.end % 2) {
      throw new Error("Gemini 静音修复索引无效，无法生成完整 WAV。");
    }
    previousEnd = cut.end;
  }

  const removedBytes = sorted.reduce((sum, cut) => sum + cut.end - cut.start, 0);
  const remainingBytes = originalBytes - removedBytes;
  if (remainingBytes > 0xffffffff - 44) throw new Error("音频超过 WAV 容器限制。");

  const raw = new Uint8Array(originalBytes);
  let at = 0;
  for (const chunk of chunks) { raw.set(chunk, at); at += chunk.byteLength; }

  const wav = new Uint8Array(44 + remainingBytes);
  const view = new DataView(wav.buffer);
  const word = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  word(0, "RIFF"); view.setUint32(4, 36 + remainingBytes, true);
  word(8, "WAVE"); word(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, "data"); view.setUint32(40, remainingBytes, true);

  let sourceAt = 0;
  let wavAt = 44;
  for (const cut of sorted) {
    wav.set(raw.subarray(sourceAt, cut.start), wavAt);
    wavAt += cut.start - sourceAt;
    sourceAt = cut.end;
  }
  wav.set(raw.subarray(sourceAt), wavAt);
  return new Blob([wav], { type: "audio/wav" });
}

export class M3LivePreview {
  private chunks: Uint8Array[] = [];
  private context: AudioContext | null = null;
  private nextAt = 0;

  add(chunk: Uint8Array) {
    this.chunks.push(chunk);
    if (this.context) this.schedule(chunk);
  }

  get bufferedSeconds() { return this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) / 48000; }

  async start() {
    if (this.context) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
    this.context = ctx;
    this.nextAt = ctx.currentTime + 0.15;
    void ctx.resume();
    for (const chunk of this.chunks) this.schedule(chunk);
  }

  private schedule(chunk: Uint8Array) {
    const ctx = this.context;
    if (!ctx || !chunk.byteLength) return;
    const frames = chunk.byteLength / 2;
    const audio = ctx.createBuffer(1, frames, 24000);
    const samples = audio.getChannelData(0);
    const data = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i < frames; i++) samples[i] = data.getInt16(i * 2, true) / 32768;
    const source = ctx.createBufferSource();
    source.buffer = audio;
    source.connect(ctx.destination);
    const when = Math.max(this.nextAt, ctx.currentTime + 0.05);
    source.start(when);
    this.nextAt = when + audio.duration;
  }

  stop() {
    const ctx = this.context;
    this.context = null;
    this.nextAt = 0;
    if (ctx) void ctx.close().catch(() => {});
  }
}

export async function receiveM3LiveAudio(
  response: Response,
  preview: M3LivePreview,
  onProgress: (receivedSeconds: number, elapsedMs: number) => void,
): Promise<M3LiveResult> {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("M3 没有收到预期的实时音频流，请刷新页面。");
  }
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let pending = "";
  let done: { cuts: Cut[]; originalPcmBytes: number; timings: M3LiveTimings } | null = null;
  let upstreamError: string | null = null;
  let elapsedMs = 0;
  const handleFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart()).join("\n");
    if (!event || !data) return;
    const payload = JSON.parse(data);
    if (event === "audio") {
      const chunk = decodePcm(payload.data);
      chunks.push(chunk);
      preview.add(chunk);
      onProgress(preview.bufferedSeconds, elapsedMs);
    } else if (event === "heartbeat") {
      elapsedMs = payload.elapsedMs ?? elapsedMs;
      onProgress(preview.bufferedSeconds, elapsedMs);
    } else if (event === "done") {
      done = payload;
    } else if (event === "error") {
      upstreamError = payload.error || "Gemini 生成失败。";
    }
  };
  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      pending += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        handleFrame(pending.slice(0, match.index));
        pending = pending.slice(match.index + match[0].length);
      }
      if (pending.length > 2000000) throw new Error("M3 实时音频数据帧超出安全范围。");
    }
    pending += decoder.decode();
    if (pending.trim()) handleFrame(pending);
  } finally { reader.releaseLock(); }

  if (upstreamError) throw new Error(upstreamError);
  if (!done) throw new Error("Gemini 音频流中断，尚未完成整篇生成。");
  const result = done as { cuts: Cut[]; originalPcmBytes: number; timings: M3LiveTimings };
  return {
    audioBlob: assembleWav(chunks, result.originalPcmBytes, result.cuts),
    timings: result.timings,
    receivedSeconds: preview.bufferedSeconds,
  };
}
