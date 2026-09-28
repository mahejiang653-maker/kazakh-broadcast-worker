import type { NewsBoundary, NewsChunk } from "./daulet-news";

export const DAULET_STREAM_TYPE = "application/x-daulet-pcm";
export type DauletFrame = { boundary?: NewsBoundary; sampleRate?: number; error?: string; done?: boolean };
export function encodeDauletFrame(meta: DauletFrame, pcm = new ArrayBuffer(0)) {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const header = new Uint8Array(8 + json.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, json.length, true);
  view.setUint32(4, pcm.byteLength, true);
  header.set(json, 8);
  return [header, new Uint8Array(pcm)];
}

/** Bounded two-request lookahead; each PCM chunk is released as it is delivered. */
export function streamDauletChunks(chunks: NewsChunk[], synthesize: (chunk: NewsChunk, signal: AbortSignal) => Promise<ArrayBuffer>, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const signal = parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal;
  const pending = new Map<number, Promise<{data?: ArrayBuffer; error?: unknown}>>();
  let next = 0, scheduled = 0;
  let cancelled = false;
  const fill = () => {
    while (!signal.aborted && scheduled < chunks.length && pending.size < 2) {
      const index = scheduled++;
      pending.set(index, synthesize(chunks[index], signal).then(data => ({data}), error => ({error})));
    }
  };
  return new ReadableStream<Uint8Array>({
    start(stream) { stream.enqueue(new TextEncoder().encode("DNV1")); fill(); },
    async pull(stream) {
      if (next >= chunks.length) {
        for (const bytes of encodeDauletFrame({done: true})) stream.enqueue(bytes);
        stream.close(); return;
      }
      if (signal.aborted) { stream.error(new Error("aborted")); return; }
      const result = await pending.get(next)!;
      pending.delete(next);
      if (cancelled) return;
      if (signal.aborted) { stream.error(new Error("aborted")); return; }
      if (!result.data?.byteLength || result.error) {
        controller.abort();
        for (const bytes of encodeDauletFrame({error: "本次语音未完整生成，请重试。"})) stream.enqueue(bytes);
        stream.close(); return;
      }
      for (const bytes of encodeDauletFrame({boundary: chunks[next].boundary, sampleRate: 24000}, result.data)) stream.enqueue(bytes);
      next++; fill();
    },
    cancel() { cancelled = true; controller.abort(); pending.clear(); },
  });
}

export async function readDauletStream(response: Response, onFrame: (pcm: ArrayBuffer, boundary: NewsBoundary) => Promise<void>) {
  if (!response.body) throw new Error("没有收到语音数据。");
  const reader = response.body.getReader();
  let buffer = new Uint8Array(0), offset = 0;
  const take = async (length: number): Promise<Uint8Array> => {
    while (buffer.length - offset < length) {
      const {value, done} = await reader.read();
      if (done) throw new Error("音频传输中断，请重新生成。");
      const rest = buffer.subarray(offset);
      const joined = new Uint8Array(rest.length + value.length);
      joined.set(rest); joined.set(value, rest.length);
      buffer = joined; offset = 0;
    }
    const out = buffer.slice(offset, offset + length); offset += length;
    return out;
  };
  try {
    if (new TextDecoder().decode(await take(4)) !== "DNV1") throw new Error("不支持的音频格式。");
    let frames = 0;
    while (true) {
      const bytes = await take(8), view = new DataView(bytes.buffer);
      const metaSize = view.getUint32(0, true), pcmSize = view.getUint32(4, true);
      if (metaSize < 2 || metaSize > 2048 || pcmSize > 32 * 1024 * 1024 || pcmSize % 2) throw new Error("音频数据无效。");
      const meta = JSON.parse(new TextDecoder().decode(await take(metaSize))) as DauletFrame;
      if (meta.error) throw new Error(meta.error);
      if (meta.done) {
        if (!frames || pcmSize) throw new Error("没有收到完整音频。");
        break;
      }
      if (meta.sampleRate !== 24000 || !pcmSize || !["sentence", "paragraph", "clause", "end"].includes(meta.boundary ?? "")) throw new Error("音频分段无效。");
      frames++;
      await onFrame((await take(pcmSize)).buffer as ArrayBuffer, meta.boundary!);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
