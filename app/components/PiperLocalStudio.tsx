"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_CHARACTERS = 800;
const VOICE_ID = "kk_KZ-issai-high";
const MODEL_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/";
const MODEL_URL = MODEL_BASE + "kk_KZ-issai-high.onnx";
const SAMPLE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/samples/";
const MODULE_URL =
  "https://cdn.jsdelivr.net/npm/piper-tts-web@1.1.2/dist/piper-tts-web.js";
const ONNX_BASE =
  "https://cdn.jsdelivr.net/npm/piper-tts-web@1.1.2/dist/onnx/";
const PIPER_BASE =
  "https://cdn.jsdelivr.net/npm/piper-tts-web@1.1.2/dist/piper/";
const CACHE_NAME = "qazaq-piper-local-v1";

const SPEAKERS = [
  { id: 0, name: "M2", meta: "ISSAI KazakhTTS2 · 男声", mark: "M2" },
  { id: 1, name: "Iseke", meta: "ISSAI KazakhTTS · 男声", mark: "M1" },
  { id: 2, name: "F3", meta: "ISSAI KazakhTTS2 · 女声", mark: "F3" },
  { id: 3, name: "Raya", meta: "ISSAI KazakhTTS · 女声", mark: "R" },
  { id: 4, name: "F1", meta: "ISSAI KazakhTTS2 · 女声", mark: "F1" },
  { id: 5, name: "F2", meta: "ISSAI KazakhTTS2 · 女声", mark: "F2" },
] as const;

type PiperResponse = {
  file: Blob;
  duration?: number;
};

type PiperEngine = {
  generate: (text: string, voice: string, speaker?: number) => Promise<PiperResponse>;
  destroy: () => void;
};

type PiperVoiceProvider = {
  fetch: (voice: string) => Promise<unknown>;
};

type PiperModule = {
  PiperWebEngine: new (options?: Record<string, unknown>) => PiperEngine;
  OnnxWebRuntime: new (options?: Record<string, unknown>) => unknown;
  PhonemizeWebRuntime: new (options?: Record<string, unknown>) => unknown;
  HuggingFaceVoiceProvider: new (options?: Record<string, unknown>) => PiperVoiceProvider;
};

type LoadState = "idle" | "loading" | "ready" | "error";

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

    if (isModel) this.onStatus("正在读取 Piper 哈萨克语模型 · 首次约 128 MB");
    else if (isPhonemizeData) this.onStatus("正在加载哈萨克语发音组件");
    else if (isJson) this.onStatus("正在读取模型配置");

    let response: Response | null = null;

    if ("caches" in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        response = (await cache.match(url)) ?? null;
        if (response && isModel) this.onStatus("已找到本机模型缓存 · 正在载入");
      } catch {
        response = null;
      }
    }

    if (!response) {
      const network = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!network.ok) throw new Error(`无法下载 Piper 资源：${network.status}`);
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

function sampleUrl(speaker: number) {
  return `${SAMPLE_BASE}speaker_${speaker}.mp3`;
}

export default function PiperLocalStudio({ sourceText }: { sourceText?: string }) {
  const [text, setText] = useState(
    sourceText?.slice(0, MAX_CHARACTERS) ||
      "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға бірге назар аударайық.",
  );
  const [speaker, setSpeaker] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadMessage, setLoadMessage] = useState(
    "尚未加载 · 首次使用会下载约 128 MB 哈萨克语模型",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [error, setError] = useState("");
  const [modelCached, setModelCached] = useState(false);

  const engineRef = useRef<PiperEngine | null>(null);
  const providerRef = useRef<PersistentFetchProvider | null>(null);
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
          `Piper 本地试听版单次最多 ${MAX_CHARACTERS} 个字符，已同步前 ${MAX_CHARACTERS} 个字符。`,
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
        if (cached) setLoadMessage("检测到本机 Piper 模型缓存 · 可直接载入");
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
        ? "正在从本机缓存载入 Piper 哈萨克语模型"
        : "首次加载需要下载模型与浏览器推理组件 · 建议使用 Wi-Fi",
    );

    try {
      await ensureStorage();

      const moduleUrl = MODULE_URL;
      const mod = (await import(/* @vite-ignore */ moduleUrl)) as unknown as PiperModule;
      const provider = new PersistentFetchProvider(setLoadMessage);
      const voiceProvider = new mod.HuggingFaceVoiceProvider({ provider });
      const onnxRuntime = new mod.OnnxWebRuntime({
        basePath: ONNX_BASE,
        // Single-threaded WASM works on normal mobile pages without requiring
        // cross-origin isolation / SharedArrayBuffer.
        numThreads: 1,
      });
      const phonemizeRuntime = new mod.PhonemizeWebRuntime({
        provider,
        basePath: PIPER_BASE,
      });
      const engine = new mod.PiperWebEngine({
        onnxRuntime,
        phonemizeRuntime,
        voiceProvider,
      });

      // Prefetch the six-speaker Kazakh model now. generate() reuses the same
      // provider URLs, so inference starts without a second network download.
      await voiceProvider.fetch(VOICE_ID);

      providerRef.current = provider;
      engineRef.current = engine;
      setLoadState("ready");
      setModelCached(true);
      setLoadMessage("Piper 本地引擎已就绪 · 六个哈萨克语说话人可直接切换");
      return engine;
    } catch (caught) {
      setLoadState("error");
      const message =
        caught instanceof Error ? caught.message : "Piper 本地引擎加载失败。";
      setError(
        `${message} 首次加载需要较大的浏览器内存与存储空间；可换 Wi-Fi/Chrome 后重试。`,
      );
      setLoadMessage("Piper 加载失败");
      throw caught;
    }
  }

  async function generate() {
    const clean = text.trim();
    if (!clean) {
      setError("请先输入哈萨克语文本。");
      return;
    }
    if (clean.length > MAX_CHARACTERS) {
      setError(`Piper 本地试听版文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }

    setIsGenerating(true);
    setError("");
    resetAudio();

    try {
      const engine = await loadEngine();
      setLoadMessage(`正在本机生成 · Speaker ${speaker}`);
      const response = await engine.generate(clean, VOICE_ID, speaker);
      if (!response.file?.size) throw new Error("Piper 没有返回有效音频。");

      const nextUrl = URL.createObjectURL(response.file);
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
        typeof response.duration === "number"
          ? `本机生成完成 · 约 ${Math.max(1, Math.round(response.duration / 1000))} 秒`
          : "本机生成完成",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Piper 本地生成失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  const selected = SPEAKERS.find((item) => item.id === speaker) ?? SPEAKERS[0];

  return (
    <section className="hero" id="piper-local" style={{ paddingTop: 0 }}>
      <div className="hero-copy">
        <div className="eyebrow">
          <span>FREE 03</span>
          <span className="eyebrow-line" />
          <span>PIPER LOCAL</span>
        </div>
        <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5.2rem)" }}>
          第三个免费板块，
          <em>六种真人声线。</em>
        </h1>
        <p className="hero-description">
          使用 Piper + ISSAI KazakhTTS 多说话人模型。语音在浏览器本机生成，不经过 Edge，也不需要 ElevenLabs 额度。先试听六个官方样音，再选出你觉得最年轻、最适合新闻播音的声线。
        </p>
        <div className="feature-row" aria-label="Piper Local 功能">
          <span>非 Edge 引擎</span>
          <span>6 个哈萨克语说话人</span>
          <span>浏览器本地生成</span>
          <span>无需 API Key</span>
          <span>官方样音先试听</span>
          <span>WAV 下载</span>
        </div>
        <div className="broadcast-note">
          <div className="broadcast-index">LOCAL</div>
          <div>
            <strong>{loadMessage}</strong>
            <p>
              首次加载模型约 128 MB，并额外加载浏览器推理组件。模型缓存成功后后续访问会更快；手机建议在 Wi-Fi 下首次加载。
            </p>
          </div>
        </div>
      </div>

      <section className="studio-card" aria-labelledby="piper-title">
        <div className="studio-head">
          <div>
            <p className="section-kicker">FREE STUDIO 03</p>
            <h2 id="piper-title">Piper · KazakhTTS2</h2>
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
                    ? `已复制前 ${MAX_CHARACTERS} 个字符用于 Piper 声线试听。`
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
              <span>{wordCount ? `${wordCount} 个词 · 本机推理` : "等待输入"}</span>
              <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS}
              </span>
            </div>
          </div>
        </div>

        <fieldset className="field-block">
          <legend>六个官方说话人</legend>
          <div className="voice-grid">
            {SPEAKERS.map((item) => (
              <label className={`voice-option ${speaker === item.id ? "selected" : ""}`} key={item.id}>
                <input
                  type="radio"
                  name="piper-speaker"
                  value={item.id}
                  checked={speaker === item.id}
                  onChange={() => {
                    setSpeaker(item.id);
                    resetAudio();
                  }}
                />
                <span className="voice-avatar">{item.mark}</span>
                <span className="voice-copy">
                  <strong>{item.name}</strong>
                  <small>{item.meta} · Speaker {item.id}</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="broadcast-note">
          <div className="broadcast-index">▶</div>
          <div style={{ width: "100%" }}>
            <strong>先试听官方样音 · {selected.name}</strong>
            <p style={{ marginBottom: 8 }}>
              这一步不下载 128 MB 模型。听完六个样音后，你可以直接告诉我哪个最年轻，我再把它固定成“青年推荐声线”。
            </p>
            <audio controls src={sampleUrl(speaker)} preload="none" style={{ width: "100%" }}>
              您的浏览器不支持音频播放。
            </audio>
          </div>
        </div>

        <div className="broadcast-note">
          <div className="broadcast-index">{modelCached ? "✓" : "↓"}</div>
          <div>
            <strong>{modelCached ? "检测到本机模型缓存" : "首次使用需要下载本地模型"}</strong>
            <p>
              Piper 模型只在你点击加载/生成时下载。浏览器隐私模式、存储空间不足或清理站点数据后可能需要重新下载。
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
            <strong>{loadState === "loading" ? "正在加载 Piper…" : "加载 Piper 本地引擎"}</strong>
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
                ? `正在本机生成 · ${selected.name}`
                : `用 ${selected.name} 生成 Piper 本地语音`}
            </strong>
            <small>完全非 Edge · Speaker {speaker} · 生成后可试听和下载 WAV</small>
          </span>
          <span className="button-arrow" aria-hidden="true">→</span>
        </button>

        <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
          <div className="result-topline">
            <div>
              <span className="result-dot" />
              <strong>{audioUrl ? `Piper ${selected.name} 已生成` : "Piper 本地播放器"}</strong>
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
                download={`qazaq-piper-${selected.name.toLowerCase()}.wav`}
              >
                <span aria-hidden="true">↓</span>
                下载 WAV
              </a>
            </div>
          ) : (
            <div className="empty-player">
              <div className="waveform" aria-hidden="true">
                {[18, 30, 42, 24, 51, 34, 62, 38, 55, 28, 46, 22, 36, 54, 31, 44, 25, 34].map(
                  (height, index) => <i style={{ height }} key={`${height}-${index}`} />,
                )}
              </div>
              <p>先试听六个官方样音；需要正式生成时再加载本地模型。</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
