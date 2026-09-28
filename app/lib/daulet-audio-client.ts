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
  const worker = new Worker(new URL("./daulet-audio.worker.ts", import.meta.url), {type:"module"});
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
  const send = (message: object, transfer: Transferable[] = []) => new Promise<{blob?:Blob}>((resolve,reject) => {
    if (failure) { reject(new Error(failure)); return; }
    if (signal.aborted) { reject(new Error("本次生成已取消。")); return; }
    const index = ++id;
    const timer = setTimeout(()=>fail("音频处理超时，请重新生成。"),120000);
    pending.set(index,{resolve,reject,timer});
    worker.postMessage({...message,id:index},transfer);
  });
  try {
    let completed = 0;
    await readDauletStream(response,async(pcm,boundary)=> {
      await send({type:"chunk",pcm,boundary},[pcm]);
      onProgress?.(`已生成 ${++completed} 段，正在衔接声音…`);
    });
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
