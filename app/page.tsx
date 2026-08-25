"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SAMPLE_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const MAX_CHARACTERS = 6000;

const EDGE_VOICES = [
  {
    id: "kk-KZ-DauletNeural",
    name: "Дәулет",
    meta: "男声 · 稳重清晰",
    mark: "D",
  },
  {
    id: "kk-KZ-AigulNeural",
    name: "Айгүл",
    meta: "女声 · 自然明亮",
    mark: "A",
  },
] as const;

const PRESETS = [
  { id: "news", label: "标准新闻", note: "清晰、有分量" },
  { id: "calm", label: "沉稳长稿", note: "稍慢、便于听清" },
  { id: "bulletin", label: "简明快讯", note: "节奏更紧凑" },
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
    note: "更响应情绪标签",
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

const AUDIO_TAGS = [
  { label: "开心", note: "明亮愉快" },
  { label: "兴奋", note: "更有能量" },
  { label: "悲伤", note: "低沉克制" },
  { label: "愤怒", note: "强烈有力" },
  { label: "担心", note: "紧张忧虑" },
  { label: "害怕", note: "恐惧紧张" },
  { label: "惊讶", note: "突然惊喜" },
  { label: "好奇", note: "带探索感" },
  { label: "自信", note: "坚定自信" },
  { label: "严肃", note: "正式克制" },
  { label: "平静", note: "平稳自然" },
  { label: "温柔", note: "柔和轻缓" },
  { label: "小声", note: "耳语效果" },
  { label: "大声", note: "提高强度" },
  { label: "神秘", note: "神秘语气" },
  { label: "轻笑", note: "自然轻笑" },
  { label: "大笑", note: "明显笑声" },
  { label: "叹气", note: "自然叹息" },
  { label: "慢速", note: "放慢这一句" },
  { label: "快速", note: "加快这一句" },
] as const;

type Engine = "edge" | "eleven";
type PresetId = (typeof PRESETS)[number]["id"];
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

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [engine, setEngine] = useState<Engine>("edge");
  const [voice, setVoice] = useState<string>("kk-KZ-DauletNeural");
  const [preset, setPreset] = useState<PresetId>("news");
  const [speed, setSpeed] = useState(1);
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
  const audioUrlRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );

  const selectedElevenVoice = useMemo(
    () => elevenVoices.find((item) => item.id === voice) ?? null,
    [elevenVoices, voice],
  );

  const estimatedDuration = Math.max(
    2,
    Math.round(
      wordCount /
        (engine === "eleven"
          ? 2.35 * speed
          : preset === "bulletin"
            ? 2.7
            : preset === "calm"
              ? 2.1
              : 2.4),
    ),
  );

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
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
        : elevenVoices[0]?.id ?? "",
    );
    setError("");
    resetAudio();

    if (nextEngine === "eleven" && !elevenVoices.length) {
      void loadElevenVoices();
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

  function insertAudioTag(tag: string) {
    const textarea = textareaRef.current;
    const token = `[${tag}]`;

    if (!textarea) {
      setText((current) => `${current}${current ? " " : ""}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? start;
    const prefix = text.slice(0, start);
    const selected = text.slice(start, end);
    const suffix = text.slice(end);

    let insertion: string;
    if (selected) {
      const between = /\s$/u.test(selected) ? "" : " ";
      const after = suffix && !/^\s/u.test(suffix) ? " " : "";
      insertion = `${selected}${between}${token}${after}`;
    } else {
      const before = prefix && !/\s$/u.test(prefix) ? " " : "";
      const after = suffix && !/^\s/u.test(suffix) ? " " : "";
      insertion = `${before}${token}${after}`;
    }

    const nextText = `${prefix}${insertion}${suffix}`;

    if (nextText.length > MAX_CHARACTERS) {
      setError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }

    setText(nextText);
    setError("");
    resetAudio();

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = prefix.length + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    });
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
    resetAudio();
  }

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
          {engine === "edge" ? "免费模式 · Edge TTS" : "高质量模式 · ElevenLabs v3"}
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
            粘贴哈萨克语稿件，在免费 Edge TTS 与 ElevenLabs v3 高质量模式之间切换。高质量模式支持更多声线、倍速、音色细调与句子级情绪标签。
          </p>
          <div className="feature-row" aria-label="功能特点">
            <span>免费 / 高质量双模式</span>
            <span>最多 500 条声线</span>
            <span>0.7×–1.2× 倍速</span>
            <span>句尾情绪标签</span>
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
                ref={textareaRef}
                id="kazakh-text"
                value={text}
                maxLength={MAX_CHARACTERS}
                onChange={(event) => {
                  setText(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
                spellCheck={false}
                aria-describedby="character-count"
              />
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
                  <small>Edge TTS · 无需 ElevenLabs 额度</small>
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
                  <small>ElevenLabs v3 · 声线 / 倍速 / 音色 / 情绪</small>
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

              <fieldset className="field-block">
                <legend>播音节奏</legend>
                <div className="preset-grid">
                  {PRESETS.map((item) => (
                    <button
                      className={preset === item.id ? "preset selected" : "preset"}
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setPreset(item.id);
                        resetAudio();
                      }}
                      aria-pressed={preset === item.id}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
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

              <fieldset className="field-block">
                <legend>倍速调节</legend>
                <div className="textarea-wrap" style={{ padding: "16px 17px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ minWidth: 48, fontWeight: 700, fontSize: 15 }}>
                      {speed.toFixed(2)}×
                    </span>
                    <input
                      aria-label="ElevenLabs 倍速"
                      type="range"
                      min="0.7"
                      max="1.2"
                      step="0.01"
                      value={speed}
                      onChange={(event) => {
                        setSpeed(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
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
                          resetAudio();
                        }}
                        aria-pressed={Math.abs(speed - item) < 0.001}
                      >
                        <strong>{item.toFixed(1)}×</strong>
                        <small>{item < 1 ? "更慢" : item > 1 ? "更快" : "原速"}</small>
                      </button>
                    ))}
                  </div>
                  <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
                    <span>精细步进 0.01×</span>
                    <span>官方范围 0.7× – 1.2×</span>
                  </div>
                </div>
              </fieldset>

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
                    <small>低：更有情绪起伏　高：更稳定一致</small>
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

              <fieldset className="field-block">
                <legend>情绪与表演标签</legend>
                <div className="preset-grid">
                  {AUDIO_TAGS.map((item) => (
                    <button
                      className="preset"
                      type="button"
                      key={item.label}
                      onClick={() => insertAudioTag(item.label)}
                    >
                      <strong>[{item.label}]</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>
                <div className="broadcast-note" style={{ marginTop: 14 }}>
                  <div className="broadcast-index">[ ]</div>
                  <div>
                    <strong>标签写在句子后面，控制它前面的那一句</strong>
                    <p>
                      例如：Бүгін жақсы жаңалық бар! [开心]　生成时网站会自动转换成 Eleven v3 能识别的 Audio Tag。也可以先选中一句话，再点上面的情绪按钮。
                    </p>
                  </div>
                </div>
              </fieldset>

              <div className="broadcast-note">
                <div className="broadcast-index">V3</div>
                <div>
                  <strong>ElevenLabs v3 · 哈萨克语高质量模式</strong>
                  <p>支持最多 500 条账号声线、0.7×–1.2× 精细倍速、音色参数，以及句子级情绪和表演控制。</p>
                </div>
              </div>
            </>
          )}

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
                    : "正在生成免费播音…"
                  : engine === "eleven"
                    ? voice
                      ? `生成 ElevenLabs v3 · ${speed.toFixed(2)}×`
                      : "正在等待 ElevenLabs 声线"
                    : "生成免费哈萨克语播音"}
              </strong>
              <small>
                {isGenerating
                  ? "请保持页面开启"
                  : engine === "eleven"
                    ? "声线 + 倍速 + 音色 + 情绪标签 · 生成后可试听并下载 MP3"
                    : "免费模式 · 生成后可试听并下载 MP3"}
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
                    : "免费音频生成后，播放器会出现在这里"}
                </p>
              </div>
            )}
          </div>
        </section>
      </section>

      <footer>
        <p>QAZAQ RADIO VOICE · 哈萨克语播音生成器</p>
        <p>
          免费模式基于 Edge TTS 开源通道 · 高质量模式使用 ElevenLabs v3 · API Key 仅保存在 Cloudflare 服务端 · {" "}
          <a href="https://github.com/linshenkx/edge-tts-openai-cf-worker" target="_blank" rel="noreferrer">
            查看免费通道开源项目
          </a>
        </p>
      </footer>
    </main>
  );
}
