"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OmniVoiceStudio from "./components/OmniVoiceStudio";

const SAMPLE_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const MAX_CHARACTERS = 15000;

const EDGE_VOICES = [
  {
    id: "kk-KZ-DauletNeural",
    name: "Дәулет",
    meta: "原版男声 · 纯哈萨克语推荐",
    mark: "D",
  },
  {
    id: "kk-KZ-AigulNeural",
    name: "Айгүл",
    meta: "原版女声 · 纯哈萨克语推荐",
    mark: "A",
  },
  {
    id: "edge-unified-male",
    name: "统一男声",
    meta: "中哈同音色 · 多语言",
    mark: "M",
  },
  {
    id: "edge-unified-female",
    name: "统一女声",
    meta: "中哈同音色 · 多语言",
    mark: "F",
  },
] as const;

const PRESETS = [
  { id: "news", label: "标准新闻", note: "主持人语调 · 条目开场与收尾", rateFactor: 1.01 },
  { id: "calm", label: "沉稳长稿", note: "沉稳主持 · 条目自然收束", rateFactor: 0.97 },
  { id: "bulletin", label: "简明快讯", note: "快讯主持 · 紧凑条目节奏", rateFactor: 1.045 },
  { id: "expressive", label: "生动播报", note: "主持人表现 · 转场有起伏", rateFactor: 1.01 },
  { id: "story", label: "故事版", note: "博主讲述 · 角色融入 · 情绪对白", rateFactor: 1 },
] as const;

const SPEED_PRESETS = [0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;

const TONE_PRESETS = [
  {
    id: "natural",
    label: "自然真实",
    note: "平衡、接近原声",
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    speakerBoost: true,
  },
  {
    id: "broadcast",
    label: "新闻播音",
    note: "稳定、清晰、有分量",
    stability: 0.72,
    similarityBoost: 0.82,
    style: 0.08,
    speakerBoost: true,
  },
  {
    id: "expressive",
    label: "情绪丰富",
    note: "更有自然起伏",
    stability: 0.28,
    similarityBoost: 0.72,
    style: 0.35,
    speakerBoost: true,
  },
  {
    id: "dramatic",
    label: "强表现力",
    note: "起伏更明显",
    stability: 0.18,
    similarityBoost: 0.65,
    style: 0.55,
    speakerBoost: true,
  },
] as const;


type Engine = "edge" | "eleven" | "omnivoice";
type PresetId = (typeof PRESETS)[number]["id"];
type EmotionAnalysisStatus = "idle" | "analyzing" | "completed" | "failed";
type ElevenVoice = {
  id: string;
  name: string;
  gender: string;
  accent: string;
  age?: string;
  useCase?: string;
  category: string;
  previewUrl?: string;
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `约 ${minutes} 分 ${remainder} 秒`;
}

function describeElevenVoice(item: ElevenVoice) {
  const details = [
    item.gender,
    item.age,
    item.accent,
    item.useCase,
    item.category,
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "ElevenLabs 声线";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number, suffix = "%") {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}


type SafeRangeProps = {
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onValueChange: (value: number) => void;
};

function SafeRange({ ariaLabel, min, max, step, value, onValueChange }: SafeRangeProps) {
  const dragArmedRef = useRef(false);
  const keyboardArmedRef = useRef(false);

  return (
    <input
      aria-label={ariaLabel}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const span = Math.max(1, max - min);
        const fraction = Math.min(1, Math.max(0, (value - min) / span));
        const edgePadding = 12;
        const usableWidth = Math.max(1, rect.width - edgePadding * 2);
        const thumbX = rect.left + edgePadding + usableWidth * fraction;
        const tolerance = event.pointerType === "touch" ? 30 : 20;

        if (Math.abs(event.clientX - thumbX) > tolerance) {
          dragArmedRef.current = false;
          event.preventDefault();
          return;
        }

        dragArmedRef.current = true;
      }}
      onPointerUp={() => {
        dragArmedRef.current = false;
      }}
      onPointerCancel={() => {
        dragArmedRef.current = false;
      }}
      onKeyDown={() => {
        keyboardArmedRef.current = true;
      }}
      onKeyUp={() => {
        keyboardArmedRef.current = false;
      }}
      onBlur={() => {
        dragArmedRef.current = false;
        keyboardArmedRef.current = false;
      }}
      onChange={(event) => {
        if (!dragArmedRef.current && !keyboardArmedRef.current) return;
        onValueChange(Number(event.target.value));
      }}
      style={{
        width: "100%",
        accentColor: "var(--mint)",
        touchAction: "pan-y",
      }}
    />
  );
}

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [engine, setEngine] = useState<Engine>("edge");
  const [voice, setVoice] = useState<string>("kk-KZ-DauletNeural");
  const [preset, setPreset] = useState<PresetId>("news");
  const [speed, setSpeed] = useState(1);
  const [edgePitch, setEdgePitch] = useState(0);
  const [edgeVolume, setEdgeVolume] = useState(0);
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speakerBoost, setSpeakerBoost] = useState(true);
  const [elevenVoices, setElevenVoices] = useState<ElevenVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [audioSettingsDirty, setAudioSettingsDirty] = useState(false);
  const [emotionAnalysisStatus, setEmotionAnalysisStatus] = useState<EmotionAnalysisStatus>("idle");
  const [emotionSentenceCount, setEmotionSentenceCount] = useState(0);
  const audioUrlRef = useRef<string | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );

  const selectedElevenVoice = useMemo(
    () => elevenVoices.find((item) => item.id === voice) ?? null,
    [elevenVoices, voice],
  );

  const selectedPreset = useMemo(
    () => PRESETS.find((item) => item.id === preset) ?? PRESETS[0],
    [preset],
  );

  const estimatedDuration = Math.max(
    2,
    Math.round(
      wordCount /
        (engine === "eleven"
          ? 2.35 * speed
          : 2.4 * speed * selectedPreset.rateFactor),
    ),
  );

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanText = text.trim();

    if (engine !== "edge" || !cleanText) {
      setEmotionAnalysisStatus("idle");
      setEmotionSentenceCount(0);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setEmotionAnalysisStatus("idle");
    setEmotionSentenceCount(0);

    const timer = window.setTimeout(async () => {
      if (!active) return;
      setEmotionAnalysisStatus("analyzing");

      try {
        const response = await fetch("/api/edge-emotion-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { status?: string; sentenceCount?: number }
          | null;

        if (!active) return;
        if (!response.ok || payload?.status !== "completed") {
          setEmotionAnalysisStatus("failed");
          setEmotionSentenceCount(0);
          return;
        }

        setEmotionSentenceCount(
          typeof payload.sentenceCount === "number" ? payload.sentenceCount : 0,
        );
        setEmotionAnalysisStatus("completed");
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setEmotionAnalysisStatus("failed");
        setEmotionSentenceCount(0);
      }
    }, 800);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, engine, preset]);

  function resetAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setGeneratedAt("");
    setAudioSettingsDirty(false);
  }

  function markAudioSettingsDirty() {
    if (audioUrlRef.current) setAudioSettingsDirty(true);
  }

  function resetEmotionAnalysis() {
    setEmotionAnalysisStatus("idle");
    setEmotionSentenceCount(0);
  }

  async function loadElevenVoices() {
    setIsLoadingVoices(true);
    setError("");

    try {
      const response = await fetch("/api/eleven-voices", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; voices?: ElevenVoice[] }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "无法读取 ElevenLabs 声线。");
      }

      const voices = Array.isArray(payload?.voices) ? payload.voices : [];
      if (!voices.length) throw new Error("没有读取到可用的 ElevenLabs 声线。");

      setElevenVoices(voices);
      setVoice((current) =>
        voices.some((item) => item.id === current) ? current : voices[0].id,
      );
    } catch (caught) {
      setElevenVoices([]);
      setVoice("");
      setError(
        caught instanceof Error
          ? caught.message
          : "无法读取 ElevenLabs 声线，请稍后再试。",
      );
    } finally {
      setIsLoadingVoices(false);
    }
  }

  function selectEngine(nextEngine: Engine) {
    if (nextEngine === engine) return;
    setEngine(nextEngine);
    setVoice(
      nextEngine === "edge"
        ? EDGE_VOICES[0].id
        : nextEngine === "eleven"
          ? elevenVoices[0]?.id ?? ""
          : "",
    );
    setError("");
    resetEmotionAnalysis();
    resetAudio();

    if (nextEngine === "eleven" && !elevenVoices.length) {
      void loadElevenVoices();
    }

    if (nextEngine === "omnivoice") {
      window.setTimeout(() => {
        document.getElementById("omnivoice")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }

  function applyTonePreset(item: (typeof TONE_PRESETS)[number]) {
    setStability(item.stability);
    setSimilarityBoost(item.similarityBoost);
    setStyle(item.style);
    setSpeakerBoost(item.speakerBoost);
    setError("");
    resetAudio();
  }

  async function generateAudio() {
    const cleanText = text.trim();
    if (!cleanText) {
      setError("请先粘贴一段哈萨克语文本。");
      return;
    }
    if (cleanText.length > MAX_CHARACTERS) {
      setError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }
    if (engine === "eleven" && !voice) {
      setError("请先读取并选择一个 ElevenLabs 声线。");
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const shouldAnalyzeEmotion = engine === "edge";
      if (shouldAnalyzeEmotion) {
        setEmotionAnalysisStatus("analyzing");
        setEmotionSentenceCount(0);

        const analysisResponse = await fetch("/api/edge-emotion-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
        });
        const analysisPayload = (await analysisResponse.json().catch(() => null)) as
          | { status?: string; sentenceCount?: number; error?: string }
          | null;

        if (!analysisResponse.ok || analysisPayload?.status !== "completed") {
          setEmotionAnalysisStatus("failed");
          throw new Error(analysisPayload?.error || "情绪分析失败，请稍后重试。");
        }

        setEmotionSentenceCount(
          typeof analysisPayload.sentenceCount === "number" ? analysisPayload.sentenceCount : 0,
        );
        setEmotionAnalysisStatus("completed");
      } else {
        resetEmotionAnalysis();
      }

      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanText,
          engine,
          voice,
          preset,
          speed,
          edgePitch,
          edgeVolume,
          stability,
          similarityBoost,
          style,
          speakerBoost,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "语音生成失败，请稍后再试。");
      }

      const audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error("没有收到音频，请重新生成。");

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const nextUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setAudioSettingsDirty(false);
      setGeneratedAt(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : engine === "eleven"
            ? "高质量语音服务暂时繁忙，请稍后重试。"
            : "免费语音服务暂时繁忙，请稍后重试。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function clearText() {
    setText("");
    setError("");
    resetEmotionAnalysis();
    resetAudio();
  }

  const speedControl = (label: string) => (
    <fieldset className="field-block">
      <legend>{label}</legend>
      <div className="textarea-wrap" style={{ padding: "16px 17px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ minWidth: 48, fontWeight: 700, fontSize: 15 }}>
            {speed.toFixed(2)}×
          </span>
          <SafeRange
            ariaLabel={`${label}倍速`}
            min={0.7}
            max={1.2}
            step={0.01}
            value={speed}
            onValueChange={(nextValue) => {
              setSpeed(nextValue);
              markAudioSettingsDirty();
            }}
          />
        </div>
        <div className="preset-grid" style={{ marginTop: 14 }}>
          {SPEED_PRESETS.map((item) => (
            <button
              className={Math.abs(speed - item) < 0.001 ? "preset selected" : "preset"}
              type="button"
              key={item}
              onClick={() => {
                setSpeed(item);
                markAudioSettingsDirty();
              }}
              aria-pressed={Math.abs(speed - item) < 0.001}
            >
              <strong>{item.toFixed(1)}×</strong>
              <small>{item < 1 ? "更慢" : item > 1 ? "更快" : "原速"}</small>
            </button>
          ))}
        </div>
        <small style={{ display: "block", marginTop: 10 }}>
          防误触：请按住圆形滑块再拖动；轻点滑轨不会改变参数。
        </small>
        <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
          <span>精细步进 0.01×</span>
          <span>0.70× – 1.20×</span>
        </div>
      </div>
    </fieldset>
  );

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-signal" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>QAZAQ</strong>
            <small>RADIO VOICE</small>
          </span>
        </a>
        <div className="top-status" aria-label="当前语音模式">
          <span className="status-dot" />
          {engine === "edge"
            ? "免费模式 1 · Edge TTS 增强"
            : engine === "eleven"
              ? "高质量模式 · ElevenLabs v3"
              : "免费模式 2 · KazakhTTS-OmniVoice"}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>ҚАЗАҚША</span>
            <span className="eyebrow-line" />
            <span>KAZAKH TTS</span>
          </div>
          <h1>
            让哈萨克语，
            <em>像新闻一样</em>
            被听见。
          </h1>
          <p className="hero-description">
            现在提供三种播音模式：免费模式 1 为 Edge TTS，免费模式 2 为 KazakhTTS-OmniVoice，高质量模式为 ElevenLabs v3。三种模式均面向哈萨克语播音，并提供各自适配的声线、倍速与表现力控制。Edge 与 ElevenLabs v3 还能自动识别新闻稿中的中文片段。Edge 现在同时提供原版 Дәулет / Айгүл 与统一多语男声 / 女声。原版声线适合纯哈萨克语；统一声线可让中哈混合稿从头到尾保持同一音色。
          </p>
          <div className="feature-row" aria-label="功能特点">
            <span>Edge / OmniVoice / ElevenLabs</span>
            <span>Edge / v3 中哈自动混读</span>
            <span>三种模式均可调倍速</span>
            <span>Edge 音调 / 音量</span>
            <span>MP3 下载</span>
          </div>

          <div className="broadcast-note">
            <div className="broadcast-index">01</div>
            <div>
              <strong>专为哈萨克语稿件设计</strong>
              <p>新闻、短视频旁白、通知与长稿均可使用</p>
            </div>
          </div>
        </div>

        <section className="studio-card" id="studio" aria-labelledby="studio-title">
          <div className="studio-head">
            <div>
              <p className="section-kicker">BROADCAST STUDIO</p>
              <h2 id="studio-title">播音工作台</h2>
            </div>
            <div className="format-badge">MP3</div>
          </div>

          <div className="field-block">
            <div className="field-label-row">
              <label htmlFor="kazakh-text">哈萨克语稿件</label>
              <button className="text-action" type="button" onClick={clearText}>
                清空
              </button>
            </div>
            <div className="textarea-wrap">
              <textarea
                id="kazakh-text"
                value={text}
                maxLength={MAX_CHARACTERS}
                onChange={(event) => {
                  setText(event.target.value);
                  resetEmotionAnalysis();
                  if (error) setError("");
                }}
                placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
                spellCheck={false}
                aria-describedby="character-count"
              />
              {engine === "edge" ? (
                <div
                  aria-live="polite"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 17px",
                    borderTop: "1px solid var(--line)",
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      emotionAnalysisStatus === "completed"
                        ? "var(--mint)"
                        : emotionAnalysisStatus === "failed"
                          ? "#b42318"
                          : "var(--muted)",
                  }}
                >
                  <span aria-hidden="true">
                    {emotionAnalysisStatus === "completed"
                      ? "✓"
                      : emotionAnalysisStatus === "failed"
                        ? "✕"
                        : emotionAnalysisStatus === "analyzing"
                          ? "◌"
                          : "○"}
                  </span>
                  <span>
                    {emotionAnalysisStatus === "completed"
                      ? `情绪分析完成${emotionSentenceCount ? ` · 已分析 ${emotionSentenceCount} 句` : ""}`
                      : emotionAnalysisStatus === "failed"
                        ? "情绪分析失败"
                        : emotionAnalysisStatus === "analyzing"
                          ? "正在分析全文情绪…"
                          : "等待输入完成后自动分析"}
                  </span>
                </div>
              ) : null}
              <div className="textarea-footer" id="character-count">
                <span>{wordCount ? `${wordCount} 个词 · ${formatDuration(estimatedDuration)}` : "等待输入"}</span>
                <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                  {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS.toLocaleString("zh-CN")}
                </span>
              </div>
            </div>
          </div>

          <fieldset className="field-block">
            <legend>语音模式</legend>
            <div className="voice-grid">
              <label className={`voice-option ${engine === "edge" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="edge"
                  checked={engine === "edge"}
                  onChange={() => selectEngine("edge")}
                />
                <span className="voice-avatar">F</span>
                <span className="voice-copy">
                  <strong>免费模式</strong>
                  <small>Edge TTS · 声线 / 倍速 / 音调 / 音量 / 中哈同音色混读</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "eleven" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="eleven"
                  checked={engine === "eleven"}
                  onChange={() => selectEngine("eleven")}
                />
                <span className="voice-avatar">3</span>
                <span className="voice-copy">
                  <strong>高质量模式</strong>
                  <small>ElevenLabs v3 · 声线 / 倍速 / 音色 / 中文自动识别</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "omnivoice" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="omnivoice"
                  checked={engine === "omnivoice"}
                  onChange={() => selectEngine("omnivoice")}
                />
                <span className="voice-avatar">O</span>
                <span className="voice-copy">
                  <strong>免费模式 2</strong>
                  <small>KazakhTTS-OmniVoice · 声线设计 / 倍速 / 质量</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>
            </div>
          </fieldset>

          {engine === "edge" ? (
            <>
              <fieldset className="field-block">
                <legend>选择播音员</legend>
                <div className="voice-grid">
                  {EDGE_VOICES.map((item) => (
                    <label
                      className={`voice-option ${voice === item.id ? "selected" : ""}`}
                      key={item.id}
                    >
                      <input
                        type="radio"
                        name="voice"
                        value={item.id}
                        checked={voice === item.id}
                        onChange={() => {
                          setVoice(item.id);
                          setError("");
                          resetAudio();
                        }}
                      />
                      <span className="voice-avatar">{item.mark}</span>
                      <span className="voice-copy">
                        <strong>{item.name}</strong>
                        <small>{item.meta}</small>
                      </span>
                      <span className="radio-mark" aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </fieldset>

              {speedControl("倍速调节")}

              <fieldset className="field-block">
                <legend>音色与表现力</legend>
                <div className="preset-grid">
                  {PRESETS.map((item) => (
                    <button
                      className={preset === item.id ? "preset selected" : "preset"}
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setPreset(item.id);
                        resetEmotionAnalysis();
                        setError("");
                        resetAudio();
                      }}
                      aria-pressed={preset === item.id}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>

                <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>音调</strong>
                      <span>{signed(edgePitch)}</span>
                    </div>
                    <SafeRange
                      ariaLabel="Edge TTS 音调"
                      min={-20}
                      max={20}
                      step={1}
                      value={edgePitch}
                      onValueChange={(nextValue) => {
                        setEdgePitch(nextValue);
                        markAudioSettingsDirty();
                      }}
                    />
                    <small>降低更沉稳，提高更明亮；新闻建议 -5% 到 +5%</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>音量</strong>
                      <span>{signed(edgeVolume, "dB")}</span>
                    </div>
                    <SafeRange
                      ariaLabel="Edge TTS 音量"
                      min={-8}
                      max={8}
                      step={0.5}
                      value={edgeVolume}
                      onValueChange={(nextValue) => {
                        setEdgeVolume(nextValue);
                        markAudioSettingsDirty();
                      }}
                    />
                    <small>整体增减播音强度；过高可能听起来偏硬</small>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
                    <small>防误触：按住滑块拖动，点击滑轨不会跳值。</small>
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => {
                        setEdgePitch(0);
                        setEdgeVolume(0);
                        markAudioSettingsDirty();
                      }}
                    >
                      恢复默认
                    </button>
                  </div>
                  <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
                    <span>Edge SSML 实时调整</span>
                    <span>无需 ElevenLabs 额度</span>
                  </div>
                </div>
              </fieldset>


              <div className="broadcast-note">
                <div className="broadcast-index">EDGE</div>
                <div>
                  <strong>Edge TTS · 免费真人化模式</strong>
                  <p>支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格；新增长上下文合成与哈萨克语真人化文本前端，尽量减少长稿分段后的语气重置。可选择原版 Дәулет / Айгүл，或统一多语男声 / 女声。原版声线在纯哈萨克稿中保持原始音色；统一声线无论纯哈萨克文还是中哈混合稿都保持同一音色，中文仅切换普通话发音，不消耗 ElevenLabs 额度。</p>
                </div>
              </div>
            </>
          ) : engine === "eleven" ? (
            <>
              <div className="field-block">
                <div className="field-label-row">
                  <label htmlFor="eleven-voice">ElevenLabs 声线</label>
                  <button
                    className="text-action"
                    type="button"
                    onClick={loadElevenVoices}
                    disabled={isLoadingVoices}
                  >
                    {isLoadingVoices ? "读取中…" : elevenVoices.length ? "刷新全部声线" : "读取全部声线"}
                  </button>
                </div>
                <div className="textarea-wrap">
                  <select
                    id="eleven-voice"
                    value={voice}
                    disabled={!elevenVoices.length || isLoadingVoices}
                    onChange={(event) => {
                      setVoice(event.target.value);
                      setError("");
                      resetAudio();
                    }}
                    style={{
                      width: "100%",
                      border: 0,
                      outline: 0,
                      padding: "15px 17px",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  >
                    {!elevenVoices.length ? (
                      <option value="">{isLoadingVoices ? "正在读取 ElevenLabs 声线…" : "点击读取全部声线"}</option>
                    ) : null}
                    {elevenVoices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {describeElevenVoice(item)}
                      </option>
                    ))}
                  </select>
                  <div className="textarea-footer">
                    <span>一次最多读取 500 条账号可用声线</span>
                    <span>{elevenVoices.length ? `已读取 ${elevenVoices.length} 条声线` : "ElevenLabs v3"}</span>
                  </div>
                </div>
                {selectedElevenVoice?.previewUrl ? (
                  <div className="broadcast-note" style={{ marginTop: 10 }}>
                    <div className="broadcast-index">▶</div>
                    <div style={{ width: "100%" }}>
                      <strong>试听当前声线原始示例</strong>
                      <audio
                        controls
                        src={selectedElevenVoice.previewUrl}
                        preload="none"
                        style={{ width: "100%", marginTop: 8 }}
                      >
                        您的浏览器不支持音频播放。
                      </audio>
                    </div>
                  </div>
                ) : null}
              </div>

              {speedControl("倍速调节")}

              <fieldset className="field-block">
                <legend>音色与表现力</legend>
                <div className="preset-grid">
                  {TONE_PRESETS.map((item) => (
                    <button
                      className="preset"
                      type="button"
                      key={item.id}
                      onClick={() => applyTonePreset(item)}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>

                <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>稳定度</strong>
                      <span>{percent(stability)}</span>
                    </div>
                    <input
                      aria-label="稳定度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={stability}
                      onChange={(event) => {
                        setStability(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>低：变化更灵活　高：更稳定一致</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>声线相似度</strong>
                      <span>{percent(similarityBoost)}</span>
                    </div>
                    <input
                      aria-label="声线相似度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={similarityBoost}
                      onChange={(event) => {
                        setSimilarityBoost(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>越高越贴近所选声线的原始音色</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>风格强度</strong>
                      <span>{percent(style)}</span>
                    </div>
                    <input
                      aria-label="风格强度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={style}
                      onChange={(event) => {
                        setStyle(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>越高表演感越强；新闻稿建议低到中等</small>
                  </label>

                  <button
                    className={speakerBoost ? "preset selected" : "preset"}
                    type="button"
                    onClick={() => {
                      setSpeakerBoost((current) => !current);
                      resetAudio();
                    }}
                    aria-pressed={speakerBoost}
                    style={{ width: "100%" }}
                  >
                    <strong>Speaker Boost：{speakerBoost ? "开启" : "关闭"}</strong>
                    <small>增强与所选声线的相似感</small>
                  </button>
                </div>
              </fieldset>


              <div className="broadcast-note">
                <div className="broadcast-index">V3</div>
                <div>
                  <strong>ElevenLabs v3 · 哈萨克语高质量模式</strong>
                  <p>支持最多 500 条账号声线、0.70×–1.20× 精细倍速，以及稳定度、声线相似度和风格强度等音色参数；检测到中文时自动使用 v3 的多语言识别，不再强制整段按哈萨克语解析。</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="broadcast-note" style={{ marginTop: 24 }}>
                <div className="broadcast-index">OV</div>
                <div>
                  <strong>KazakhTTS-OmniVoice · 免费模式 2 已选中</strong>
                  <p>这是共享 GPU 模式，支持男/女声设计、年龄、音高、耳语、倍速和质量档位。下方是它的专用控制区。</p>
                </div>
              </div>
              <button
                className="generate-button"
                type="button"
                onClick={() =>
                  document.getElementById("omnivoice")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="button-icon" aria-hidden="true"><i className="play-triangle" /></span>
                <span>
                  <strong>进入 KazakhTTS-OmniVoice 控制区</strong>
                  <small>免费共享 GPU · 声线设计 + 倍速 + 质量控制</small>
                </span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </>
          )}

          {engine !== "omnivoice" ? (
            <>
          {error ? (
            <div className="error-message" role="alert">
              <span>!</span>
              {error}
            </div>
          ) : null}

          <button
            className="generate-button"
            type="button"
            onClick={generateAudio}
            disabled={
              !text.trim() ||
              isGenerating ||
              (engine === "eleven" && !voice)
            }
          >
            <span className="button-icon" aria-hidden="true">
              {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
            </span>
            <span>
              <strong>
                {isGenerating
                  ? engine === "eleven"
                    ? "正在生成高质量播音…"
                    : "正在生成免费增强播音…"
                  : engine === "eleven"
                    ? voice
                      ? `生成 ElevenLabs v3 · ${speed.toFixed(2)}×`
                      : "正在等待 ElevenLabs 声线"
                    : `生成 Edge TTS · ${speed.toFixed(2)}×`}
              </strong>
              <small>
                {isGenerating
                  ? "请保持页面开启"
                  : engine === "eleven"
                    ? "声线 + 倍速 + 音色参数 · 生成后可试听并下载 MP3"
                    : "声线 + 倍速 + 音调 + 音量 · 免费生成 MP3"}
              </small>
            </span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>

          <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
            <div className="result-topline">
              <div>
                <span className="result-dot" />
                <strong>{audioUrl ? "音频已生成" : "音频播放器"}</strong>
              </div>
              {generatedAt ? <time>{generatedAt}</time> : <span>等待生成</span>}
            </div>

            {audioUrl && audioSettingsDirty ? (
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.6, opacity: 0.72 }}>
                参数已修改 · 当前播放器仍保留上一次生成结果；重新生成后才会应用新参数。
              </p>
            ) : null}

            {audioUrl ? (
              <div className="audio-ready">
                <audio controls src={audioUrl} preload="metadata">
                  您的浏览器不支持音频播放。
                </audio>
                <a className="download-link" href={audioUrl} download="qazaq-radio.mp3">
                  <span aria-hidden="true">↓</span>
                  下载 MP3
                </a>
              </div>
            ) : (
              <div className="empty-player">
                <div className="waveform" aria-hidden="true">
                  {[18, 30, 42, 24, 51, 34, 62, 38, 55, 28, 46, 22, 36, 54, 31, 44, 25, 34].map(
                    (height, index) => <i style={{ height }} key={`${height}-${index}`} />,
                  )}
                </div>
                <p>
                  {engine === "eleven"
                    ? "高质量音频生成后，播放器会出现在这里"
                    : "免费增强音频生成后，播放器会出现在这里"}
                </p>
              </div>
            )}
          </div>
            </>
          ) : null}
        </section>
      </section>

      <OmniVoiceStudio sourceText={text} />

      <footer>
        <p>QAZAQ RADIO VOICE · 哈萨克语播音生成器</p>
        <p>
          免费模式一基于 Edge TTS · 免费模式二使用 KazakhTTS-OmniVoice 公共 Demo · 高质量模式使用 ElevenLabs v3 · API Key 仅保存在 Cloudflare 服务端 · {" "}
          <a href="https://github.com/linshenkx/edge-tts-openai-cf-worker" target="_blank" rel="noreferrer">
            查看免费通道开源项目
          </a>
        </p>
      </footer>
    </main>
  );
}
