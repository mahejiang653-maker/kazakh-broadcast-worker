import { Mp3Encoder } from "@breezystack/lamejs";
import { DauletNewsProcessor, DAULET_SAMPLE_RATE, pcm16Blocks } from "./daulet-dsp";
import type { NewsBoundary } from "./daulet-news";

const processor = new DauletNewsProcessor();
self.onmessage = (event: MessageEvent<{id: number; type: "init" | "chunk" | "finish"; pcm?: ArrayBuffer; boundary?: NewsBoundary}>) => {
  const {id, type, pcm, boundary} = event.data;
  try {
    if (type === "init") {
      self.postMessage({id, ok:true});
    } else if (type === "chunk" && pcm && boundary) {
      processor.addPcm(pcm,boundary);
      self.postMessage({id, ok:true});
    } else if (type === "finish") {
      const {pieces,gain,metrics} = processor.finish();
      const encoder = new Mp3Encoder(1, DAULET_SAMPLE_RATE, 160);
      const frames: Uint8Array[] = [];
      for (const block of pcm16Blocks(pieces,gain)) {
        const bytes = encoder.encodeBuffer(block);
        if (bytes.length) frames.push(new Uint8Array(bytes));
      }
      const end = encoder.flush();
      if (end.length) frames.push(new Uint8Array(end));
      const blob = new Blob(frames as BlobPart[], {type:"audio/mpeg"});
      self.postMessage({id, blob, metrics});
      self.close();
    } else throw new Error("音频处理参数无效。");
  } catch (error) {
    self.postMessage({id, error:error instanceof Error ? error.message : "音频处理失败。"});
    self.close();
  }
};
