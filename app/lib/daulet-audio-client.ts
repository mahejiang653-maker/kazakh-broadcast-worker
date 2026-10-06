import { readDauletStream } from "./daulet-stream";
import { DAULET_NEWS_VERSION } from "./daulet-news";

const CACHE = `qazaq-${DAULET_NEWS_VERSION}`;
export async function dauletAudioCacheKey(payload: object) {
  if (!globalThis.crypto?.subtle) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return `${location.origin}/__daulet_audio__/${DAULET_NEWS_VERSION}/${Array.from(new Uint8Array(hash), x=>x.toString(16).padStart(2,"0")).join("")}`;
}
export async function readDauletCache(key: string | null) {
  if (!key || !("caches" in globalThis)) return null;
  try { const match = await (await caches.open(CACHE)).match(key); return match ? await match.blob() : null; }
  catch { return null; }
}
export async function writeDauletCache(key: string | null, blob: Blob) {
  if (!key || !("caches" in globalThis) || blob.size > 20*1024*1024) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(key,new Response(blob,{headers:{"Content-Type":"audio/mpeg"}}));
    const keys = await cache.keys();
    for (const request of keys.slice(0,Math.max(0,keys.length-3))) await cache.delete(request);
  } catch { /* Cache is optional; never discard a successfully generated MP3. */ }
}

export async function processDauletResponse(response: Response, signal: AbortSignal, onProgress?: (message: string) => void): Promise<Blob> {
  if (signal.aborted) throw new Error("本次生成已取消。");
  let worker: Worker;
  try {
    worker = new Worker(new URL("./daulet-audio.worker.ts", import.meta.url), {type:"module"});
  } catch {
    return processDauletResponseOnMainThread(response, signal, onProgress);
  }
  let id = 0;
  let failure: string | null = null;
  const pending = new Map<number,{resolve:(value: {blob?: Blob})=>void; reject:(error: Error)=>void; timer:ReturnType<typeof setTimeout>}>();
  const fail = (message: string) => {
    failure = message;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
    pending.clear(); worker.terminate();
  };
  worker.onmessage = (event: MessageEvent<{id:number;error?:string;blob?:Blob}>) => {
    const entry = pending.get(event.data.id); if (!entry) return;
    clearTimeout(entry.timer); pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error)); else entry.resolve(event.data);
  };
  worker.onerror = () => fail("浏览器音频处理未成功，请重新生成。");
  const abort = () => fail("本次生成已取消。");
  signal.addEventListener("abort",abort,{once:true});
  const send = (message: object, transfer: Transferable[] = [], timeoutMs = 120000) => new Promise<{blob?:Blob}>((resolve,reject) => {
    if (failure) { reject(new Error(failure)); return; }
    if (signal.aborted) { reject(new Error("本次生成已取消。")); return; }
    const index = ++id;
    const timer = setTimeout(()=>fail("音频处理超时，请重新生成。"),timeoutMs);
    pending.set(index,{resolve,reject,timer});
    try { worker.postMessage({...message,id:index},transfer); }
    catch { fail("浏览器音频处理未成功，请重新生成。"); }
  });
  try {
    // Confirm startup before consuming/transferring PCM. A blocked module Worker
    // can then use the identical processor locally without a second TTS request.
    try { await send({type:"init"}, [], 5000); }
    catch (error) {
      if (signal.aborted) throw error;
      worker.terminate();
      return await processDauletResponseOnMainThread(response, signal, onProgress);
    }
    let completed = 0;
    await readDauletStream(response,async(pcm,boundary)=> {
      await send({type:"chunk",pcm,boundary},[pcm]);
      onProgress?.(`已生成 ${++completed} 段，正在衔接声音…`);
    }, signal);
    onProgress?.("正在完成音质处理与 MP3 输出…");
    const result = await send({type:"finish"});
    if (!result.blob?.size) throw new Error("没有收到完整音频。");
    return result.blob;
  } finally {
    signal.removeEventListener("abort",abort);
    for (const entry of pending.values()) clearTimeout(entry.timer);
    worker.terminate();
  }
}

/** Compatibility path: identical stateful DSP and one MP3 encode for the file. */
export async function processDauletResponseOnMainThread(response: Response, signal: AbortSignal, onProgress?: (message: string) => void): Promise<Blob> {
  const checkAbort = () => { if (signal.aborted) throw new Error("本次生成已取消。"); };
  checkAbort();
  onProgress?.("正在使用兼容音质处理…");
  const [{ DauletNewsProcessor, DAULET_SAMPLE_RATE, pcm16Blocks }, { Mp3Encoder }] = await Promise.all([
    import("./daulet-dsp"), import("@breezystack/lamejs"),
  ]);
  checkAbort();
  const processor = new DauletNewsProcessor();
  const yieldToPage = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  let completed = 0;
  await readDauletStream(response, async (pcm, boundary) => {
    checkAbort();
    processor.addPcm(pcm, boundary);
    onProgress?.(`已生成 ${++completed} 段，正在衔接声音…`);
    await yieldToPage();
    checkAbort();
  }, signal);
  checkAbort();
  onProgress?.("正在完成音质处理与 MP3 输出…");
  await yieldToPage();
  checkAbort();
  const { pieces, gain } = processor.finish();
  const encoder = new Mp3Encoder(1, DAULET_SAMPLE_RATE, 160);
  const frames: Uint8Array[] = [];
  let blocks = 0;
  for (const block of pcm16Blocks(pieces, gain)) {
    const bytes = encoder.encodeBuffer(block);
    if (bytes.length) frames.push(new Uint8Array(bytes));
    if (++blocks % 32 === 0) { await yieldToPage(); checkAbort(); }
  }
  checkAbort();
  const end = encoder.flush();
  if (end.length) frames.push(new Uint8Array(end));
  const blob = new Blob(frames as BlobPart[], {type:"audio/mpeg"});
  if (!blob.size) throw new Error("没有收到完整音频。");
  return blob;
}
