import { Buffer } from "node:buffer";
import { compressM3InternalSilence, decodeM3Audio, joinM3Wav, matchM3Loudness, screenM3Take, type M3Features } from "./m3-audio";
import { M3_VERSION, M3_TEMPERATURE, m3RequestBody, m3Style, prepareM3Text } from "./m3-script";

type Fetcher = typeof fetch;
type AudioCandidate = { finishReason?: string; content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }> } };
export class M3Error extends Error {
  constructor(public code: string, message: string, public status = 502, public details?: Record<string, unknown>) { super(message); }
}
export type M3Audit = {
  version: string; model: string; voice: string; style: string; temperature: number;
  strategy: "single"; inputTokens: number | null; ttsRequests: number; retries: number;
  transport: "generateContent" | "streamGenerateContent";
  timings: { upstreamMs: number; postprocessMs: number; totalMs: number };
  parts: Array<{ index: number; characters: number; seconds: number; attempts: number; features: M3Features; score: number; windowWarnings: number; gainDb: number }>;
};

async function googleRequest(fetcher: Fetcher, apiKey: string, model: string, method: string, body: unknown, parent: AbortSignal, timeoutMs: number) {
  const timer = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
      method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.any([parent, timer]),
    });
  } catch (error) {
    if (parent.aborted) throw new M3Error("M3_CANCELLED", "M3 生成已取消。", 499);
    if (timer.aborted) throw new M3Error("M3_TIMEOUT", "Gemini TTS 生成超时，请重试。", 504);
    throw new M3Error("M3_UPSTREAM_NETWORK", error instanceof Error ? error.message : "Gemini 网络请求失败。", 502);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; details?: Array<{ "@type"?: string; retryDelay?: string; violations?: Array<{ quotaMetric?: string; quotaId?: string; quotaValue?: string }> }> } } | null;
    const detail = payload?.error?.message?.slice(0, 420) ?? "Google 未返回详细原因";
    if (/User location is not supported/i.test(detail)) throw new M3Error("GEMINI_REGION_UNSUPPORTED", `Google 拒绝当前服务端地区：${detail}。本次停止生成，不切换音色或模型。`, 503);
    if (response.status === 401 || response.status === 403) throw new M3Error("GEMINI_PERMISSION_DENIED", `Gemini 密钥或项目权限被拒绝：${detail}`, 503);
    if (response.status === 429) {
      const retry = payload?.error?.details?.find(d => d["@type"]?.endsWith("RetryInfo"))?.retryDelay;
      const quota = payload?.error?.details?.flatMap(d => d.violations ?? []).map(v => ({ metric: v.quotaMetric, id: v.quotaId, limit: v.quotaValue }));
      const retryAfterSeconds = retry && /^\d+(?:\.\d+)?s$/.test(retry) ? Math.ceil(Number(retry.slice(0, -1))) : undefined;
      // Preserve only actionable quota information, never project identifiers or credentials.
      throw new M3Error("GEMINI_QUOTA_LIMIT", "Gemini TTS 已达到配额或速率限制，请稍后重试。", 429, { ...(retryAfterSeconds ? { retryAfterSeconds } : {}), quotas: quota ?? [] });
    }
    if ([408, 504, 524].includes(response.status)) throw new M3Error("M3_UPSTREAM_TIMEOUT", `Gemini TTS 上游响应超时（${response.status}）。`, 504);
    const limit = response.status === 400 && /(?:input|context|output|token|text).*(?:limit|too (?:long|large)|exceed|maximum)/i.test(detail);
    throw new M3Error(limit ? "M3_LENGTH_LIMIT" : "GEMINI_REQUEST_FAILED", `Gemini TTS 请求失败（${response.status}）：${detail}`, 502, { upstreamStatus: response.status });
  }
  return { response, timer };
}
export async function countM3Tokens(apiKey: string, model: string, text: string, style: string, signal: AbortSignal, fetcher: Fetcher = fetch) {
  const { response } = await googleRequest(fetcher, apiKey, model, "countTokens", { contents: m3RequestBody(text, "Puck", style).contents }, signal, 15000);
  const result = await response.json() as { totalTokens?: number };
  if (!Number.isFinite(result.totalTokens) || result.totalTokens! < 0) throw new M3Error("M3_TOKEN_COUNT_FAILED", "Gemini 未返回有效的长度检查结果。", 502);
  return result.totalTokens!;
}
async function synthesizeM3Take(apiKey: string, model: string, voice: string, text: string, style: string, signal: AbortSignal, fetcher: Fetcher, streaming: boolean, speed: number) {
  const { response, timer } = await googleRequest(fetcher, apiKey, model, streaming ? "streamGenerateContent?alt=sse" : "generateContent", m3RequestBody(text, voice, style), signal, streaming ? 540000 : 230000);
  const audio: Uint8Array[] = [];
  let completed = false;
  const consume = (payload: { candidates?: AudioCandidate[]; error?: { message?: string } }) => {
    if (payload.error) throw new M3Error("M3_STREAM_ERROR", "Gemini 音频流中断，未交付部分音频。", 502);
    const candidate = payload.candidates?.[0];
    if (!candidate) return;
    if (candidate.finishReason === "MAX_TOKENS") throw new M3Error("M3_OUTPUT_LIMIT", "Gemini 输出达到模型单次长度上限。", 502);
    if (candidate.finishReason && candidate.finishReason !== "STOP") throw new M3Error("M3_INCOMPLETE_AUDIO", `Gemini 没有完成全文生成（${candidate.finishReason}）。`, 502);
    if (candidate.finishReason === "STOP") completed = true;
    for (const p of candidate.content?.parts ?? []) {
      const inline = p.inlineData ?? (p.inline_data ? { data: p.inline_data.data, mimeType: p.inline_data.mime_type } : undefined);
      if (inline?.data) {
        const pcm = decodeM3Audio(Buffer.from(inline.data, "base64"), inline.mimeType ?? "");
        audio.push(pcm);
      }
    }
  };
  if (streaming) {
    if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) throw new M3Error("M3_INVALID_STREAM", "Gemini 没有返回预期的音频流。", 502);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    const frame = (block: string) => {
      const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (data && data !== "[DONE]") consume(JSON.parse(data));
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let separator: RegExpExecArray | null;
        while ((separator = /\r?\n\r?\n/.exec(pending))) {
          frame(pending.slice(0, separator.index));
          pending = pending.slice(separator.index + separator[0].length);
        }
        if (pending.length > 50_000_000) throw new M3Error("M3_INVALID_STREAM", "Gemini 音频流帧超过安全大小上限。", 502);
      }
      pending += decoder.decode();
      if (pending.trim()) frame(pending);
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof M3Error) throw error;
      throw new M3Error(signal.aborted ? "M3_CANCELLED" : timer.aborted ? "M3_TIMEOUT" : "M3_STREAM_ERROR", "Gemini 音频流中断，未交付部分音频。", signal.aborted ? 499 : timer.aborted ? 504 : 502);
    } finally { reader.releaseLock(); }
  } else consume(await response.json());
  if (!completed) throw new M3Error("M3_INCOMPLETE_AUDIO", "Gemini 音频没有完整结束标记，未交付部分音频。", 502);
  if (!audio.length) throw new M3Error("M3_NO_AUDIO", "Gemini 没有返回可用音频。", 502);
  const total = audio.reduce((sum, p) => sum + p.length, 0);
  if (total / 48000 < Math.max(0.25, text.replace(/<[^>]+>/g, "").split(/\s+/).length / (5 * speed))) throw new M3Error("M3_SUSPICIOUSLY_SHORT_AUDIO", "Gemini 返回的音频明显短于稿件，未进入最终拼接。", 502);
  if (audio.length === 1) return audio[0];
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const part of audio) { pcm.set(part, offset); offset += part.length; }
  return pcm;
}

export async function generateM3Program(options: {
  apiKey: string; model: string; voice: string; text: string; speed: number;
  streaming?: boolean;
  signal?: AbortSignal; fetcher?: Fetcher; log?: (event: string, details: Record<string, unknown>) => void;
}) {
  const { apiKey, model, voice, speed } = options;
  const fetcher = options.fetcher ?? fetch;
  const signal = options.signal ?? new AbortController().signal;
  const log = options.log ?? ((event, details) => console.info(event, JSON.stringify(details)));
  const text = prepareM3Text(options.text);
  const style = m3Style(speed);

  // Product rule: Flash and Flash-Lite both accept up to 15,000 characters
  // at the application layer and must synthesize the entire manuscript in
  // exactly ONE audio-generation request. Never split, regroup, or retry.
  const audit: M3Audit = {
    version: M3_VERSION,
    model,
    voice,
    style,
    temperature: M3_TEMPERATURE,
    strategy: "single",
    inputTokens: null,
    ttsRequests: 1,
    retries: 0,
    parts: [],
    transport: options.streaming ? "streamGenerateContent" : "generateContent",
    timings: { upstreamMs: 0, postprocessMs: 0, totalMs: 0 },
  };

  if (signal.aborted) throw new M3Error("M3_CANCELLED", "M3 生成已取消。", 499);

  const totalStartedAt = Date.now();
  const upstreamStartedAt = Date.now();
  let pcm: Uint8Array;
  try {
    pcm = await synthesizeM3Take(
      apiKey,
      model,
      voice,
      text,
      style,
      signal,
      fetcher,
      Boolean(options.streaming),
      speed,
    );
  } catch (error) {
    if (error instanceof M3Error) {
      // Strict single-request policy: no retry and no fallback chunking.
      if (["M3_OUTPUT_LIMIT", "M3_LENGTH_LIMIT"].includes(error.code)) {
        throw new M3Error(
          error.code,
          "Gemini 单次整篇生成达到模型长度上限。按照当前设置不会分段或重试；请缩短稿件后重新生成。",
          error.status,
          error.details,
        );
      }
      if (["M3_TIMEOUT", "M3_UPSTREAM_TIMEOUT"].includes(error.code)) {
        throw new M3Error(
          error.code,
          "Gemini 单次整篇生成超时。按照当前设置不会分段或重试；请直接重新点击生成或缩短稿件。",
          error.status,
          error.details,
        );
      }
    }
    throw error;
  }

  audit.timings.upstreamMs = Date.now() - upstreamStartedAt;
  const postprocessStartedAt = Date.now();

  const silenceCleanup = compressM3InternalSilence(pcm);
  pcm = silenceCleanup.pcm;
  if (silenceCleanup.regions) {
    log("M3_LONG_SILENCE_COMPRESSED", {
      regions: silenceCleanup.regions,
      removedMs: silenceCleanup.removedMs,
    });
  }

  const screening = screenM3Take(pcm);
  const minimumVoicedFrames = pcm.length / 48000 >= 6 ? 18 : 1;
  if (screening.features.voicedFrames < minimumVoicedFrames) {
    throw new M3Error(
      "M3_INSUFFICIENT_VOICED_AUDIO",
      "M3 单次整篇生成没有返回足够的有效语音。按照当前设置不会自动重试。",
      502,
    );
  }
  if (screening.detected) {
    log("VOICE_DRIFT_DETECTED", {
      index: 0,
      attempt: 1,
      score: screening.score,
      comparison: screening.overall,
    });
    throw new M3Error(
      "VOICE_DRIFT_DETECTED",
      "M3 在这一次整篇生成内部检测到持续声线异常。按照当前设置不会分段或重试。",
      502,
      { requests: 1, acceptedChunks: 0 },
    );
  }

  audit.parts.push({
    index: 0,
    characters: text.length,
    seconds: pcm.length / 48000,
    attempts: 1,
    features: screening.features,
    score: screening.score,
    windowWarnings: screening.windows.filter(w => w.comparison.detected).length,
    gainDb: 0,
  });

  audit.timings.postprocessMs = Date.now() - postprocessStartedAt;
  audit.timings.totalMs = Date.now() - totalStartedAt;

  log("M3_PROGRAM_COMPLETE", {
    strategy: "single",
    chunks: 1,
    requests: 1,
    retries: 0,
    model,
    voice,
    silenceRegionsCompressed: silenceCleanup.regions,
    silenceRemovedMs: silenceCleanup.removedMs,
    upstreamMs: audit.timings.upstreamMs,
    postprocessMs: audit.timings.postprocessMs,
    totalMs: audit.timings.totalMs,
  });

  return { wav: joinM3Wav([pcm]), audit };
}
