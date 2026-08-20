"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SAMPLE_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const MAX_CHARACTERS = 6000;

const VOICES = [
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

type VoiceId = (typeof VOICES)[number]["id"];
type PresetId = (typeof PRESETS)[number]["id"];

function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `约 ${minutes} 分 ${remainder} 秒`;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [voice, setVoice] = useState<VoiceId>("kk-KZ-DauletNeural");
  const [preset, setPreset] = useState<PresetId>("news");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const audioUrlRef = useRef<string | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );
  const estimatedDuration = Math.max(
    2,
    Math.round(wordCount / (preset === "bulletin" ? 2.7 : preset === "calm" ? 2.1 : 2.4)),
  );

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

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

    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, voice, preset }),
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
          : "免费语音服务暂时繁忙，请稍后重试。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function clearText() {
    setText("");
    setError("");
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
        <div className="top-status" aria-label="服务状态">
          <span className="status-dot" />
          免费语音通道
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
            粘贴哈萨克语稿件，一键生成自然清晰的播音音频。可直接试听，也可下载为 MP3。
          </p>
          <div className="feature-row" aria-label="功能特点">
            <span>无需密钥</span>
            <span>男 / 女双声线</span>
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
            <legend>选择播音员</legend>
            <div className="voice-grid">
              {VOICES.map((item) => (
                <label
                  className={`voice-option ${voice === item.id ? "selected" : ""}`}
                  key={item.id}
                >
                  <input
                    type="radio"
                    name="voice"
                    value={item.id}
                    checked={voice === item.id}
                    onChange={() => setVoice(item.id)}
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
                  onClick={() => setPreset(item.id)}
                  aria-pressed={preset === item.id}
                >
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

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
            disabled={!text.trim() || isGenerating}
          >
            <span className="button-icon" aria-hidden="true">
              {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
            </span>
            <span>
              <strong>{isGenerating ? "正在生成播音…" : "生成哈萨克语播音"}</strong>
              <small>{isGenerating ? "请保持页面开启" : "生成后可试听并下载 MP3"}</small>
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
                <p>生成后，播放器会出现在这里</p>
              </div>
            )}
          </div>
        </section>
      </section>

      <footer>
        <p>QAZAQ RADIO VOICE · 哈萨克语播音生成器</p>
        <p>
          基于 GitHub 开源项目的免费通道 · 
          <a href="https://github.com/linshenkx/edge-tts-openai-cf-worker" target="_blank" rel="noreferrer">
            查看开源项目
          </a>
        </p>
      </footer>
    </main>
  );
}
