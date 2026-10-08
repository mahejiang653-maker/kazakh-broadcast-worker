import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { M3StreamingAnomalyGuard, scanM3Signal, planM3Repair, applyM3Plan, isM3Base64, unresolvedM3Low, m3Crc32 } from "./m3-signal";
import { assessM3Signal, decodeM3Audio, joinM3Wav, screenM3Take, type M3Features } from "./m3-audio";
import { M3_VERSION, M3_TEMPERATURE, m3RequestBody, m3Style, prepareM3Text } from "./m3-script";

type Fetcher = typeof fetch;
type AudioCandidate = { index?: number; finishReason?: string; content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }> } };
export class M3Error extends Error {
  constructor(public code: string, message: string, public status = 502, public details?: Record<string, unknown>) { super(message); }
}
export type M3Audit = {
  version: string; model: string; voice: string; style: string; temperature: number;
  strategy: "single"; inputTokens: number | null; ttsRequests: number; retries: number;
  transport: "generateContent" | "streamGenerateContent";
  timings: { upstreamMs: number; firstAudioMs: number | null; postprocessMs: number; totalMs: number };
  integrity: { rawSha256: string; processedSha256: string; rawCrc32: number; processedCrc32: number; rawBytes: number; processedBytes: number; chunks: number; chunkTrace: Array<{ index: number; offset: number; bytes: number; sha256: string }>; contentVerified: false } | null;
  signal: ReturnType<typeof assessM3Signal> | null;
  pitchScreen: "reliable" | "unreliable" | null;
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
async function synthesizeM3Take(apiKey: string, model: string, voice: string, text: string, style: string, signal: AbortSignal, fetcher: Fetcher, streaming: boolean, speed: number, onAudioChunk?: (pcm: Uint8Array) => void) {
  const requestStarted = Date.now();
  const { response, timer } = await googleRequest(fetcher, apiKey, model, streaming ? "streamGenerateContent?alt=sse" : "generateContent", m3RequestBody(text, voice, style), signal, streaming ? 540000 : 230000);
  const audio: Uint8Array[] = [];
  const rawHash = createHash("sha256");
  const chunkTrace: Array<{ index: number; offset: number; bytes: number; sha256: string }> = [];
  let completed = false, bytes = 0, rawCrc32 = 0, firstAudioMs: number | null = null;
  // Fail fast on sustained clearly-invalid audio while preserving every
  // original PCM byte received so far for the diagnostic WAV.
  const streamGuard = streaming ? new M3StreamingAnomalyGuard() : null;
  const started = requestStarted;
  let previousPcm: Uint8Array | null = null, previousVaried = false;
  const recentHashes = new Set<string>();
  const partialIntegrity = () => ({ rawBytes: bytes, rawCrc32, rawSha256: rawHash.copy().digest("hex"), chunks: audio.length, chunkTrace, complete: false });
  const consume = (payload: { candidates?: AudioCandidate[]; error?: { message?: string } }) => {
    if (payload.error) throw new M3Error("M3_STREAM_ERROR", "Gemini 音频流中断，未交付部分音频。", 502);
    const candidate = payload.candidates?.find(c => (c.index ?? 0) === 0);
    if (completed && candidate?.content?.parts?.length) throw new M3Error("M3_AUDIO_AFTER_STOP", "Gemini 在结束标记后继续发送音频，已停止拼接。", 502);
    if (!candidate) return;
    for (const p of candidate.content?.parts ?? []) {
      const inline = p.inlineData ?? (p.inline_data ? { data: p.inline_data.data, mimeType: p.inline_data.mime_type } : undefined);
      if (inline?.data) {
        // Google's documented SSE inlineData is a PCM delta. Never reinterpret it as cumulative.
        // Strict Base64 validation prevents Buffer.from silently accepting corrupt payloads.
        if (!isM3Base64(inline.data)) throw new M3Error("M3_INVALID_BASE64", "Gemini 音频 Base64 损坏。", 502);
        let pcm: Uint8Array;
        try { pcm = decodeM3Audio(Buffer.from(inline.data, "base64"), inline.mimeType ?? ""); }
        catch { throw new M3Error("M3_AUDIO_FORMAT_MISMATCH", "Gemini 音频格式或 PCM 字节对齐异常，未丢帧或补零。", 502); }
        const hash = createHash("sha256").update(pcm).digest("hex");
        // Silence can legitimately repeat; a repeated >=1s nonconstant waveform is ambiguous.
        // Reject it instead of guessing a deduplication that could delete words.
        let varied = false;
        for (let p = 2; p < pcm.length && !varied; p += 2) varied = pcm[p] !== pcm[0] || pcm[p + 1] !== pcm[1];
        if (pcm.length >= 48000 && varied && recentHashes.has(hash)) throw new M3Error("M3_REPEATED_PCM", "Gemini 重复返回同一段 PCM，无法确认全文连续性；未删除或重复累计。", 502);
        if (previousPcm && previousVaried && previousPcm.length >= 48000 && pcm.length > previousPcm.length) {
          const prefixHash = createHash("sha256").update(pcm.subarray(0, previousPcm.length)).digest("hex");
          if (prefixHash === createHash("sha256").update(previousPcm).digest("hex")) throw new M3Error("M3_CUMULATIVE_PCM", "音频块疑似累计数据，已停止重复拼接。", 502);
        }
        if (varied && pcm.length >= 48000) recentHashes.add(hash);
        if (recentHashes.size > 128) recentHashes.delete(recentHashes.values().next().value!);
        if (chunkTrace.length < 24) chunkTrace.push({ index: audio.length, offset: bytes, bytes: pcm.length, sha256: hash });
        firstAudioMs ??= Date.now() - started;
        if (previousPcm && previousVaried && varied && previousPcm.length >= 48000 && pcm.length >= 48000) {
          const tail = createHash("sha256").update(previousPcm.subarray(previousPcm.length - 24000)).digest("hex");
          const head = createHash("sha256").update(pcm.subarray(0, 24000)).digest("hex");
          if (tail === head) throw new M3Error("M3_OVERLAPPING_PCM", "相邻音频块存在重复字节区间，已停止拼接而未猜测删除。", 502);
        }
        rawHash.update(pcm); rawCrc32 = m3Crc32(pcm, rawCrc32); bytes += pcm.length;
        previousPcm = pcm; previousVaried = varied;
        audio.push(pcm);
        onAudioChunk?.(pcm);
        const anomaly = streamGuard?.observe(pcm);
        if (anomaly) {
          const labels = {
            "high-frequency": "持续异常高频噪声",
            "low-frequency": "持续低频嗡声／非语音信号",
            "digital-silence": "持续数字静音",
          };
          throw new M3Error(
            "M3_STREAM_AUDIO_ANOMALY",
            `Gemini 已返回异常音频（约 ${anomaly.startSeconds}–${anomaly.endSeconds} 秒：${labels[anomaly.kind]}）。为了避免持续产生无效音频，已停止本次单一请求；不会自动重试、拆段或把不完整音频标记为完成。原始接收数据保留供诊断。`,
            502,
            { streamingAnomaly: anomaly, integrity: partialIntegrity() },
          );
        }
      }
    }
    if (candidate.finishReason === "MAX_TOKENS") throw new M3Error("M3_OUTPUT_LIMIT", "Gemini 输出达到模型单次长度上限。", 502, { integrity: partialIntegrity() });
    if (candidate.finishReason && candidate.finishReason !== "STOP") throw new M3Error("M3_INCOMPLETE_AUDIO", `Gemini 没有完成全文生成（${candidate.finishReason}）。`, 502, { integrity: partialIntegrity() });
    if (candidate.finishReason === "STOP") completed = true;
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
      if (error instanceof M3Error) { error.details = { ...error.details, integrity: partialIntegrity() }; throw error; }
      throw new M3Error(signal.aborted ? "M3_CANCELLED" : timer.aborted ? "M3_TIMEOUT" : "M3_STREAM_ERROR", "Gemini 音频流中断，未交付部分音频。", signal.aborted ? 499 : timer.aborted ? 504 : 502);
    } finally { reader.releaseLock(); }
  } else consume(await response.json());
  if (!completed) throw new M3Error("M3_INCOMPLETE_AUDIO", "Gemini 音频没有完整结束标记，未交付部分音频。", 502, { integrity: partialIntegrity() });
  if (!audio.length) throw new M3Error("M3_NO_AUDIO", "Gemini 没有返回可用音频。", 502);
  const total = audio.reduce((sum, p) => sum + p.length, 0);
  if (total / 48000 < Math.max(0.25, text.replace(/<[^>]+>/g, "").split(/\s+/).length / (5 * speed))) throw new M3Error("M3_SUSPICIOUSLY_SHORT_AUDIO", "Gemini 返回的音频明显短于稿件，未进入最终拼接。", 502);
  const pcm = audio.length === 1 ? audio[0] : new Uint8Array(total);
  let offset = 0;
  if (audio.length > 1) for (const part of audio) { pcm.set(part, offset); offset += part.length; }
  return { pcm, rawSha256: rawHash.digest("hex"), rawCrc32, chunkTrace, chunks: audio.length, firstAudioMs };
}

export async function generateM3Program(options: {
  apiKey: string; model: string; voice: string; text: string; speed: number;
  streaming?: boolean;
  onAudioChunk?: (pcm: Uint8Array) => void;
  skipWavAssembly?: boolean;
  onDiagnostic?: (stage: "raw" | "processed", pcm: Uint8Array, details: Record<string, unknown>) => void;
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
    timings: { upstreamMs: 0, firstAudioMs: null, postprocessMs: 0, totalMs: 0 },
    integrity: null,
    signal: null,
    pitchScreen: null,
  };

  if (signal.aborted) throw new M3Error("M3_CANCELLED", "M3 生成已取消。", 499);

  const totalStartedAt = Date.now();
  const upstreamStartedAt = Date.now();
  let pcm: Uint8Array;
  try {
    const take = await synthesizeM3Take(
      apiKey,
      model,
      voice,
      text,
      style,
      signal,
      fetcher,
      Boolean(options.streaming),
      speed,
      options.onAudioChunk,
    );
    pcm = take.pcm;
    audit.timings.firstAudioMs = take.firstAudioMs;
    audit.integrity = { rawSha256: take.rawSha256, rawCrc32: take.rawCrc32, rawBytes: pcm.length,
      chunks: take.chunks, chunkTrace: take.chunkTrace, processedSha256: "", processedCrc32: 0, processedBytes: 0, contentVerified: false };
    options.onDiagnostic?.("raw", pcm, { ...audit.integrity });
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

  const originalPcmBytes = pcm.byteLength;
  const scan = scanM3Signal(pcm);
  const activity = scan.summary;
  audit.signal = activity;
  log("M3_PCM_INTEGRITY", {
    ...activity,
    activityDefinition: "acoustic-candidates-not-verified-speech",
    rawSha256: audit.integrity?.rawSha256,
    rawBytes: originalPcmBytes,
    inputCharacters: text.length,
    transport: audit.transport,
  });

  // Never interpret buffered PCM duration as verified spoken duration.
  // A long silent stream and a valid voice with poor pitch tracking must
  // produce different outcomes. No model retry or text splitting is attempted.
  if (activity.longestHighFrequencySeconds >= 3) {
    throw new M3Error("M3_HIGH_FREQUENCY_ARTIFACT", `原始音频存在约 ${activity.longestHighFrequencySeconds} 秒连续异常高频信号，不能当作低音量讲话放大，也不能删除后宣称全文完成。本次未重试；原始音频可用于诊断。`, 502,
      { audioDiagnostics: activity, integrity: audit.integrity });
  }
  const words = text.replace(/<[^>]+>/g, "").match(/\S+/g)?.length ?? 0;
  const minimumActivity = Math.max(0.15, Math.min(1, activity.rawSeconds * 0.02), words / (12 * speed));
  if (activity.activeSeconds < minimumActivity) {
    throw new M3Error(
      "M3_INSUFFICIENT_VOICED_AUDIO",
      `Gemini 返回约 ${activity.rawSeconds} 秒 PCM，宽松声学活动候选约 ${activity.activeSeconds} 秒，独立语音频段证据约 ${activity.speechEvidenceSeconds} 秒；不能证明内容已完整朗读。音频可疑，本次不会重试或拆段。`,
      502,
      { audioDiagnostics: activity, integrity: audit.integrity },
    );
  }

  const silenceCleanup = planM3Repair(scan);
  const unresolved = unresolvedM3Low(scan, silenceCleanup.gains);
  if (unresolved.length) throw new M3Error("M3_UNRESOLVED_LOW_SIGNAL", `原始音频含持续极低电平或低频嗡声区间（最长约 ${Math.round(Math.max(...unresolved.map(r => r.seconds)))} 秒），不能确认其中有可恢复的讲话，已保留原始诊断音频；不会放大噪声、删除区段后冒充全文完成。`, 502,
    { audioDiagnostics: activity, integrity: audit.integrity, unresolved });
  pcm = applyM3Plan(pcm, silenceCleanup.cuts, silenceCleanup.gains);
  if (audit.integrity) {
    audit.integrity.processedSha256 = pcm.byteLength === originalPcmBytes && !silenceCleanup.gains.length ? audit.integrity.rawSha256 : createHash("sha256").update(pcm).digest("hex");
    audit.integrity.processedCrc32 = pcm.byteLength === originalPcmBytes && !silenceCleanup.gains.length ? audit.integrity.rawCrc32 : m3Crc32(pcm);
    audit.integrity.processedBytes = pcm.length;
  }
  options.onDiagnostic?.("processed", pcm, { cuts: silenceCleanup.cuts, gains: silenceCleanup.gains, ...audit.integrity });
  if (silenceCleanup.regions) {
    log("M3_LONG_SILENCE_COMPRESSED", {
      regions: silenceCleanup.regions,
      removedMs: silenceCleanup.removedMs,
    });
  }

  const screening = screenM3Take(pcm);
  const minimumVoicedFrames = pcm.length / 48000 >= 6 ? 18 : 1;
  const reliablePitch = screening.features.voicedFrames >= minimumVoicedFrames;
  audit.pitchScreen = reliablePitch ? "reliable" : "unreliable";
  if (!reliablePitch) {
    log("M3_PITCH_TRACKING_INCONCLUSIVE", {
      voicedFrames: screening.features.voicedFrames,
      activitySeconds: activity.activeSeconds,
      rawSeconds: activity.rawSeconds,
    });
  }
  if (reliablePitch && screening.detected) {
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
    windowWarnings: reliablePitch ? screening.windows.filter(w => w.comparison.detected).length : 0,
    gainDb: Math.max(0, ...silenceCleanup.gains.map(g => g.gainDb)),
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
    gainRegions: silenceCleanup.gains.length,
    rawSha256: audit.integrity?.rawSha256,
    processedSha256: audit.integrity?.processedSha256,
    activitySeconds: activity.activeSeconds,
    rawPcmSeconds: activity.rawSeconds,
    pitchScreen: audit.pitchScreen,
    upstreamMs: audit.timings.upstreamMs,
    postprocessMs: audit.timings.postprocessMs,
    totalMs: audit.timings.totalMs,
  });

  // Live clients already received the original PCM chunks. Avoid allocating
  // another full WAV buffer in this Worker just to discard it.
  return {
    wav: options.skipWavAssembly ? null : joinM3Wav([pcm]),
    audit,
    originalPcmBytes,
    cuts: silenceCleanup.cuts,
    gains: silenceCleanup.gains,
  };
}
