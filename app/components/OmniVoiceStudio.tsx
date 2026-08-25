"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_CHARACTERS = 1200;
const DEFAULT_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const SPEED_PRESETS = [0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;

const QUALITY_PRESETS = [
  { id: "fast", label: "极速模式", note: "推荐 · 最快出结果", steps: 8, guidance: 1.3 },
  { id: "standard", label: "标准模式", note: "速度与质量平衡", steps: 12, guidance: 1.6 },
  { id: "quality", label: "高质量", note: "细节更完整", steps: 16, guidance: 2.0 },
  { id: "detail", label: "细腻表现", note: "较慢 · 表现更细", steps: 24, guidance: 2.1 },
] as const;

const VOICE_PRESETS = [
  {
    label: "新闻男声",
    note: "中年 · 中音调",
    gender: "Male / 男",
    age: "Middle-aged / 中年",
    pitch: "Moderate Pitch / 中音调",
    style: "Auto",
  },
  {
    label: "沉稳男声",
    note: "中年 · 低音调",
    gender: "Male / 男",
    age: "Middle-aged / 中年",
    pitch: "Low Pitch / 低音调",
    style: "Auto",
  },
  {
    label: "新闻女声",
    note: "青年 · 中音调",
    gender: "Female / 女",
    age: "Young Adult / 青年",
    pitch: "Moderate Pitch / 中音调",
    style: "Auto",
  },
  {
    label: "明亮女声",
    note: "青年 · 高音调",
    gender: "Female / 女",
    age: "Young Adult / 青年",
    pitch: "High Pitch / 高音调",
    style: "Auto",
  },
] as const;

const GENDERS = [
  ["Male / 男", "男声"],
  ["Female / 女", "女声"],
] as const;

const AGES = [
  ["Child / 儿童", "儿童"],
  ["Teenager / 少年", "少年"],
  ["Young Adult / 青年", "青年"],
  ["Middle-aged / 中年", "中年"],
  ["Elderly / 老年", "老年"],
] as const;

const PITCHES = [
  ["Very Low Pitch / 极低音调", "极低"],
  ["Low Pitch / 低音调", "低"],
  ["Moderate Pitch / 中音调", "中"],
  ["High Pitch / 高音调", "高"],
  ["Very High Pitch / 极高音调", "极高"],
] as const;

const AUDIO_TAGS = [
  ["开心", "明亮愉快"],
  ["兴奋", "更有能量"],
  ["悲伤", "低沉克制"],
  ["愤怒", "强烈有力"],
  ["担心", "紧张忧虑"],
  ["害怕", "提高紧张感"],
  ["惊讶", "突然抬高语调"],
  ["好奇", "带探索感"],
  ["自信", "坚定沉稳"],
  ["严肃", "正式克制"],
  ["平静", "平稳自然"],
  ["温柔", "柔和轻缓"],
  ["小声", "耳语风格"],
  ["大声", "增强语势"],
  ["神秘", "低声耳语"],
  ["轻笑", "轻快模拟"],
  ["大笑", "强起伏模拟"],
  ["叹气", "放慢变沉"],
  ["慢速", "放慢这一句"],
  ["快速", "加快这一句"],
] as const;

function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `约 ${minutes} 分 ${remainder} 秒`;
}

export default function OmniVoiceStudio({ sourceText }: { sourceText?: string }) {
  const [text, setText] = useState(sourceText?.slice(0, MAX_CHARACTERS) || DEFAULT_TEXT);
  const [speed, setSpeed] = useState(1);
  const [steps, setSteps] = useState(8);
  const [guidance, setGuidance] = useState(1.3);
  const [denoise, setDenoise] = useState(false);
  const [gender, setGender] = useState("Male / 男");
  const [age, setAge] = useState("Middle-aged / 中年");
  const [pitch, setPitch] = useState("Moderate Pitch / 中音调");
  const [style, setStyle] = useState("Auto");
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
  const estimatedDuration = Math.max(2, Math.round(wordCount / (2.25 * speed)));
  const tagCount = useMemo(
    () => (text.match(/[\[【][^\]】\r\n]{1,30}[\]】]/gu) ?? []).length,
    [text],
  );

  useEffect(() => {
    if (sourceText !== undefined) {
      setText(sourceText.slice(0, MAX_CHARACTERS));
      setError(
        sourceText.length > MAX_CHARACTERS
          ? `OmniVoice 公共 GPU 单次最多 ${MAX_CHARACTERS} 个字符，已自动同步前 ${MAX_CHARACTERS} 个字符。`
          : "",
      );
      resetAudio();
    }
  }, [sourceText]);

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

  function changeSetting(action: () => void) {
    action();
    setError("");
    resetAudio();
  }

  function copyFromMainStudio() {
    if (!sourceText?.trim()) {
      setError("上方播音工作台目前没有稿件。");
      return;
    }
    const copied = sourceText.slice(0, MAX_CHARACTERS);
    setText(copied);
    setError(
      sourceText.length > MAX_CHARACTERS
        ? `OmniVoice 公共 GPU 单次最多 ${MAX_CHARACTERS} 个字符，已自动复制前 ${MAX_CHARACTERS} 个字符。`
        : "",
    );
    resetAudio();
  }

  function insertAudioTag(tag: string) {
    const textarea = textareaRef.current;
    const token = `[${tag}]`;
    if (!textarea) {
      setText((current) => `${current}${current ? " " : ""}${token}`.slice(0, MAX_CHARACTERS));
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

    const next = `${prefix}${insertion}${suffix}`;
    if (next.length > MAX_CHARACTERS) {
      setError(`OmniVoice 文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }
    setText(next);
    setError("");
    resetAudio();

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = prefix.length + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function generate() {
    const cleanText = text.trim();
    if (!cleanText) {
      setError("请先输入哈萨克语文本。");
      return;
    }
    if (cleanText.length > MAX_CHARACTERS) {
      setError(`OmniVoice 文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }
    if (tagCount > 3) {
      setError("OmniVoice 共享 GPU 较慢，每次最多使用 3 个句尾情绪标签。");
      return;
    }

    setIsGenerating(true);
    setError("");
    resetAudio();
    try {
      const response = await fetch("/api/omnivoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          speed,
          steps,
          guidance,
          denoise,
          gender,
          age,
          pitch,
          style,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "OmniVoice 生成失败，请稍后再试。");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("OmniVoice 没有返回音频。");
      const nextUrl = URL.createObjectURL(blob);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setGeneratedAt(
        new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OmniVoice 免费服务暂时不可用。");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="hero" id="omnivoice" style={{ paddingTop: 0 }}>
      <div className="hero-copy">
        <div className="eyebrow">
          <span>FREE 02</span>
          <span className="eyebrow-line" />
          <span>OMNIVOICE</span>
        </div>
        <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5.2rem)" }}>
          第二个免费板块，
          <em>可设计声线。</em>
        </h1>
        <p className="hero-description">
          基于 shyngys879 的 KazakhTTS-OmniVoice 公共 Demo。无需 ElevenLabs 额度，可以直接设计男声或女声、年龄、音高、耳语风格，并调节倍速、质量和推理强度。
        </p>
        <div className="feature-row" aria-label="OmniVoice 功能">
          <span>免费共享 GPU</span>
          <span>男 / 女声设计</span>
          <span>年龄 / 音高</span>
          <span>0.70×–1.20×</span>
          <span>句尾情绪标签</span>
          <span>WAV 下载</span>
        </div>
        <div className="broadcast-note">
          <div className="broadcast-index">GPU</div>
          <div>
            <strong>这是公共 Hugging Face 共享 GPU</strong>
            <p>已默认启用 8 步极速档。公共 GPU 仍可能冷启动或排队；不加情绪标签时最快。</p>
          </div>
        </div>
      </div>

      <section className="studio-card" aria-labelledby="omnivoice-title">
        <div className="studio-head">
          <div>
            <p className="section-kicker">FREE STUDIO 02</p>
            <h2 id="omnivoice-title">KazakhTTS · OmniVoice</h2>
          </div>
          <div className="format-badge">WAV</div>
        </div>

        <div className="field-block">
          <div className="field-label-row">
            <label htmlFor="omnivoice-text">哈萨克语稿件</label>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="text-action" type="button" onClick={copyFromMainStudio}>
                复制上方稿件
              </button>
              <button className="text-action" type="button" onClick={() => changeSetting(() => setText(""))}>
                清空
              </button>
            </div>
          </div>
          <div className="textarea-wrap">
            <textarea
              ref={textareaRef}
              id="omnivoice-text"
              value={text}
              maxLength={MAX_CHARACTERS}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError("");
                resetAudio();
              }}
              placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
              spellCheck={false}
            />
            <div className="textarea-footer">
              <span>{wordCount ? `${wordCount} 个词 · ${formatDuration(estimatedDuration)}` : "等待输入"}</span>
              <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS.toLocaleString("zh-CN")}
              </span>
            </div>
          </div>
        </div>

        <fieldset className="field-block">
          <legend>声线设计预设</legend>
          <div className="preset-grid">
            {VOICE_PRESETS.map((item) => (
              <button
                className="preset"
                type="button"
                key={item.label}
                onClick={() =>
                  changeSetting(() => {
                    setGender(item.gender);
                    setAge(item.age);
                    setPitch(item.pitch);
                    setStyle(item.style);
                  })
                }
              >
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>自定义声线</legend>
          <div className="textarea-wrap" style={{ padding: "16px 17px" }}>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>性别</strong>
              <select
                value={gender}
                onChange={(event) => changeSetting(() => setGender(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {GENDERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>年龄</strong>
              <select
                value={age}
                onChange={(event) => changeSetting(() => setAge(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {AGES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>音高</strong>
              <select
                value={pitch}
                onChange={(event) => changeSetting(() => setPitch(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {PITCHES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <button
              className={style === "Whisper / 耳语" ? "preset selected" : "preset"}
              type="button"
              onClick={() => changeSetting(() => setStyle((current) => current === "Auto" ? "Whisper / 耳语" : "Auto"))}
              aria-pressed={style === "Whisper / 耳语"}
              style={{ width: "100%" }}
            >
              <strong>耳语风格：{style === "Whisper / 耳语" ? "开启" : "关闭"}</strong>
              <small>OmniVoice 原生 Voice Design 风格</small>
            </button>
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>倍速调节</legend>
          <div className="textarea-wrap" style={{ padding: "16px 17px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ minWidth: 48, fontWeight: 700, fontSize: 15 }}>{speed.toFixed(2)}×</span>
              <input
                aria-label="OmniVoice 倍速"
                type="range"
                min="0.7"
                max="1.2"
                step="0.01"
                value={speed}
                onChange={(event) => changeSetting(() => setSpeed(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
            </div>
            <div className="preset-grid" style={{ marginTop: 14 }}>
              {SPEED_PRESETS.map((item) => (
                <button
                  className={Math.abs(speed - item) < 0.001 ? "preset selected" : "preset"}
                  type="button"
                  key={item}
                  onClick={() => changeSetting(() => setSpeed(item))}
                >
                  <strong>{item.toFixed(1)}×</strong>
                  <small>{item < 1 ? "更慢" : item > 1 ? "更快" : "原速"}</small>
                </button>
              ))}
            </div>
            <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
              <span>精细步进 0.01×</span>
              <span>0.70× – 1.20×</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>质量与表现力</legend>
          <div className="preset-grid">
            {QUALITY_PRESETS.map((item) => (
              <button
                className={steps === item.steps && Math.abs(guidance - item.guidance) < 0.01 ? "preset selected" : "preset"}
                type="button"
                key={item.id}
                onClick={() =>
                  changeSetting(() => {
                    setSteps(item.steps);
                    setGuidance(item.guidance);
                  })
                }
              >
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
          <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <strong>推理步数</strong>
                <span>{steps}</span>
              </div>
              <input
                aria-label="OmniVoice 推理步数"
                type="range"
                min="8"
                max="40"
                step="1"
                value={steps}
                onChange={(event) => changeSetting(() => setSteps(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
              <small>8 步最快；步数越高通常越细腻，但共享 GPU 等待时间也会明显增加</small>
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <strong>Guidance Scale</strong>
                <span>{guidance.toFixed(1)}</span>
              </div>
              <input
                aria-label="OmniVoice Guidance Scale"
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={guidance}
                onChange={(event) => changeSetting(() => setGuidance(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
              <small>控制模型对声线设计条件的遵循强度；极速默认 1.3</small>
            </label>
            <button
              className={denoise ? "preset selected" : "preset"}
              type="button"
              onClick={() => changeSetting(() => setDenoise((current) => !current))}
              aria-pressed={denoise}
              style={{ width: "100%" }}
            >
              <strong>Denoise：{denoise ? "开启" : "关闭"}</strong>
              <small>关闭更快；需要更干净的高质量结果时再开启</small>
            </button>
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>情绪与表演标签</legend>
          <div className="preset-grid">
            {AUDIO_TAGS.map(([label, note]) => (
              <button className="preset" type="button" key={label} onClick={() => insertAudioTag(label)}>
                <strong>[{label}]</strong>
                <small>{note}</small>
              </button>
            ))}
          </div>
          <div className="broadcast-note" style={{ marginTop: 14 }}>
            <div className="broadcast-index">[ ]</div>
            <div>
              <strong>同样写在句子后面，控制前面的那一句</strong>
              <p>
                例如：Бүгін жақсы жаңалық бар! [开心]。每个情绪标签都会增加一次独立 GPU 推理；追求速度时建议先不加标签，最终成稿再添加。一次最多 3 个标签。
              </p>
            </div>
          </div>
        </fieldset>

        <div className="broadcast-note">
          <div className="broadcast-index">OV</div>
          <div>
            <strong>OmniVoice · 第二免费引擎</strong>
            <p>
              不需要 ElevenLabs Key 或额度。Voice Design 是模型原生能力；“开心、悲伤、严肃”等中文标签由网站映射到速度、音高和 Whisper 风格进行句子级模拟。
            </p>
          </div>
        </div>

        {error ? (
          <div className="error-message" role="alert">
            <span>!</span>
            {error}
          </div>
        ) : null}

        <button className="generate-button" type="button" onClick={generate} disabled={!text.trim() || isGenerating}>
          <span className="button-icon" aria-hidden="true">
            {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
          </span>
          <span>
            <strong>{isGenerating ? "OmniVoice 共享 GPU 正在生成…" : `生成 OmniVoice · ${speed.toFixed(2)}×`}</strong>
            <small>
              {isGenerating
                ? "极速档通常更快；公共 GPU 排队时仍可能需要数分钟"
                : `声线设计 + 倍速 + 质量 + 情绪标签 · 当前 ${steps} 步`}
            </small>
          </span>
          <span className="button-arrow" aria-hidden="true">→</span>
        </button>

        <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
          <div className="result-topline">
            <div>
              <span className="result-dot" />
              <strong>{audioUrl ? "OmniVoice 音频已生成" : "OmniVoice 音频播放器"}</strong>
            </div>
            {generatedAt ? <time>{generatedAt}</time> : <span>等待生成</span>}
          </div>
          {audioUrl ? (
            <div className="audio-ready">
              <audio controls src={audioUrl} preload="metadata">您的浏览器不支持音频播放。</audio>
              <a className="download-link" href={audioUrl} download="qazaq-omnivoice.wav">
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
              <p>第二免费引擎生成后，播放器会出现在这里</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
