"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_CHARACTERS = 1200;
const VOICE_ID = "kk_KZ-issai-high";
const MODEL_BASE = "/api/piper-model/";
const MODEL_URL =
  MODEL_BASE + "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx";
const MODULE_URL = "/api/piper-runtime/piper-tts-web.js";
const ONNX_BASE = "/api/piper-runtime/onnx/";
const PIPER_BASE = "/api/piper-runtime/piper/";
const CACHE_NAME = "qazaq-piper-local-v1";
const M2_SPEAKER = 0;

type M2Preset = "news" | "calm" | "bulletin" | "expressive" | "story";

const M2_PRESETS: Record<
  M2Preset,
  {
    label: string;
    note: string;
    noiseScale: number;
    lengthScale: number;
    noiseW: number;
    pauseMs: number;
  }
> = {
  news: {
    label: "标准新闻",
    note: "清晰、稳健、适合日常新闻",
    noiseScale: 0.56,
    lengthScale: 0.96,
    noiseW: 0.66,
    pauseMs: 125,
  },
  calm: {
    label: "沉稳长稿",
    note: "更克制、更平稳，适合 3–8 分钟播报",
    noiseScale: 0.5,
    lengthScale: 1.05,
    noiseW: 0.6,
    pauseMs: 165,
  },
  bulletin: {
    label: "简明快讯",
    note: "更紧凑，数字和结论更利落",
    noiseScale: 0.5,
    lengthScale: 0.9,
    noiseW: 0.58,
    pauseMs: 90,
  },
  expressive: {
    label: "表达增强",
    note: "保留新闻感，同时增加少量起伏",
    noiseScale: 0.62,
    lengthScale: 0.98,
    noiseW: 0.74,
    pauseMs: 120,
  },
  story: {
    label: "叙事",
    note: "稍慢、稍自然，适合文化与故事稿",
    noiseScale: 0.59,
    lengthScale: 1.03,
    noiseW: 0.72,
    pauseMs: 155,
  },
};

type PiperResponse = {
  file: Blob;
  duration?: number;
};

type PiperEngine = {
  generate: (text: string, voice: string, speaker?: number) => Promise<PiperResponse>;
  destroy: () => void;
};

type VoiceConfig = {
  inference?: {
    noise_scale?: number;
    length_scale?: number;
    noise_w?: number;
  };
  audio?: {
    sample_rate?: number;
  };
  [key: string]: unknown;
};

type PiperVoiceData = [VoiceConfig, string];

type PiperVoiceProvider = {
  fetch: (voice: string) => Promise<PiperVoiceData>;
  destroy?: () => void;
};

type PiperModule = {
  PiperWebEngine: new (options?: Record<string, unknown>) => PiperEngine;
  OnnxWebRuntime: new (options?: Record<string, unknown>) => unknown;
  PhonemizeWebRuntime: new (options?: Record<string, unknown>) => unknown;
  HuggingFaceVoiceProvider: new (options?: Record<string, unknown>) => PiperVoiceProvider;
};

type LoadState = "idle" | "loading" | "ready" | "error";

type M2Segment = {
  text: string;
  paragraphEnd: boolean;
  keyNumber: boolean;
};

type M2Tuning = {
  noiseScale: number;
  lengthScale: number;
  noiseW: number;
};

class PersistentFetchProvider {
  private memory = new Map<string, unknown>();
  private objectUrls = new Set<string>();
  private onStatus: (message: string) => void;

  constructor(onStatus: (message: string) => void) {
    this.onStatus = onStatus;
  }

  async fetch(url: string) {
    if (this.memory.has(url)) return this.memory.get(url);

    const isJson = url.endsWith(".json");
    const isModel = url.endsWith(".onnx");
    const isPhonemizeData = url.endsWith(".data");

    if (isModel) this.onStatus("正在读取 M2 哈萨克语模型 · 首次约 128 MB");
    else if (isPhonemizeData) this.onStatus("正在加载哈萨克语发音组件");
    else if (isJson) this.onStatus("正在读取 M2 模型配置");

    let response: Response | null = null;

    if ("caches" in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        response = (await cache.match(url)) ?? null;
        if (response && isModel) this.onStatus("已找到本机 M2 模型缓存 · 正在载入");
      } catch {
        response = null;
      }
    }

    if (!response) {
      const network = await fetch(url, { cache: "force-cache" });
      if (!network.ok) throw new Error(`无法下载 M2 资源：${network.status}`);
      response = network;

      if ("caches" in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url, network.clone());
        } catch {
          // Storage quota/private browsing may prevent persistent caching.
        }
      }
    }

    if (isJson) {
      const value = await response.json();
      this.memory.set(url, value);
      return value;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    this.memory.set(url, objectUrl);
    return objectUrl;
  }

  destroy() {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.memory.clear();
  }
}

class M2TunedVoiceProvider implements PiperVoiceProvider {
  private base: PiperVoiceProvider;
  private tuning: M2Tuning = {
    noiseScale: M2_PRESETS.news.noiseScale,
    lengthScale: M2_PRESETS.news.lengthScale,
    noiseW: M2_PRESETS.news.noiseW,
  };

  constructor(base: PiperVoiceProvider) {
    this.base = base;
  }

  setTuning(next: M2Tuning) {
    this.tuning = next;
  }

  async fetch(voice: string): Promise<PiperVoiceData> {
    const [config, modelUrl] = await this.base.fetch(voice);
    return [
      {
        ...config,
        inference: {
          ...(config.inference ?? {}),
          noise_scale: this.tuning.noiseScale,
          length_scale: this.tuning.lengthScale,
          noise_w: this.tuning.noiseW,
        },
      },
      modelUrl,
    ];
  }

  destroy() {
    this.base.destroy?.();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeM2BroadcastText(input: string) {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[，﹐]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[！]/g, "!")
    .replace(/[？]/g, "?")
    .replace(/[；]/g, ";")
    .replace(/[：]/g, ":")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=[^\s\n])/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const KEY_NUMBER_PATTERN =
  /(?:\d+(?:[.,]\d+)?|нөл|бір|екі|үш|төрт|бес|алты|жеті|сегіз|тоғыз|он|жиырма|отыз|қырық|елу|алпыс|жетпіс|сексен|тоқсан|жүз|мың|миллион|миллиард)\s*(?:пайыз|процент|адам|километр|метр|тонна|доллар|еуро|юань|теңге)?/iu;

function splitLongSentence(sentence: string) {
  if (sentence.length <= 190) return [sentence.trim()];
  const parts = sentence
    .split(/(?<=[,;:])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [sentence.trim()];

  const output: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length > 185 && current) {
      output.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) output.push(current);
  return output;
}

function splitM2BroadcastSegments(text: string): M2Segment[] {
  const normalized = normalizeM2BroadcastText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const output: M2Segment[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences =
      paragraph.match(/[^.!?…]+(?:[.!?…]+|$)/gu)?.map((item) => item.trim()).filter(Boolean) ??
      [paragraph];

    const expanded = sentences.flatMap(splitLongSentence);

    expanded.forEach((segment, index) => {
      if (!segment) return;
      const isLast = index === expanded.length - 1;
      output.push({
        text: segment,
        paragraphEnd: isLast && paragraphIndex < paragraphs.length - 1,
        keyNumber: KEY_NUMBER_PATTERN.test(segment),
      });
    });
  });

  // Avoid dozens of tiny local inference calls. Short neighbors are merged while
  // preserving paragraph boundaries and the key-number flag.
  const compact: M2Segment[] = [];
  for (const item of output) {
    const previous = compact[compact.length - 1];
    if (
      previous &&
      !previous.paragraphEnd &&
      previous.text.length < 55 &&
      item.text.length < 95 &&
      previous.text.length + item.text.length < 150
    ) {
      previous.text = `${previous.text} ${item.text}`;
      previous.paragraphEnd = item.paragraphEnd;
      previous.keyNumber = previous.keyNumber || item.keyNumber;
    } else {
      compact.push({ ...item });
    }
  }

  return compact.slice(0, 30);
}

function tuningForSegment(
  preset: M2Preset,
  speed: number,
  segment: M2Segment,
  index: number,
  total: number,
): M2Tuning {
  const base = M2_PRESETS[preset];
  let lengthScale = base.lengthScale / clamp(speed, 0.85, 1.15);
  let noiseScale = base.noiseScale;
  let noiseW = base.noiseW;

  if (segment.keyNumber) {
    // Important quantities should be slightly slower and more deterministic.
    lengthScale *= 1.025;
    noiseScale *= 0.94;
    noiseW *= 0.95;
  }

  if (index === 0) {
    // A firmer first sentence helps the speaker enter the bulletin cleanly.
    lengthScale *= 0.985;
    noiseScale *= 0.97;
  }

  if (index === total - 1) {
    // Avoid an over-slow synthetic tail: keep the final sentence supported
    // rather than letting it sag into a weak/creaky closure.
    lengthScale *= 0.985;
    noiseW *= 0.94;
  }

  return {
    noiseScale: clamp(noiseScale, 0.42, 0.72),
    lengthScale: clamp(lengthScale, 0.78, 1.22),
    noiseW: clamp(noiseW, 0.5, 0.82),
  };
}

function readPcm16Wav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44) throw new Error("M2 返回的 WAV 数据不完整。");
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bits = view.getUint16(34, true);
  if (channels !== 1 || bits !== 16) {
    throw new Error("M2 WAV 格式暂不支持本地拼接。");
  }
  const dataSize = view.getUint32(40, true);
  const available = Math.min(dataSize, view.byteLength - 44);
  const samples = new Int16Array(Math.floor(available / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(44 + index * 2, true);
  }
  return { sampleRate, samples };
}

function buildWav(sampleRate: number, samples: Int16Array) {
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + samples.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46464952, true);
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true);
  view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true);
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }
  return new Blob([buffer], { type: "audio/x-wav" });
}

async function mergeM2Wavs(
  blobs: Blob[],
  segments: M2Segment[],
  preset: M2Preset,
) {
  const decoded = await Promise.all(
    blobs.map(async (blob) => readPcm16Wav(await blob.arrayBuffer())),
  );
  if (!decoded.length) throw new Error("没有可合并的 M2 音频。");

  const sampleRate = decoded[0].sampleRate;
  const basePause = M2_PRESETS[preset].pauseMs;
  const pauseSamples = decoded.map((_, index) => {
    if (index === decoded.length - 1) return 0;
    const segment = segments[index];
    const ms = segment.paragraphEnd ? basePause + 110 : basePause;
    return Math.round((sampleRate * ms) / 1000);
  });

  const total = decoded.reduce(
    (sum, item, index) => sum + item.samples.length + pauseSamples[index],
    0,
  );
  const joined = new Int16Array(total);
  let cursor = 0;

  decoded.forEach((item, index) => {
    joined.set(item.samples, cursor);
    cursor += item.samples.length;
    cursor += pauseSamples[index];
  });

  return buildWav(sampleRate, joined);
}

function sampleUrl() {
  return "/api/piper-sample?speaker=0";
}

export default function PiperLocalStudio({ sourceText }: { sourceText?: string }) {
  const [text, setText] = useState(
    sourceText?.slice(0, MAX_CHARACTERS) ||
      "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға бірге назар аударайық.",
  );
  const [preset, setPreset] = useState<M2Preset>("news");
  const [speed, setSpeed] = useState(1);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadMessage, setLoadMessage] = useState(
    "尚未加载 · 首次使用会下载约 128 MB M2 哈萨克语模型",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [error, setError] = useState("");
  const [modelCached, setModelCached] = useState(false);

  const engineRef = useRef<PiperEngine | null>(null);
  const providerRef = useRef<PersistentFetchProvider | null>(null);
  const tunedProviderRef = useRef<M2TunedVoiceProvider | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );

  useEffect(() => {
    if (sourceText !== undefined) {
      setText(sourceText.slice(0, MAX_CHARACTERS));
      if (sourceText.length > MAX_CHARACTERS) {
        setError(
          `M2 本地版单次最多 ${MAX_CHARACTERS} 个字符，已同步前 ${MAX_CHARACTERS} 个字符。`,
        );
      }
      resetAudio();
    }
  }, [sourceText]);

  useEffect(() => {
    let active = true;

    async function checkCache() {
      if (!("caches" in window)) return;
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(MODEL_URL);
        if (!active) return;
        setModelCached(Boolean(cached));
        if (cached) setLoadMessage("检测到本机 M2 模型缓存 · 可直接载入");
      } catch {
        // Cache Storage is optional.
      }
    }

    void checkCache();
    return () => {
      active = false;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      engineRef.current?.destroy();
      providerRef.current?.destroy();
    };
  }, []);

  function resetAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setGeneratedAt("");
  }

  async function ensureStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      // Best-effort only.
    }
  }

  async function loadEngine() {
    if (engineRef.current) return engineRef.current;

    setLoadState("loading");
    setError("");
    setLoadMessage(
      modelCached
        ? "正在从本机缓存载入 M2 哈萨克语模型"
        : "首次加载需要下载 M2 模型与浏览器推理组件 · 建议使用 Wi-Fi",
    );

    try {
      await ensureStorage();

      const moduleUrl = MODULE_URL;
      setLoadMessage("正在通过本站加载 Piper 浏览器引擎");
      const mod = (await import(/* @vite-ignore */ moduleUrl)) as unknown as PiperModule;
      const provider = new PersistentFetchProvider(setLoadMessage);
      const baseVoiceProvider = new mod.HuggingFaceVoiceProvider({
        provider,
        baseUrl: MODEL_BASE,
      });
      const tunedVoiceProvider = new M2TunedVoiceProvider(baseVoiceProvider);
      const onnxRuntime = new mod.OnnxWebRuntime({
        basePath: ONNX_BASE,
        numThreads: 1,
      });
      const phonemizeRuntime = new mod.PhonemizeWebRuntime({
        provider,
        basePath: PIPER_BASE,
      });
      const engine = new mod.PiperWebEngine({
        onnxRuntime,
        phonemizeRuntime,
        voiceProvider: tunedVoiceProvider,
      });

      await tunedVoiceProvider.fetch(VOICE_ID);

      providerRef.current = provider;
      tunedProviderRef.current = tunedVoiceProvider;
      engineRef.current = engine;
      setLoadState("ready");
      setModelCached(true);
      setLoadMessage("M2 本地引擎已就绪 · 专属新闻参数已启用");
      return engine;
    } catch (caught) {
      setLoadState("error");
      const message =
        caught instanceof Error ? caught.message : "M2 本地引擎加载失败。";
      setError(
        `${message} 首次加载需要较大的浏览器内存与存储空间；可稍后重试。`,
      );
      setLoadMessage("M2 加载失败");
      throw caught;
    }
  }

  async function generate() {
    const clean = normalizeM2BroadcastText(text);
    if (!clean) {
      setError("请先输入哈萨克语文本。");
      return;
    }
    if (clean.length > MAX_CHARACTERS) {
      setError(`M2 本地版文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }

    setIsGenerating(true);
    setError("");
    resetAudio();

    try {
      const engine = await loadEngine();
      const tunedProvider = tunedProviderRef.current;
      if (!tunedProvider) throw new Error("M2 专属参数模块尚未就绪。");

      const segments = splitM2BroadcastSegments(clean);
      if (!segments.length) throw new Error("没有可生成的有效句子。");

      const blobs: Blob[] = [];
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const tuning = tuningForSegment(preset, speed, segment, index, segments.length);
        tunedProvider.setTuning(tuning);
        setLoadMessage(
          `正在本机生成 M2 · ${index + 1}/${segments.length} · ${M2_PRESETS[preset].label}`,
        );
        const response = await engine.generate(segment.text, VOICE_ID, M2_SPEAKER);
        if (!response.file?.size) throw new Error("M2 没有返回有效音频。");
        blobs.push(response.file);
      }

      setLoadMessage("正在合并 M2 新闻节奏与段落停顿");
      const merged = await mergeM2Wavs(blobs, segments, preset);
      const nextUrl = URL.createObjectURL(merged);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setGeneratedAt(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setLoadState("ready");
      setLoadMessage(
        `M2 生成完成 · ${segments.length} 个播音片段 · ${M2_PRESETS[preset].label}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "M2 本地生成失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="hero" id="piper-local" style={{ paddingTop: 0 }}>
      <div className="hero-copy">
        <div className="eyebrow">
          <span>FREE 03</span>
          <span className="eyebrow-line" />
          <span>PIPER · M2</span>
        </div>
        <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5.2rem)" }}>
          M2 青年感男声，
          <em>专门为哈萨克语播音调校。</em>
        </h1>
        <p className="hero-description">
          免费模式 3 现在只保留 M2。它完全不经过 Edge，使用 Piper + ISSAI KazakhTTS2 在浏览器本机生成，并按 Дәулет 的思路加入专属新闻预设、长句保护、数字清晰度、段落节奏和尾句防拖慢。
        </p>
        <div className="feature-row" aria-label="M2 本地播音功能">
          <span>非 Edge 引擎</span>
          <span>M2 单一主声线</span>
          <span>模型级新闻参数</span>
          <span>数字清晰增强</span>
          <span>长句自动分段</span>
          <span>段落节奏合并</span>
        </div>
        <div className="broadcast-note">
          <div className="broadcast-index">M2</div>
          <div>
            <strong>{loadMessage}</strong>
            <p>
              M2 高质量模型首次约 128 MB。下载成功后优先使用浏览器本地缓存；生成过程和 WAV 合并均在本机完成。
            </p>
          </div>
        </div>
      </div>

      <section className="studio-card" aria-labelledby="piper-title">
        <div className="studio-head">
          <div>
            <p className="section-kicker">FREE STUDIO 03</p>
            <h2 id="piper-title">M2 · 青年感男声</h2>
          </div>
          <div className="format-badge">WAV</div>
        </div>

        <div className="field-block">
          <div className="field-label-row">
            <label htmlFor="piper-text">哈萨克语稿件</label>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                const copied = sourceText?.trim()
                  ? sourceText.slice(0, MAX_CHARACTERS)
                  : text;
                setText(copied);
                setError(
                  sourceText && sourceText.length > MAX_CHARACTERS
                    ? `已复制前 ${MAX_CHARACTERS} 个字符用于 M2 本地生成。`
                    : "",
                );
                resetAudio();
              }}
            >
              复制上方稿件
            </button>
          </div>
          <div className="textarea-wrap">
            <textarea
              id="piper-text"
              value={text}
              maxLength={MAX_CHARACTERS}
              onChange={(event) => {
                setText(event.target.value);
                setError("");
                resetAudio();
              }}
              placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
              spellCheck={false}
            />
            <div className="textarea-footer">
              <span>{wordCount ? `${wordCount} 个词 · M2 本地推理` : "等待输入"}</span>
              <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS}
              </span>
            </div>
          </div>
        </div>

        <fieldset className="field-block">
          <legend>M2 播音预设</legend>
          <div className="preset-grid">
            {(Object.entries(M2_PRESETS) as Array<[M2Preset, (typeof M2_PRESETS)[M2Preset]]>).map(
              ([key, item]) => (
                <button
                  className={`preset ${preset === key ? "selected" : ""}`}
                  type="button"
                  key={key}
                  onClick={() => {
                    setPreset(key);
                    resetAudio();
                  }}
                >
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </button>
              ),
            )}
          </div>
        </fieldset>

        <div className="slider-grid">
          <div className="slider-field">
            <div className="slider-header">
              <label htmlFor="m2-speed">倍速</label>
              <output>{speed.toFixed(2)}×</output>
            </div>
            <input
              id="m2-speed"
              type="range"
              min="0.85"
              max="1.15"
              step="0.01"
              value={speed}
              onChange={(event) => {
                setSpeed(Number(event.target.value));
                resetAudio();
              }}
            />
            <p>直接改变 Piper 模型的 length_scale，不是播放器后期拉速。</p>
          </div>
        </div>

        <div className="broadcast-note">
          <div className="broadcast-index">M2</div>
          <div style={{ width: "100%" }}>
            <strong>官方 M2 原始样音</strong>
            <p style={{ marginBottom: 8 }}>
              用它和下面生成后的“M2 新闻增强版”对比，能更直观判断调校效果。
            </p>
            <audio
              controls
              src={sampleUrl()}
              preload="metadata"
              style={{ width: "100%" }}
            >
              您的浏览器不支持音频播放。
            </audio>
          </div>
        </div>

        <div className="broadcast-note">
          <div className="broadcast-index">{modelCached ? "✓" : "↓"}</div>
          <div>
            <strong>{modelCached ? "检测到本机 M2 模型缓存" : "首次使用需要下载 M2 高质量模型"}</strong>
            <p>
              模型只在点击加载/生成时下载。生成时会自动按句切分、对数字句轻微放慢，并在段落间加入稳定广播停顿。
            </p>
          </div>
        </div>

        {loadState !== "ready" ? (
          <button
            className="preset"
            type="button"
            onClick={() => void loadEngine()}
            disabled={loadState === "loading"}
            style={{ width: "100%", marginTop: 14 }}
          >
            <strong>{loadState === "loading" ? "正在加载 M2…" : "加载 M2 本地引擎"}</strong>
            <small>{modelCached ? "优先读取本机缓存" : "首次约 128 MB · 建议 Wi-Fi"}</small>
          </button>
        ) : null}

        {error ? (
          <div className="error-message" role="alert">
            <span>!</span>
            {error}
          </div>
        ) : null}

        <button
          className="generate-button"
          type="button"
          onClick={generate}
          disabled={!text.trim() || isGenerating || loadState === "loading"}
        >
          <span className="button-icon" aria-hidden="true">
            {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
          </span>
          <span>
            <strong>
              {isGenerating
                ? "正在生成 M2 新闻增强版"
                : `用 M2 生成 · ${M2_PRESETS[preset].label}`}
            </strong>
            <small>非 Edge · M2 专属参数 · {speed.toFixed(2)}× · 本机 WAV</small>
          </span>
          <span className="button-arrow" aria-hidden="true">→</span>
        </button>

        <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
          <div className="result-topline">
            <div>
              <span className="result-dot" />
              <strong>{audioUrl ? "M2 新闻增强版已生成" : "M2 本地播放器"}</strong>
            </div>
            {generatedAt ? <time>{generatedAt}</time> : <span>{loadState === "ready" ? "引擎已就绪" : "等待加载"}</span>}
          </div>
          {audioUrl ? (
            <div className="audio-ready">
              <audio controls src={audioUrl} preload="metadata">
                您的浏览器不支持音频播放。
              </audio>
              <a
                className="download-link"
                href={audioUrl}
                download="qazaq-piper-m2-broadcast.wav"
              >
                <span aria-hidden="true">↓</span>
                下载 M2 WAV
              </a>
            </div>
          ) : (
            <div className="empty-player">
              <div className="waveform" aria-hidden="true">
                {[18, 30, 42, 24, 51, 34, 62, 38, 55, 28, 46, 22, 36, 54, 31, 44, 25, 34].map(
                  (height, index) => <i style={{ height }} key={`${height}-${index}`} />,
                )}
              </div>
              <p>M2 会按新闻句法分段本地生成，再合并成一个连续 WAV。</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
